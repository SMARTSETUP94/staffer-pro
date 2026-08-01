import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import {
  addDays, differenceInCalendarDays, format, parseISO, startOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarClock, Loader2, Moon, MapPin, Search } from "lucide-react";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  fenetre: fallback(z.string(), "1m").default("1m"),
  type: fallback(z.string(), "tous").default("tous"),
  statut: fallback(z.string(), "tous").default("tous"),
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_app/echeances")({
  validateSearch: zodValidator(searchSchema),
  beforeLoad: () => requireCapability("section.affaires"),
  component: EcheancesPage,
});

type AffaireRow = {
  id: string;
  numero: string | null;
  nom: string | null;
  client: string | null;
  lieu: string | null;
  statut: string | null;
  phase: string | null;
  date_montage: string | null;
  date_demontage: string | null;
  montage_nb_techniciens: number | null;
  montage_travail_nuit: boolean | null;
  montage_nb_semi: number | null;
  montage_nb_20m3: number | null;
  montage_nature_prestation: string | null;
  montage_notes: string | null;
};

type Operation = {
  key: string;
  affaire: AffaireRow;
  type: "montage" | "demontage";
  dateDebut: string;
  dateFin: string | null;
};

const WINDOWS: Record<string, { label: string; days: number }> = {
  "14j": { label: "14 jours", days: 14 },
  "1m": { label: "1 mois", days: 31 },
  "3m": { label: "3 mois", days: 92 },
};

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function countdownLabel(dateStr: string, today: Date): { text: string; past: boolean } {
  const diff = differenceInCalendarDays(parseISO(dateStr), today);
  if (diff === 0) return { text: "Aujourd'hui", past: false };
  if (diff > 0) return { text: `J−${diff}`, past: false };
  return { text: `J+${Math.abs(diff)}`, past: true };
}

function formatRange(debut: string, fin: string | null): string {
  const d = parseISO(debut);
  if (!fin || fin === debut) return format(d, "d MMMM", { locale: fr });
  const f = parseISO(fin);
  const sameMonth = d.getMonth() === f.getMonth();
  return sameMonth
    ? `${format(d, "d", { locale: fr })} → ${format(f, "d MMMM", { locale: fr })}`
    : `${format(d, "d MMM", { locale: fr })} → ${format(f, "d MMM", { locale: fr })}`;
}

function EcheancesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/echeances" });
  const [rows, setRows] = useState<AffaireRow[]>([]);
  const [sansDate, setSansDate] = useState(0);
  const [loading, setLoading] = useState(true);

  const fenetre = WINDOWS[search.fenetre] ? search.fenetre : "1m";
  const today = useMemo(() => new Date(new Date().toDateString()), []);
  const from = iso(today);
  const to = iso(addDays(today, WINDOWS[fenetre].days));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const cols =
        "id, numero, nom, client, lieu, statut, phase, date_montage, date_demontage, montage_nb_techniciens, montage_travail_nuit, montage_nb_semi, montage_nb_20m3, montage_nature_prestation, montage_notes";
      const [{ data }, { count }] = await Promise.all([
        supabase
          .from("affaires")
          .select(cols)
          .is("archived_at", null)
          .neq("statut", "annule")
          .or(`and(date_montage.gte.${from},date_montage.lte.${to}),and(date_demontage.gte.${from},date_demontage.lte.${to})`)
          .order("date_montage", { ascending: true }),
        supabase
          .from("affaires")
          .select("id", { count: "exact", head: true })
          .is("archived_at", null)
          .neq("statut", "annule")
          .is("date_montage", null),
      ]);
      if (cancelled) return;
      setRows((data ?? []) as unknown as AffaireRow[]);
      setSansDate(count ?? 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const isProspect = (a: AffaireRow) => a.phase === "opportunite" || a.statut === "prospect";

  const operations = useMemo<Operation[]>(() => {
    const out: Operation[] = [];
    for (const a of rows) {
      if (a.date_montage && a.date_montage >= from && a.date_montage <= to) {
        const fin =
          a.date_demontage && a.date_demontage !== a.date_montage ? a.date_demontage : null;
        out.push({ key: `${a.id}-m`, affaire: a, type: "montage", dateDebut: a.date_montage, dateFin: fin });
      }
      if (a.date_demontage && a.date_demontage >= from && a.date_demontage <= to) {
        out.push({ key: `${a.id}-d`, affaire: a, type: "demontage", dateDebut: a.date_demontage, dateFin: null });
      }
    }
    const q = search.q.trim().toLowerCase();
    return out
      .filter((op) => (search.type === "tous" ? true : op.type === search.type))
      .filter((op) => {
        if (search.statut === "tous") return true;
        const p = isProspect(op.affaire);
        return search.statut === "prospect" ? p : !p;
      })
      .filter((op) => {
        if (!q) return true;
        const a = op.affaire;
        return [a.numero, a.nom, a.client, a.lieu]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      })
      .sort((x, y) => x.dateDebut.localeCompare(y.dateDebut));
  }, [rows, from, to, search.type, search.statut, search.q]);

  const groups = useMemo(() => {
    const map = new Map<string, Operation[]>();
    for (const op of operations) {
      const lundi = iso(startOfWeek(parseISO(op.dateDebut), { weekStartsOn: 1 }));
      const list = map.get(lundi) ?? [];
      list.push(op);
      map.set(lundi, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [operations]);

  const nbNuits = operations.filter((o) => o.affaire.montage_travail_nuit).length;
  const nbProspects = operations.filter((o) => isProspect(o.affaire)).length;

  const setParam = (patch: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }) });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pilotage / Échéances"
        title="Échéances"
        description="Ce qui part sur site dans les prochaines semaines."
      />

      {/* Compteurs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Counter label="Opérations" value={operations.length} sub={`sur ${WINDOWS[fenetre].label}`} />
        <Counter label="Dont de nuit" value={nbNuits} />
        <Counter label="Prospects à confirmer" value={nbProspects} tone={nbProspects > 0 ? "warn" : undefined} />
        <Counter
          label="Affaires sans date de montage"
          value={sansDate}
          sub="invisibles de ce planning"
          tone={sansDate > 0 ? "warn" : undefined}
        />
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-border p-0.5">
          {Object.entries(WINDOWS).map(([k, w]) => (
            <button
              key={k}
              onClick={() => setParam({ fenetre: k })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold",
                fenetre === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>

        <Segmented
          value={search.type}
          onChange={(v) => setParam({ type: v })}
          options={[
            { v: "tous", label: "Tous types" },
            { v: "montage", label: "Montage" },
            { v: "demontage", label: "Démontage" },
          ]}
        />

        <Segmented
          value={search.statut}
          onChange={(v) => setParam({ statut: v })}
          options={[
            { v: "tous", label: "Tous statuts" },
            { v: "confirme", label: "Confirmé" },
            { v: "prospect", label: "Prospect" },
          ]}
        />

        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search.q}
            onChange={(e) => setParam({ q: e.target.value })}
            placeholder="Numéro, nom, client, lieu…"
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Aucune opération planifiée sur cette fenêtre.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Renseignez les dates de montage sur vos affaires pour les voir apparaître ici.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([lundi, ops]) => (
            <section key={lundi}>
              <p className="overline mb-2 text-muted-foreground">
                — Semaine du {format(parseISO(lundi), "d MMMM yyyy", { locale: fr })} · {ops.length} opération
                {ops.length > 1 ? "s" : ""}
              </p>
              <div className="space-y-2">
                {ops.map((op) => (
                  <OperationRow key={op.key} op={op} today={today} prospect={isProspect(op.affaire)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Counter({
  label, value, sub, tone,
}: { label: string; value: number; sub?: string; tone?: "warn" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", tone === "warn" && "text-amber-600 dark:text-amber-400")}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Segmented({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: { v: string; label: string }[] }) {
  return (
    <div className="inline-flex rounded-xl border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-semibold",
            value === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function OperationRow({ op, today, prospect }: { op: Operation; today: Date; prospect: boolean }) {
  const navigate = useNavigate();
  const a = op.affaire;
  const cd = countdownLabel(op.dateDebut, today);
  const moyens = [
    a.montage_nb_techniciens ? `${a.montage_nb_techniciens} technicien${a.montage_nb_techniciens > 1 ? "s" : ""}` : null,
    a.montage_nb_semi ? `${a.montage_nb_semi} semi` : null,
    a.montage_nb_20m3 ? `${a.montage_nb_20m3} × 20 m³` : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/affaires/$affaireId", params: { affaireId: a.id } })}
      className="flex w-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-muted/40 sm:flex-row sm:items-start sm:gap-4"
    >
      <div className="flex shrink-0 items-center gap-3 sm:w-48 sm:flex-col sm:items-start sm:gap-1">
        <span className="text-sm font-semibold">{formatRange(op.dateDebut, op.dateFin)}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-bold",
            cd.past ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
          )}
        >
          {cd.text}
        </span>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold",
              op.type === "montage"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-sky-500/15 text-sky-700 dark:text-sky-400",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", op.type === "montage" ? "bg-emerald-500" : "bg-sky-500")} />
            {op.type === "montage" ? "Montage" : "Démontage"}
          </span>
          {prospect ? (
            <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400">
              Prospect
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Confirmé</Badge>
          )}
          {a.montage_travail_nuit && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
              <Moon className="h-3.5 w-3.5" /> Nuit
            </span>
          )}
        </div>

        <p className="truncate text-sm font-semibold">
          {a.numero ? <span className="text-muted-foreground">{a.numero} · </span> : null}
          {a.nom ?? "Sans nom"}
          {a.client ? <span className="font-normal text-muted-foreground"> — {a.client}</span> : null}
        </p>

        {moyens.length > 0 && (
          <p className="text-xs text-muted-foreground">{moyens.join(" · ")}</p>
        )}
        {a.montage_nature_prestation && <p className="text-xs">{a.montage_nature_prestation}</p>}
        {a.montage_notes && <p className="text-xs italic text-muted-foreground">{a.montage_notes}</p>}
        {a.lieu && (
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {a.lieu}
          </p>
        )}
      </div>
    </button>
  );
}
