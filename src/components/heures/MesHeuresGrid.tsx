import { useMemo, useState } from "react";
import { addDays, format, isSameDay, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, ChevronDown, Clock, Loader2, MapPin, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useMesHeures, type SaisieCombined } from "@/hooks/use-mes-heures";

interface Props {
  weekStart: Date;
  variant: "mobile" | "desktop";
  /** Override pour preview admin */
  employeIdOverride?: string | null;
}

const STATUT_BADGE: Record<string, { label: string; className: string }> = {
  brouillon: { label: "Brouillon", className: "bg-muted text-muted-foreground" },
  soumis: { label: "Soumis", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  valide: { label: "Validé", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  rejete: { label: "Rejeté", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

export function MesHeuresGrid({ weekStart, variant, employeIdOverride }: Props) {
  const {
    loading,
    rows,
    rejectedNotAcked,
    totalHeuresPrevues,
    totalHeuresSaisies,
    hasBlockingRejet,
    upsertSaisie,
    submitWeek,
    acknowledgeRejet,
  } = useMesHeures({ weekStart, employeIdOverride });

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const draftCount = rows.filter((r) => r.saisie?.statut === "brouillon").length;
  const submittedCount = rows.filter((r) => r.saisie?.statut === "soumis").length;
  const validatedCount = rows.filter((r) => r.saisie?.statut === "valide").length;

  const handleSubmit = async () => {
    const res = await submitWeek();
    if (res.ok) {
      toast.success(`${res.count} saisie(s) soumise(s) pour validation.`);
    } else {
      toast.error(res.error ?? "Erreur lors de la soumission");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Banner rejets non lus */}
      {rejectedNotAcked.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-red-900 dark:text-red-200">
                  {rejectedNotAcked.length} saisie(s) rejetée(s) — action requise
                </h3>
                <p className="mt-0.5 text-xs text-red-800/80 dark:text-red-300/80">
                  Vous devez prendre connaissance des motifs avant de pouvoir re-soumettre.
                </p>
              </div>
              <ul className="space-y-2">
                {rejectedNotAcked.map((s) => (
                  <li key={s.id} className="rounded-lg border border-red-500/20 bg-background p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground">
                          {format(new Date(s.date), "EEEE d MMMM", { locale: fr })}
                        </p>
                        <p className="mt-1 text-sm text-foreground">{s.motif_rejet}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => acknowledgeRejet(s.id)}
                      >
                        J'ai pris connaissance
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Récap header */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Heures prévues" value={`${totalHeuresPrevues}h`} />
          <Stat label="Heures saisies" value={`${totalHeuresSaisies}h`} />
          <Stat label="Brouillons" value={draftCount} />
          <Stat label="Soumis / Validés" value={`${submittedCount} / ${validatedCount}`} />
        </div>
      </div>

      {/* Bouton soumettre */}
      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={handleSubmit}
          disabled={draftCount === 0 || hasBlockingRejet}
          className="gap-2"
        >
          <Send className="h-4 w-4" />
          Soumettre la semaine ({draftCount})
        </Button>
      </div>

      {/* Grille jours */}
      <ul className="space-y-3">
        {days.map((day) => {
          const dayRows = rows.filter((r) => isSameDay(new Date(r.date), day));
          const today = isToday(day);
          return (
            <li
              key={day.toISOString()}
              className={cn(
                "rounded-2xl border bg-card p-3",
                today ? "border-primary/40 ring-1 ring-primary/20" : "border-border",
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wider",
                      today ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {format(day, "EEEE", { locale: fr })}
                  </span>
                  <span className="text-sm font-bold capitalize text-foreground">
                    {format(day, "d MMM", { locale: fr })}
                  </span>
                  {today && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                      Aujourd'hui
                    </span>
                  )}
                </div>
              </div>
              {dayRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">— Pas d'assignation</p>
              ) : (
                <div className="space-y-2">
                  {dayRows.map((row) => (
                    <SaisieRowCard
                      key={row.key}
                      row={row}
                      variant={variant}
                      onUpdate={upsertSaisie}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-base font-bold text-foreground">{value}</p>
    </div>
  );
}

function SaisieRowCard({
  row,
  variant,
  onUpdate,
}: {
  row: SaisieCombined;
  variant: "mobile" | "desktop";
  onUpdate: (row: SaisieCombined, patch: Partial<NonNullable<SaisieCombined["saisie"]>>) => Promise<void>;
}) {
  const statut = row.saisie?.statut ?? "brouillon";
  const locked = statut === "soumis" || statut === "valide";
  const initialHeures = row.saisie?.heures_reelles ?? row.assignation?.heures ?? 0;
  const [heures, setHeures] = useState<string>(String(initialHeures));
  const [debut, setDebut] = useState<string>(row.saisie?.heure_debut ?? "");
  const [fin, setFin] = useState<string>(row.saisie?.heure_fin ?? "");
  const [commentaire, setCommentaire] = useState<string>(row.saisie?.commentaire ?? "");
  const [showTimes, setShowTimes] = useState(!!(row.saisie?.heure_debut || row.saisie?.heure_fin));

  const badge = STATUT_BADGE[statut];

  const commit = async (patch: Partial<NonNullable<SaisieCombined["saisie"]>>) => {
    if (locked) return;
    await onUpdate(row, patch);
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        locked ? "border-border/40 bg-muted/30" : "border-border bg-background",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: row.metier_couleur }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {row.affaire_label}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {row.demi_journee === "JOURNEE" ? "Journée" : row.demi_journee} ·{" "}
                {row.assignation?.heures}h prévues
                {row.assignation?.affaire?.lieu && (
                  <span className="ml-2 inline-flex items-center gap-0.5">
                    <MapPin className="h-2.5 w-2.5" />
                    {row.assignation.affaire.lieu}
                  </span>
                )}
              </p>
            </div>
            <Badge className={cn("text-[10px]", badge.className)} variant="outline">
              {badge.label}
            </Badge>
          </div>

          <div className={cn("mt-3 grid gap-2", variant === "desktop" ? "grid-cols-[120px_1fr_auto]" : "grid-cols-1")}>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Heures réalisées
              </label>
              <Input
                type="number"
                step="0.25"
                min="0"
                max="24"
                value={heures}
                disabled={locked}
                onChange={(e) => setHeures(e.target.value)}
                onBlur={() => {
                  const n = Number(heures);
                  if (!isNaN(n) && n !== Number(row.saisie?.heures_reelles ?? -1)) {
                    commit({ heures_reelles: n });
                  }
                }}
                className="h-9"
              />
            </div>

            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Commentaire
              </label>
              <Input
                value={commentaire}
                disabled={locked}
                onChange={(e) => setCommentaire(e.target.value)}
                onBlur={() => {
                  if (commentaire !== (row.saisie?.commentaire ?? "")) {
                    commit({ commentaire: commentaire || null });
                  }
                }}
                placeholder="Optionnel"
                className="h-9"
              />
            </div>
          </div>

          <Collapsible open={showTimes} onOpenChange={setShowTimes} className="mt-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" disabled={locked}>
                <Clock className="h-3 w-3" />
                {showTimes ? "Masquer" : "Préciser"} début / fin
                <ChevronDown className={cn("h-3 w-3 transition-transform", showTimes && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Début
                  </label>
                  <Input
                    type="time"
                    value={debut}
                    disabled={locked}
                    onChange={(e) => setDebut(e.target.value)}
                    onBlur={() => {
                      if (debut !== (row.saisie?.heure_debut ?? "")) {
                        commit({ heure_debut: debut || null });
                      }
                    }}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Fin
                  </label>
                  <Input
                    type="time"
                    value={fin}
                    disabled={locked}
                    onChange={(e) => setFin(e.target.value)}
                    onBlur={() => {
                      if (fin !== (row.saisie?.heure_fin ?? "")) {
                        commit({ heure_fin: fin || null });
                      }
                    }}
                    className="h-9"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Saisie textarea long uniquement en desktop si rejet */}
          {variant === "desktop" && statut === "rejete" && row.saisie?.motif_rejet && (
            <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/5 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">
                Motif rejet
              </p>
              <p className="mt-0.5 text-xs text-foreground">{row.saisie.motif_rejet}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Suppress lint for unused Textarea import (kept for future)
void Textarea;
