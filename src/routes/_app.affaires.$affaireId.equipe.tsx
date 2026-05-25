// v0.48 Bloc 5 — Onglet Équipe
// Sprint C / A2 : refonte vers "heures réelles" (validées / à valider /
// rejetées) par employé × phase × métier. L'historique d'assignation est
// déplacé dans un panneau secondaire "Mobilisation" en bas de page.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Users,
  Crown,
  AlertCircle,
  UserMinus,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  XOctagon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requireCapability } from "@/lib/capability-guard";
import { cn } from "@/lib/utils";
import { useMetiers } from "@/hooks/use-metiers";
import { getAffaireHeuresReelles } from "@/server/affaire-heures-reelles.functions";
import type { HeuresReellesRow } from "@/server/affaire-heures-reelles.functions";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface MobRow {
  employe_id: string;
  chef_id: string;
  type_contrat: string | null;
  nb_demi_jours: number;
  nb_jours_distincts: number;
  premier_jour: string | null;
  dernier_jour: string | null;
  presence_pct_moyen: number;
  a_refuse: boolean;
  a_ete_absent: boolean;
  derniere_assignation_at: string | null;
  employe?: { id: string; nom: string; prenom: string; poste_principal: string | null };
  chef?: { id: string; nom: string; prenom: string };
}

export const Route = createFileRoute("/_app/affaires/$affaireId/equipe")({
  head: () => ({ meta: [{ title: "Équipe — Setup Paris" }] }),
  beforeLoad: () => requireCapability("affaire.equipe.view"),
  component: AffaireEquipePage,
});

const PHASE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Toutes phases" },
  { value: "fab_bois", label: "Fab. bois" },
  { value: "fab_metal", label: "Fab. métal" },
  { value: "fab_peint", label: "Peinture" },
  { value: "fab_tap", label: "Tapisserie" },
  { value: "fab_num", label: "Numérique" },
  { value: "fab_be", label: "BE" },
  { value: "fab_manut", label: "Manutention" },
  { value: "_none", label: "(non renseigné)" },
];

function AffaireEquipePage() {
  const { affaireId } = Route.useParams();
  const { metiers, byId } = useMetiers();

  // ── A2 — Heures réelles ─────────────────────────────────────────────
  const fetchHeures = useServerFn(getAffaireHeuresReelles);
  const {
    data: heuresRows,
    isLoading: loadingHeures,
  } = useQuery({
    queryKey: ["affaire-heures-reelles", affaireId],
    queryFn: () => fetchHeures({ data: { affaireId } }),
  });

  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [metierFilter, setMetierFilter] = useState<number | "all">("all");
  const [sortBy, setSortBy] = useState<"validees" | "soumises" | "nom">("validees");
  const [drawerEmp, setDrawerEmp] = useState<string | null>(null);

  const filteredHeures = useMemo(() => {
    const all = (heuresRows ?? []) as HeuresReellesRow[];
    return all.filter((r) => {
      if (phaseFilter !== "all") {
        if (phaseFilter === "_none") {
          if (r.phase) return false;
        } else if (r.phase !== phaseFilter) return false;
      }
      if (metierFilter !== "all" && r.metier_id !== metierFilter) return false;
      return true;
    });
  }, [heuresRows, phaseFilter, metierFilter]);

  // Agrégation par employé (somme tous phases/métiers filtrés).
  type EmpAgg = {
    employe_id: string;
    nom: string;
    prenom: string;
    type_contrat: string | null;
    validees: number;
    soumises: number;
    rejetees: number;
  };
  const empAggs = useMemo(() => {
    const map = new Map<string, EmpAgg>();
    for (const r of filteredHeures) {
      const cur = map.get(r.employe_id) ?? {
        employe_id: r.employe_id,
        nom: r.nom,
        prenom: r.prenom,
        type_contrat: r.type_contrat,
        validees: 0,
        soumises: 0,
        rejetees: 0,
      };
      cur.validees += r.validees;
      cur.soumises += r.soumises;
      cur.rejetees += r.rejetees;
      map.set(r.employe_id, cur);
    }
    const out = Array.from(map.values());
    out.sort((a, b) => {
      if (sortBy === "validees") return b.validees - a.validees;
      if (sortBy === "soumises") return b.soumises - a.soumises;
      return `${a.nom}${a.prenom}`.localeCompare(`${b.nom}${b.prenom}`, "fr");
    });
    return out;
  }, [filteredHeures, sortBy]);

  const totalVal = empAggs.reduce((s, e) => s + e.validees, 0);
  const totalSou = empAggs.reduce((s, e) => s + e.soumises, 0);
  const totalRej = empAggs.reduce((s, e) => s + e.rejetees, 0);

  // ── Panneau secondaire — Mobilisation rétrospective ────────────────
  const [mobRows, setMobRows] = useState<MobRow[]>([]);
  const [loadingMob, setLoadingMob] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMob(true);
      const { data: histo } = await supabase
        .from("affaire_equipe_historique")
        .select(
          "employe_id, chef_id, type_contrat, nb_demi_jours, nb_jours_distincts, premier_jour, dernier_jour, presence_pct_moyen, a_refuse, a_ete_absent, derniere_assignation_at",
        )
        .eq("affaire_id", affaireId);
      const ids = Array.from(
        new Set([
          ...((histo ?? []) as { employe_id: string }[]).map((r) => r.employe_id),
          ...((histo ?? []) as { chef_id: string }[]).map((r) => r.chef_id),
        ]),
      );
      const { data: emps } = ids.length
        ? await supabase
            .from("employes")
            .select("id, nom, prenom, poste_principal")
            .in("id", ids)
        : { data: [] as { id: string; nom: string; prenom: string; poste_principal: string | null }[] };
      const empMap = new Map(
        (emps ?? []).map((e) => [e.id, e] as const),
      );
      if (cancelled) return;
      setMobRows(
        ((histo ?? []) as MobRow[]).map((r) => ({
          ...r,
          employe: empMap.get(r.employe_id),
          chef: empMap.get(r.chef_id),
        })),
      );
      setLoadingMob(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [affaireId]);

  const chefsUniques = useMemo(() => {
    const map = new Map<string, { id: string; nom: string; prenom: string }>();
    for (const r of mobRows) if (r.chef) map.set(r.chef.id, r.chef);
    return Array.from(map.values());
  }, [mobRows]);

  // ── Drawer détail employé ───────────────────────────────────────────
  const drawerLines = useMemo(() => {
    if (!drawerEmp) return [];
    return (heuresRows ?? []).filter((r) => r.employe_id === drawerEmp);
  }, [heuresRows, drawerEmp]);

  return (
    <div className="space-y-6">
      {/* Bloc 1 — Heures réelles */}
      <section className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Validées"
            value={totalVal.toFixed(1)}
            unit="h"
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="ok"
          />
          <Stat
            label="À valider"
            value={totalSou.toFixed(1)}
            unit="h"
            icon={<Clock className="h-4 w-4" />}
            tone={totalSou > 0 ? "warn" : "neutral"}
          />
          <Stat
            label="Rejetées"
            value={totalRej.toFixed(1)}
            unit="h"
            icon={<XOctagon className="h-4 w-4" />}
            tone={totalRej > 0 ? "warn" : "neutral"}
          />
          <Stat label="Personnes" value={empAggs.length} icon={<Users className="h-4 w-4" />} />
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Phase</label>
            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            >
              {PHASE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Métier</label>
            <select
              value={metierFilter === "all" ? "all" : String(metierFilter)}
              onChange={(e) =>
                setMetierFilter(e.target.value === "all" ? "all" : Number(e.target.value))
              }
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            >
              <option value="all">Tous métiers</option>
              {metiers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.libelle}
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
            <SortBtn active={sortBy === "validees"} onClick={() => setSortBy("validees")}>
              <ArrowUpDown className="mr-1 h-3 w-3" /> Validées
            </SortBtn>
            <SortBtn active={sortBy === "soumises"} onClick={() => setSortBy("soumises")}>
              À valider
            </SortBtn>
            <SortBtn active={sortBy === "nom"} onClick={() => setSortBy("nom")}>
              Nom
            </SortBtn>
          </div>
        </div>

        {loadingHeures ? (
          <div className="flex min-h-[20vh] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : empAggs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
            <Clock className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-semibold text-foreground">Aucune heure saisie</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Dès qu'une personne saisit ses heures sur ce chantier, elles
              apparaîtront ici, ventilées par phase et métier.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Employé</th>
                  <th className="px-3 py-2 text-left font-semibold">Contrat</th>
                  <th className="px-3 py-2 text-right font-semibold">Validées</th>
                  <th className="px-3 py-2 text-right font-semibold">À valider</th>
                  <th className="px-3 py-2 text-right font-semibold">Rejetées</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {empAggs.map((e) => {
                  const total = e.validees + e.soumises;
                  return (
                    <tr
                      key={e.employe_id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => setDrawerEmp(e.employe_id)}
                    >
                      <td className="px-3 py-2 font-semibold text-foreground">
                        {e.prenom} {e.nom}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {e.type_contrat ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 font-semibold",
                              e.type_contrat === "CDI" &&
                                "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                              e.type_contrat === "CDD" &&
                                "bg-sky-500/15 text-sky-700 dark:text-sky-400",
                              e.type_contrat === "Intérim" &&
                                "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                            )}
                          >
                            {e.type_contrat}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {e.validees.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {e.soumises > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            {e.soumises.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {e.rejetees > 0 ? (
                          <span className="text-destructive">{e.rejetees.toFixed(1)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                        {total.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Bloc 2 — Mobilisation rétrospective (historique assignations) */}
      <section className="space-y-3 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-bold text-foreground">Mobilisation rétrospective</h2>
          <p className="text-xs text-muted-foreground">
            Personnes assignées au chantier (refus, absences, présence
            moyenne) — données alimentées automatiquement par l'historique
            d'assignations.
          </p>
        </div>
        {loadingMob ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : mobRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
            Aucune assignation historisée pour ce chantier.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Mobilisées"
                value={mobRows.length}
                icon={<Users className="h-4 w-4" />}
              />
              <Stat
                label="Chefs"
                value={chefsUniques.length}
                icon={<Crown className="h-4 w-4" />}
              />
              <Stat
                label="Refus"
                value={mobRows.filter((r) => r.a_refuse).length}
                icon={<AlertCircle className="h-4 w-4" />}
                tone={mobRows.some((r) => r.a_refuse) ? "warn" : "neutral"}
              />
              <Stat
                label="Absences"
                value={mobRows.filter((r) => r.a_ete_absent).length}
                icon={<UserMinus className="h-4 w-4" />}
                tone={mobRows.some((r) => r.a_ete_absent) ? "warn" : "neutral"}
              />
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Employé</th>
                    <th className="px-3 py-2 text-right font-semibold">½ jours</th>
                    <th className="px-3 py-2 text-right font-semibold">Jours</th>
                    <th className="px-3 py-2 text-right font-semibold">Présence</th>
                    <th className="px-3 py-2 text-center font-semibold">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mobRows.map((r) => (
                    <tr key={r.employe_id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link
                          to="/admin/employes-poste-principal"
                          className="font-semibold text-foreground hover:text-primary"
                        >
                          {r.employe?.prenom} {r.employe?.nom}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {r.nb_demi_jours}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {r.nb_jours_distincts}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {Math.round(Number(r.presence_pct_moyen))}%
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {r.a_refuse && (
                            <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                              REFUS
                            </span>
                          )}
                          {r.a_ete_absent && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                              ABS
                            </span>
                          )}
                          {!r.a_refuse && !r.a_ete_absent && (
                            <span className="text-[10px] text-muted-foreground">OK</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Drawer détail — saisies par phase × métier */}
      <Sheet open={drawerEmp !== null} onOpenChange={(o) => !o && setDrawerEmp(null)}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Détail des heures</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {drawerLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune saisie.</p>
            ) : (
              drawerLines.map((l, i) => {
                const m = l.metier_id != null ? byId(l.metier_id) : null;
                const phaseLabel =
                  PHASE_OPTIONS.find((p) => p.value === l.phase)?.label ??
                  (l.phase ?? "(non renseigné)");
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-card p-3 text-sm"
                  >
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">{phaseLabel}</span>
                      <span className="text-muted-foreground">{m?.libelle ?? "—"}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Validées</div>
                        <div className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                          {l.validees.toFixed(1)}h
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">À valider</div>
                        <div className="font-mono font-semibold text-amber-700 dark:text-amber-400">
                          {l.soumises.toFixed(1)}h
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Rejetées</div>
                        <div className="font-mono font-semibold text-destructive">
                          {l.rejetees.toFixed(1)}h
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  unit?: string;
  icon: React.ReactNode;
  tone?: "neutral" | "warn" | "ok";
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-xl font-bold tabular-nums",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "ok" && "text-emerald-700 dark:text-emerald-400",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

function SortBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold transition",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
