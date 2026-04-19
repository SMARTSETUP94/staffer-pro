import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMetiers } from "@/hooks/use-metiers";
import { MetierBadge } from "@/components/MetierBadge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ConsoLine {
  devis_id: string | null;
  devis_numero: string | null;
  metier_id: number | null;
  metier: string | null;
  couleur: string | null;
  heures_prevues: number | null;
  heures_assignees: number | null;
  heures_restantes: number | null;
  pct_consomme: number | null;
}

interface HeureReelleRow {
  metier_id: number;
  heures_reelles: number;
}

export const Route = createFileRoute("/_app/affaires/$affaireId/")({
  component: AffaireSynthesePage,
});

function AffaireSynthesePage() {
  const { affaireId } = Route.useParams();
  const { byId } = useMetiers();
  const [lines, setLines] = useState<ConsoLine[]>([]);
  const [reelles, setReelles] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: cons }, { data: aff }, { data: heures }] = await Promise.all([
        supabase
          .from("v_devis_consommation")
          .select("devis_id, devis_numero, metier_id, metier, couleur, heures_prevues, heures_assignees, heures_restantes, pct_consomme")
          .eq("affaire_id", affaireId),
        supabase.from("affaires").select("notes").eq("id", affaireId).maybeSingle(),
        // Heures réelles validées : on doit JOINdre via assignation.metier_id
        supabase
          .from("heures_saisies")
          .select("heures_reelles, statut, assignations(metier_id)")
          .eq("affaire_id", affaireId)
          .eq("statut", "valide"),
      ]);
      if (cancelled) return;
      setLines((cons ?? []) as ConsoLine[]);
      setNotes((aff?.notes as string | null) ?? null);

      // Aggrégation heures réelles par métier
      const map = new Map<number, number>();
      (heures ?? []).forEach((h: { heures_reelles: number | null; assignations: { metier_id: number } | null }) => {
        const mid = h.assignations?.metier_id;
        if (!mid) return;
        map.set(mid, (map.get(mid) ?? 0) + Number(h.heures_reelles ?? 0));
      });
      setReelles(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [affaireId]);

  const enriched = useMemo(() => {
    return lines.map((l) => {
      const prevues = Number(l.heures_prevues ?? 0);
      const assignees = Number(l.heures_assignees ?? 0);
      const reelles_h = (l.metier_id != null ? reelles.get(l.metier_id) : 0) ?? 0;
      const pctAssign = prevues > 0 ? (assignees / prevues) * 100 : 0;
      const pctReel = prevues > 0 ? (reelles_h / prevues) * 100 : 0;
      const ecart = prevues - reelles_h;
      // Statut marge basé sur (max(assignées, réelles) / prévues)
      const pctMax = Math.max(pctAssign, pctReel);
      let tone: "ok" | "warn" | "danger" = "ok";
      if (pctMax > 100) tone = "danger";
      else if (pctMax >= 85) tone = "warn";
      return { ...l, prevues, assignees, reelles_h, pctAssign, pctReel, ecart, tone };
    });
  }, [lines, reelles]);

  const totals = enriched.reduce(
    (acc, l) => {
      acc.prevues += l.prevues;
      acc.assignees += l.assignees;
      acc.reelles += l.reelles_h;
      return acc;
    },
    { prevues: 0, assignees: 0, reelles: 0 },
  );
  const pctAssignTotal = totals.prevues > 0 ? (totals.assignees / totals.prevues) * 100 : 0;
  const pctReelTotal = totals.prevues > 0 ? (totals.reelles / totals.prevues) * 100 : 0;
  const ecartTotal = totals.prevues - totals.reelles;

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Prévues" value={`${totals.prevues.toFixed(0)} h`} />
        <Stat
          label="Assignées"
          value={`${totals.assignees.toFixed(0)} h`}
          sub={`${pctAssignTotal.toFixed(0)}%`}
          tone={pctAssignTotal > 100 ? "danger" : pctAssignTotal >= 85 ? "warn" : "ok"}
        />
        <Stat
          label="Réelles validées"
          value={`${totals.reelles.toFixed(0)} h`}
          sub={`${pctReelTotal.toFixed(0)}%`}
          tone={pctReelTotal > 100 ? "danger" : pctReelTotal >= 85 ? "warn" : "ok"}
        />
        <Stat
          label="Marge restante"
          value={`${ecartTotal.toFixed(0)} h`}
          tone={ecartTotal < 0 ? "danger" : ecartTotal < totals.prevues * 0.15 ? "warn" : "ok"}
          icon={ecartTotal < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
        />
      </div>

      <section>
        <p className="overline mb-3">— Suivi marge par métier</p>
        {enriched.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Aucun poste de devis renseigné. Ajoutez un devis dans l'onglet Devis pour suivre la consommation.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3 text-left font-semibold">Métier</th>
                  <th className="p-3 text-right font-semibold">Prévues</th>
                  <th className="p-3 text-right font-semibold">Assignées</th>
                  <th className="p-3 text-right font-semibold">Réelles ✓</th>
                  <th className="p-3 text-right font-semibold">Écart</th>
                  <th className="p-3 text-center font-semibold">Marge</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((l, i) => {
                  const m = l.metier_id ? byId(l.metier_id) : undefined;
                  return (
                    <tr key={`${l.devis_id}-${l.metier_id}-${i}`} className="border-t hover:bg-muted/20">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {m && <MetierBadge libelle={m.libelle} couleur={m.couleur} />}
                          <span className="font-mono text-[10px] text-muted-foreground">{l.devis_numero}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono">{l.prevues.toFixed(1)}</td>
                      <td className="p-3 text-right font-mono">
                        {l.assignees.toFixed(1)}
                        <div className="text-[10px] text-muted-foreground">({l.pctAssign.toFixed(0)}%)</div>
                      </td>
                      <td className="p-3 text-right font-mono">
                        {l.reelles_h.toFixed(1)}
                        <div className="text-[10px] text-muted-foreground">({l.pctReel.toFixed(0)}%)</div>
                      </td>
                      <td className={cn(
                        "p-3 text-right font-mono font-semibold",
                        l.ecart < 0 ? "text-destructive" : l.ecart < l.prevues * 0.15 ? "text-warning" : "text-success",
                      )}>
                        {l.ecart >= 0 ? "+" : ""}{l.ecart.toFixed(1)} h
                      </td>
                      <td className="p-3 text-center">
                        <MargeBadge tone={l.tone} />
                        <Progress
                          value={Math.min(100, Math.max(l.pctAssign, l.pctReel))}
                          className={cn(
                            "mt-1.5 h-1.5",
                            l.tone === "danger" && "[&>*]:bg-destructive",
                            l.tone === "warn" && "[&>*]:bg-warning",
                            l.tone === "ok" && "[&>*]:bg-success",
                          )}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {notes && (
        <section>
          <p className="overline mb-2">— Notes affaire</p>
          <div className="whitespace-pre-wrap rounded-xl border border-border bg-card p-4 text-sm text-foreground">
            {notes}
          </div>
        </section>
      )}
    </div>
  );
}

function MargeBadge({ tone }: { tone: "ok" | "warn" | "danger" }) {
  if (tone === "danger") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">
        <AlertTriangle className="h-3 w-3" /> Dépass.
      </span>
    );
  }
  if (tone === "warn") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold uppercase text-warning">
        <AlertTriangle className="h-3 w-3" /> Tension
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold uppercase text-success">
      <CheckCircle2 className="h-3 w-3" /> OK
    </span>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
  icon?: React.ReactNode;
}) {
  const toneCls =
    tone === "danger" ? "text-destructive" :
    tone === "warn" ? "text-warning" :
    tone === "ok" ? "text-success" :
    "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className={cn("text-2xl font-bold tracking-tight", toneCls)}>{value}</p>
        {icon && <div className={toneCls}>{icon}</div>}
      </div>
      {sub && <p className={cn("text-xs font-semibold", toneCls)}>{sub}</p>}
    </div>
  );
}
