import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, ClipboardCheck, Clock, Send, Hammer, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMetiers } from "@/hooks/use-metiers";
import { MetierBadge } from "@/components/MetierBadge";
import { DualProgress } from "@/components/ui/dual-progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { consolidateByMetier, type RawConsoLine } from "@/lib/affaire-marge-consolidation";

interface ConsoLine {
  devis_id: string | null;
  devis_numero: string | null;
  metier_id: number | null;
  metier: string | null;
  couleur: string | null;
  heures_prevues: number | null;
  heures_assignees: number | null;
  heures_reelles_validees: number | null;
  heures_reelles_soumises: number | null;
  heures_restantes: number | null;
  pct_consomme: number | null;
  pct_consomme_reel: number | null;
}

export const Route = createFileRoute("/_app/affaires/$affaireId/")({
  component: AffaireSynthesePage,
});

function AffaireSynthesePage() {
  const { affaireId } = Route.useParams();
  const { byId } = useMetiers();
  const { isAdminOrChef } = useAuth();
  const [lines, setLines] = useState<ConsoLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<string | null>(null);
  const [hMontage, setHMontage] = useState<string>("0");
  const [hDemontage, setHDemontage] = useState<string>("0");
  const [savingMD, setSavingMD] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: cons }, { data: aff }] = await Promise.all([
        supabase
          .from("v_devis_consommation")
          .select(
            "devis_id, devis_numero, metier_id, metier, couleur, heures_prevues, heures_assignees, heures_reelles_validees, heures_reelles_soumises, heures_restantes, pct_consomme, pct_consomme_reel",
          )
          .eq("affaire_id", affaireId),
        supabase
          .from("affaires")
          .select("notes, heures_prevues_montage, heures_prevues_demontage")
          .eq("id", affaireId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setLines((cons ?? []) as ConsoLine[]);
      setNotes((aff?.notes as string | null) ?? null);
      setHMontage(String(aff?.heures_prevues_montage ?? 0));
      setHDemontage(String(aff?.heures_prevues_demontage ?? 0));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [affaireId]);

  const saveMontageDemontage = async () => {
    setSavingMD(true);
    const m = Number(hMontage) || 0;
    const d = Number(hDemontage) || 0;
    const { error } = await supabase
      .from("affaires")
      .update({ heures_prevues_montage: m, heures_prevues_demontage: d })
      .eq("id", affaireId);
    setSavingMD(false);
    if (error) {
      toast.error("Enregistrement impossible", { description: error.message });
    } else {
      toast.success("Heures montage/démontage enregistrées");
    }
  };

  const enriched = useMemo(() => {
    return lines.map((l) => {
      const prevues = Number(l.heures_prevues ?? 0);
      const staffees = Number(l.heures_assignees ?? 0);
      const validees = Number(l.heures_reelles_validees ?? 0);
      const soumises = Number(l.heures_reelles_soumises ?? 0);
      const realisees = validees + soumises; // tout ce qui a été déclaré par l'employé
      const pctStaff = prevues > 0 ? (staffees / prevues) * 100 : 0;
      const pctReal = prevues > 0 ? (realisees / prevues) * 100 : 0;
      const pctValide = prevues > 0 ? (validees / prevues) * 100 : 0;
      const ecart = prevues - validees; // marge officielle = budget - validées
      // Statut basé sur le max des engagements (planning ou réalisé)
      const pctMax = Math.max(pctStaff, pctReal);
      let tone: "ok" | "warn" | "danger" = "ok";
      if (pctMax > 100) tone = "danger";
      else if (pctMax >= 85) tone = "warn";
      return { ...l, prevues, staffees, validees, soumises, realisees, pctStaff, pctReal, pctValide, ecart, tone };
    });
  }, [lines]);

  const totals = enriched.reduce(
    (acc, l) => {
      acc.prevues += l.prevues;
      acc.staffees += l.staffees;
      acc.validees += l.validees;
      acc.soumises += l.soumises;
      return acc;
    },
    { prevues: 0, staffees: 0, validees: 0, soumises: 0 },
  );
  const totalRealisees = totals.validees + totals.soumises;
  const pctStaffTotal = totals.prevues > 0 ? (totals.staffees / totals.prevues) * 100 : 0;
  const pctRealTotal = totals.prevues > 0 ? (totalRealisees / totals.prevues) * 100 : 0;
  const pctValideTotal = totals.prevues > 0 ? (totals.validees / totals.prevues) * 100 : 0;
  const ecartTotal = totals.prevues - totals.validees;

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Légende rapide des 3 niveaux */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">Lecture :</span>
        <LevelChip tone="staff" icon={<ClipboardCheck className="h-3 w-3" />} label="Staffé = planning" />
        <LevelChip tone="real" icon={<Send className="h-3 w-3" />} label="Réalisé = soumis par employé" />
        <LevelChip tone="valide" icon={<CheckCircle2 className="h-3 w-3" />} label="Validé = officiel marge" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Prévues" value={`${totals.prevues.toFixed(0)} h`} icon={<Clock className="h-4 w-4" />} />
        <Stat
          label="Staffé"
          value={`${totals.staffees.toFixed(0)} h`}
          sub={`${pctStaffTotal.toFixed(0)}%`}
          tone={pctStaffTotal > 100 ? "danger" : pctStaffTotal >= 85 ? "warn" : "ok"}
          icon={<ClipboardCheck className="h-4 w-4" />}
        />
        <Stat
          label="Réalisé"
          value={`${totalRealisees.toFixed(0)} h`}
          sub={totals.soumises > 0 ? `dont ${totals.soumises.toFixed(0)}h en attente` : `${pctRealTotal.toFixed(0)}%`}
          tone={pctRealTotal > 100 ? "danger" : pctRealTotal >= 85 ? "warn" : "ok"}
          icon={<Send className="h-4 w-4" />}
        />
        <Stat
          label="Validé"
          value={`${totals.validees.toFixed(0)} h`}
          sub={`${pctValideTotal.toFixed(0)}%`}
          tone={pctValideTotal > 100 ? "danger" : pctValideTotal >= 85 ? "warn" : "ok"}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <Stat
          label="Marge restante"
          value={`${ecartTotal.toFixed(0)} h`}
          tone={ecartTotal < 0 ? "danger" : ecartTotal < totals.prevues * 0.15 ? "warn" : "ok"}
          icon={ecartTotal < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
        />
      </div>

      <section>
        <p className="overline mb-3">— Suivi marge par métier (Staffé / Réalisé / Validé)</p>
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
                  <th className="p-3 text-right font-semibold">
                    <span title="Heures du planning">Staffé</span>
                  </th>
                  <th className="p-3 text-right font-semibold">
                    <span title="Heures soumises (validées + en attente)">Réalisé</span>
                  </th>
                  <th className="p-3 text-right font-semibold">
                    <span title="Heures officiellement validées par chef/admin — base de la marge">Validé ✓</span>
                  </th>
                  <th className="p-3 text-right font-semibold">Marge</th>
                  <th className="p-3 text-center font-semibold">Statut</th>
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
                        {l.staffees.toFixed(1)}
                        <div className="text-[10px] text-muted-foreground">({l.pctStaff.toFixed(0)}%)</div>
                      </td>
                      <td className="p-3 text-right font-mono">
                        {l.realisees.toFixed(1)}
                        <div className="text-[10px] text-muted-foreground">
                          {l.soumises > 0 ? `+${l.soumises.toFixed(1)}h en attente` : `(${l.pctReal.toFixed(0)}%)`}
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono">
                        <span className="font-semibold">{l.validees.toFixed(1)}</span>
                        <div className="text-[10px] text-muted-foreground">({l.pctValide.toFixed(0)}%)</div>
                      </td>
                      <td
                        className={cn(
                          "p-3 text-right font-mono font-semibold",
                          l.ecart < 0
                            ? "text-destructive"
                            : l.ecart < l.prevues * 0.15
                              ? "text-warning"
                              : "text-success",
                        )}
                      >
                        {l.ecart >= 0 ? "+" : ""}
                        {l.ecart.toFixed(1)} h
                      </td>
                      <td className="p-3 text-center">
                        <MargeBadge tone={l.tone} />
                        <DualProgress
                          staffees={l.staffees}
                          realisees={l.validees}
                          budget={l.prevues}
                          size="sm"
                          showLabel={false}
                          className="mt-1.5"
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

      {isAdminOrChef && (
        <section>
          <p className="overline mb-3 flex items-center gap-2">
            <Hammer className="h-3 w-3" />— Heures Montage / Démontage chantier
          </p>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="h-montage" className="text-xs">Montage (h)</Label>
                <Input
                  id="h-montage"
                  type="number"
                  min="0"
                  step="0.5"
                  value={hMontage}
                  onChange={(e) => setHMontage(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="h-demontage" className="text-xs">Démontage (h)</Label>
                <Input
                  id="h-demontage"
                  type="number"
                  min="0"
                  step="0.5"
                  value={hDemontage}
                  onChange={(e) => setHDemontage(e.target.value)}
                />
              </div>
              <Button
                onClick={saveMontageDemontage}
                disabled={savingMD}
                className="rounded-xl"
              >
                {savingMD && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enregistrer
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Total chantier :{" "}
              <span className="font-semibold text-foreground">
                {((Number(hMontage) || 0) + (Number(hDemontage) || 0)).toFixed(1)} h
              </span>
            </p>
          </div>
        </section>
      )}

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

function LevelChip({
  tone,
  icon,
  label,
}: {
  tone: "staff" | "real" | "valide";
  icon: React.ReactNode;
  label: string;
}) {
  const cls =
    tone === "staff"
      ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
      : tone === "real"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        cls,
      )}
    >
      {icon}
      {label}
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
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-warning"
        : tone === "ok"
          ? "text-success"
          : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon && <div className={cn("opacity-60", toneCls)}>{icon}</div>}
      </div>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight", toneCls)}>{value}</p>
      {sub && <p className={cn("text-xs font-semibold", toneCls)}>{sub}</p>}
    </div>
  );
}
