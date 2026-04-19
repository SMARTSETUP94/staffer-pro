import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMetiers } from "@/hooks/use-metiers";
import { MetierBadge } from "@/components/MetierBadge";
import { Progress } from "@/components/ui/progress";

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

export const Route = createFileRoute("/_app/affaires/$affaireId/")({
  component: AffaireSynthesePage,
});

function AffaireSynthesePage() {
  const { affaireId } = Route.useParams();
  const { byId } = useMetiers();
  const [lines, setLines] = useState<ConsoLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: cons }, { data: aff }] = await Promise.all([
        supabase
          .from("v_devis_consommation")
          .select("devis_id, devis_numero, metier_id, metier, couleur, heures_prevues, heures_assignees, heures_restantes, pct_consomme")
          .eq("affaire_id", affaireId),
        supabase.from("affaires").select("notes").eq("id", affaireId).maybeSingle(),
      ]);
      if (cancelled) return;
      setLines((cons ?? []) as ConsoLine[]);
      setNotes((aff?.notes as string | null) ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [affaireId]);

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  const totals = lines.reduce(
    (acc, l) => {
      acc.prevues += Number(l.heures_prevues ?? 0);
      acc.assignees += Number(l.heures_assignees ?? 0);
      return acc;
    },
    { prevues: 0, assignees: 0 },
  );
  const pctTotal = totals.prevues > 0 ? Math.round((totals.assignees / totals.prevues) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Heures prévues" value={`${totals.prevues.toFixed(1)} h`} />
        <Stat label="Heures assignées" value={`${totals.assignees.toFixed(1)} h`} />
        <Stat
          label="Consommation"
          value={`${pctTotal}%`}
          tone={pctTotal > 100 ? "warning" : pctTotal >= 80 ? "info" : "neutral"}
        />
      </div>

      <section>
        <p className="overline mb-3">— Consommation par métier</p>
        {lines.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Aucun poste de devis renseigné. Ajoutez un devis dans l'onglet Devis pour suivre la consommation.
          </div>
        ) : (
          <div className="space-y-2">
            {lines.map((l, i) => {
              const m = l.metier_id ? byId(l.metier_id) : undefined;
              const pct = Math.min(100, Number(l.pct_consomme ?? 0));
              const dep = Number(l.pct_consomme ?? 0) > 100;
              return (
                <div key={`${l.devis_id}-${l.metier_id}-${i}`} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {m && <MetierBadge libelle={m.libelle} couleur={m.couleur} />}
                      <span className="text-xs font-mono text-muted-foreground">{l.devis_numero}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{Number(l.heures_assignees ?? 0).toFixed(1)} h</span>
                      {" / "}
                      {Number(l.heures_prevues ?? 0).toFixed(1)} h
                      {dep && <span className="ml-2 font-bold text-warning">⚠ dépassement</span>}
                    </div>
                  </div>
                  <Progress value={pct} className="mt-2 h-2" />
                </div>
              );
            })}
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

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "info" | "warning" }) {
  const toneCls =
    tone === "warning" ? "text-warning" :
    tone === "info" ? "text-primary" :
    "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${toneCls}`}>{value}</p>
    </div>
  );
}
