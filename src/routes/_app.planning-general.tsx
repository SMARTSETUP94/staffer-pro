/**
 * /planning-general — Planning indicatif général des affaires par métier.
 *
 * Frise chronologique (semaines) : 1 ligne par métier planifié sous chaque
 * affaire. Aucun staffing nominatif : uniquement des dates début/fin.
 * Édition via dialogue par affaire (upsert idempotent sur
 * `affaire_planning_metier`).
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays, differenceInCalendarDays, format, parseISO, startOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarRange, Loader2, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { requireCapability } from "@/lib/capability-guard";
import {
  deletePlanningMetierRows,
  fetchPlanningGeneral,
  isProspectAffaire,
  upsertPlanningMetier,
  type AffaireLite,
  type MetierLite,
  type PlanningMetierRow,
} from "@/lib/planning-general";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  q: fallback(z.string().optional(), undefined),
  horizon: fallback(z.string().optional(), undefined),
  prospects: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute("/_app/planning-general")({
  validateSearch: zodValidator(searchSchema),
  beforeLoad: () => requireCapability("section.affaires"),
  head: () => ({
    meta: [
      { title: "Planning général — Staffing by Setup Paris" },
      { name: "description", content: "Planning indicatif des affaires par métier : dates de début et de fin par corps de métier." },
      { property: "og:title", content: "Planning général — Staffing by Setup Paris" },
      { property: "og:description", content: "Planning indicatif des affaires par métier." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanningGeneralPage,
});

const HORIZONS: Record<string, { label: string; days: number }> = {
  "3m": { label: "3 mois", days: 92 },
  "6m": { label: "6 mois", days: 183 },
  "12m": { label: "12 mois", days: 366 },
};

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function PlanningGeneralPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/planning-general" });
  const queryClient = useQueryClient();
  const [editAffaire, setEditAffaire] = useState<AffaireLite | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["planning-general"],
    queryFn: fetchPlanningGeneral,
    staleTime: 30_000,
  });

  const today = useMemo(() => new Date(new Date().toDateString()), []);
  const horizonParam = search.horizon ?? "3m";
  const horizon = HORIZONS[horizonParam] ? horizonParam : "3m";
  const from = useMemo(() => addDays(startOfWeek(today, { weekStartsOn: 1 }), -7), [today]);
  const to = useMemo(() => addDays(from, HORIZONS[horizon].days), [from, horizon]);
  const totalDays = differenceInCalendarDays(to, from) + 1;

  const weeks = useMemo(() => {
    const out: Date[] = [];
    for (let d = new Date(from); d <= to; d = addDays(d, 7)) out.push(d);
    return out;
  }, [from, to]);

  const planningsByAffaire = useMemo(() => {
    const map = new Map<string, PlanningMetierRow[]>();
    for (const p of data?.plannings ?? []) {
      const list = map.get(p.affaire_id) ?? [];
      list.push(p);
      map.set(p.affaire_id, list);
    }
    return map;
  }, [data?.plannings]);

  const metierById = useMemo(() => {
    const map = new Map<number, MetierLite>();
    for (const m of data?.metiers ?? []) map.set(m.id, m);
    return map;
  }, [data?.metiers]);

  const includeProspects = search.prospects === "1";

  const affaires = useMemo(() => {
    const q = (search.q ?? "").trim().toLowerCase();
    return (data?.affaires ?? [])
      .filter((a) => includeProspects || !isProspectAffaire(a))
      .filter((a) => {
        if (!q) return true;
        return [a.numero, a.nom, a.client]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      })
      .map((a) => {
        const plans = planningsByAffaire.get(a.id) ?? [];
        const ref = plans[0]?.date_debut ?? a.date_montage ?? "9999-12-31";
        return { affaire: a, plans, ref };
      })
      .sort((x, y) => x.ref.localeCompare(y.ref));
  }, [data?.affaires, planningsByAffaire, includeProspects, search.q]);

  const nbPlanned = useMemo(
    () => affaires.filter((a) => a.plans.length > 0).length,
    [affaires],
  );

  const pct = (dateStr: string) =>
    (differenceInCalendarDays(parseISO(dateStr), from) / totalDays) * 100;

  const setParam = (patch: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }) });

  const onSaved = async () => {
    setEditAffaire(null);
    await queryClient.invalidateQueries({ queryKey: ["planning-general"] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pilotage / Planning général"
        title="Planning général"
        description="Périodes indicatives par métier pour chaque affaire — sans affectation nominative."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Counter label="Affaires suivies" value={affaires.length} />
        <Counter label="Avec planning métier" value={nbPlanned} />
        <Counter
          label="Sans planning"
          value={affaires.length - nbPlanned}
          tone={affaires.length - nbPlanned > 0 ? "warn" : undefined}
        />
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-border p-0.5">
          {Object.entries(HORIZONS).map(([k, h]) => (
            <button
              key={k}
              onClick={() => setParam({ horizon: k })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold",
                horizon === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {h.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setParam({ prospects: includeProspects ? "0" : "1" })}
          className={cn(
            "rounded-xl border px-3 py-1.5 text-xs font-semibold",
            includeProspects
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          {includeProspects ? "Prospects inclus" : "Prospects masqués"}
        </button>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search.q ?? ""}
            onChange={(e) => setParam({ q: e.target.value })}
            placeholder="Numéro, nom, client…"
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <div className="min-w-[900px]">
            {/* En-tête semaines */}
            <div className="sticky top-0 z-10 flex border-b border-border bg-card/95 backdrop-blur">
              <div className="w-64 shrink-0 border-r border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Affaire
              </div>
              <div className="relative flex-1">
                <div className="flex">
                  {weeks.map((w) => (
                    <div
                      key={iso(w)}
                      className="shrink-0 border-r border-border/50 px-1 py-2 text-[10px] font-semibold text-muted-foreground"
                      style={{ width: `${(7 / totalDays) * 100}%` }}
                    >
                      {format(w, "d MMM", { locale: fr })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {affaires.length === 0 ? (
              <div className="p-10 text-center">
                <CalendarRange className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold">Aucune affaire sur ces critères.</p>
              </div>
            ) : (
              affaires.map(({ affaire, plans }) => (
                <div key={affaire.id} className="border-b border-border/60 last:border-b-0">
                  {/* Ligne affaire */}
                  <div className="flex items-center bg-muted/30">
                    <div className="flex w-64 shrink-0 items-center gap-2 border-r border-border px-4 py-1.5">
                      <Link
                        to="/affaires/$affaireId"
                        params={{ affaireId: affaire.id }}
                        className="min-w-0 flex-1 truncate text-xs font-semibold hover:text-primary"
                      >
                        {affaire.numero ? (
                          <span className="text-muted-foreground">{affaire.numero} · </span>
                        ) : null}
                        {affaire.nom ?? "Sans nom"}
                      </Link>
                      {isProspectAffaire(affaire) && (
                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-400">
                          PROSP.
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        aria-label={`Planifier les métiers de ${affaire.nom ?? "cette affaire"}`}
                        onClick={() => setEditAffaire(affaire)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="relative h-6 flex-1">
                      <TodayMarker from={from} to={to} totalDays={totalDays} />
                      {affaire.date_montage && (
                        <span
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-bold text-emerald-700 dark:text-emerald-400"
                          style={{ left: `${pct(affaire.date_montage)}%` }}
                          title={`Montage le ${format(parseISO(affaire.date_montage), "d MMM", { locale: fr })}`}
                        >
                          ▲
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Lignes métiers */}
                  {plans.length === 0 ? (
                    <div className="flex">
                      <div className="w-64 shrink-0 border-r border-border px-4 py-1 pl-8 text-[11px] italic text-muted-foreground">
                        Aucune période planifiée
                      </div>
                      <div className="relative h-5 flex-1">
                        <TodayMarker from={from} to={to} totalDays={totalDays} />
                      </div>
                    </div>
                  ) : (
                    plans.map((p) => {
                      const metier = metierById.get(p.metier_id);
                      const left = Math.max(0, pct(p.date_debut));
                      const right = Math.min(100, pct(p.date_fin) + 100 / totalDays);
                      const outside = right <= 0 || left >= 100;
                      return (
                        <div key={p.id} className="flex">
                          <div className="w-64 shrink-0 truncate border-r border-border px-4 py-1 pl-8 text-[11px] text-muted-foreground">
                            {metier?.libelle ?? `Métier ${p.metier_id}`}
                          </div>
                          <div className="relative h-6 flex-1">
                            <TodayMarker from={from} to={to} totalDays={totalDays} />
                            {!outside && (
                              <button
                                type="button"
                                onClick={() => setEditAffaire(affaire)}
                                aria-label={`${metier?.libelle ?? "Métier"} du ${format(parseISO(p.date_debut), "d MMM", { locale: fr })} au ${format(parseISO(p.date_fin), "d MMM", { locale: fr })}`}
                                className="absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full opacity-80 transition hover:opacity-100"
                                style={{
                                  left: `${left}%`,
                                  width: `${Math.max(0.8, right - left)}%`,
                                  backgroundColor: metier?.couleur ?? "hsl(var(--primary))",
                                }}
                                title={`${metier?.libelle} · ${format(parseISO(p.date_debut), "d MMM", { locale: fr })} → ${format(parseISO(p.date_fin), "d MMM", { locale: fr })}`}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {editAffaire && data && (
        <PlanifierMetiersDialog
          affaire={editAffaire}
          metiers={data.metiers}
          existing={planningsByAffaire.get(editAffaire.id) ?? []}
          onClose={() => setEditAffaire(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function TodayMarker({ from, to, totalDays }: { from: Date; to: Date; totalDays: number }) {
  const today = new Date(new Date().toDateString());
  if (today < from || today > to) return null;
  const left = (differenceInCalendarDays(today, from) / totalDays) * 100;
  return (
    <span
      className="pointer-events-none absolute bottom-0 top-0 w-px bg-primary/60"
      style={{ left: `${left}%` }}
    />
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", tone === "warn" && "text-amber-600 dark:text-amber-400")}>
        {value}
      </p>
    </div>
  );
}

interface DraftRow {
  enabled: boolean;
  date_debut: string;
  date_fin: string;
}

function PlanifierMetiersDialog({
  affaire, metiers, existing, onClose, onSaved,
}: {
  affaire: AffaireLite;
  metiers: MetierLite[];
  existing: PlanningMetierRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Map<number, DraftRow>>(() => {
    const map = new Map<number, DraftRow>();
    for (const m of metiers) {
      const found = existing.find((p) => p.metier_id === m.id);
      map.set(m.id, found
        ? { enabled: true, date_debut: found.date_debut, date_fin: found.date_fin }
        : { enabled: false, date_debut: affaire.date_montage ?? "", date_fin: affaire.date_montage ?? "" });
    }
    return map;
  });

  const patch = (metierId: number, p: Partial<DraftRow>) => {
    setRows((prev) => {
      const next = new Map(prev);
      next.set(metierId, { ...next.get(metierId)!, ...p });
      return next;
    });
  };

  const save = async () => {
    const toUpsert: Parameters<typeof upsertPlanningMetier>[0] = [];
    const toDelete: number[] = [];
    for (const [metierId, r] of rows) {
      if (r.enabled) {
        if (!r.date_debut || !r.date_fin) {
          toast.error("Dates manquantes", { description: "Chaque métier coché doit avoir une date de début et de fin." });
          return;
        }
        if (r.date_fin < r.date_debut) {
          toast.error("Dates incohérentes", { description: "La date de fin doit être après la date de début." });
          return;
        }
        toUpsert.push({ affaire_id: affaire.id, metier_id: metierId, date_debut: r.date_debut, date_fin: r.date_fin });
      } else if (existing.some((p) => p.metier_id === metierId)) {
        toDelete.push(metierId);
      }
    }
    setSaving(true);
    try {
      await upsertPlanningMetier(toUpsert);
      await deletePlanningMetierRows(affaire.id, toDelete);
      toast.success("Planning métier enregistré");
      await onSaved();
    } catch (e) {
      toast.error("Échec de l'enregistrement", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Planning métier — {affaire.numero ? `${affaire.numero} · ` : ""}{affaire.nom ?? "Affaire"}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {metiers.map((m) => {
            const r = rows.get(m.id)!;
            return (
              <div
                key={m.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-xl border p-3",
                  r.enabled ? "border-primary/40 bg-primary/5" : "border-border",
                )}
              >
                <label className="flex min-w-[160px] flex-1 items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => patch(m.id, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: m.couleur ?? "hsl(var(--primary))" }}
                  />
                  {m.libelle}
                </label>
                {r.enabled && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={r.date_debut}
                      onChange={(e) => patch(m.id, { date_debut: e.target.value })}
                      className="h-8 w-[150px] text-xs"
                      aria-label={`Début ${m.libelle}`}
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input
                      type="date"
                      value={r.date_fin}
                      onChange={(e) => patch(m.id, { date_fin: e.target.value })}
                      className="h-8 w-[150px] text-xs"
                      aria-label={`Fin ${m.libelle}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
