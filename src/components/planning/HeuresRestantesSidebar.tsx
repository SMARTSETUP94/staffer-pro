import { AlertTriangle, CheckCircle2, PanelRightClose, PanelRightOpen, Sparkles } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DualProgress } from "@/components/ui/dual-progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StafferAffaireDialog } from "./StafferAffaireDialog";
import type {
  Absence,
  Affaire,
  Assignation,
  DevisConsommation,
  Employe,
  Metier,
} from "@/hooks/use-planning-data";

interface Props {
  affaires: Affaire[];
  consommation: DevisConsommation[];
  filterAffaireIds?: Set<string>;
  // v0.49 — Bouton « Staffer » par affaire ouvrant le dialog avec suggestions.
  employes?: Employe[];
  metiers?: Metier[];
  assignations?: Assignation[];
  absences?: Absence[];
  /** Date par défaut proposée dans le dialog (généralement lundi de la semaine). */
  defaultDate?: Date;
  /** Re-fetch ciblé de v_devis_consommation (sidebar temps réel). */
  onConsommationChanged?: () => void | Promise<void>;
  /** Refresh complet planning. */
  onChanged?: () => void;
}

interface AffaireRecap {
  affaire: Affaire;
  prevues: number;
  assignees: number;
  realisees: number;
  restantes: number;
  pct: number;
}

export function HeuresRestantesSidebar({
  affaires,
  consommation,
  filterAffaireIds,
  employes,
  metiers,
  assignations,
  absences,
  defaultDate,
  onConsommationChanged,
  onChanged,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [stafferAffaire, setStafferAffaire] = useState<Affaire | null>(null);

  const canStaff =
    !!employes && !!metiers && !!assignations && !!absences && !!defaultDate && !!onChanged;

  const recap: AffaireRecap[] = affaires
    .filter((a) => !filterAffaireIds || filterAffaireIds.size === 0 || filterAffaireIds.has(a.id))
    .map((affaire) => {
      const lignes = consommation.filter((c) => c.affaire_id === affaire.id);
      const prevues = lignes.reduce((s, l) => s + Number(l.heures_prevues || 0), 0);
      const assignees = lignes.reduce((s, l) => s + Number(l.heures_assignees || 0), 0);
      const realisees = lignes.reduce((s, l) => s + Number(l.heures_reelles_validees || 0), 0);
      const restantes = prevues - assignees;
      const pct = prevues > 0 ? (assignees / prevues) * 100 : 0;
      return { affaire, prevues, assignees, realisees, restantes, pct };
    })
    .filter((r) => r.prevues > 0 || r.assignees > 0)
    .sort((a, b) => b.pct - a.pct);

  if (collapsed) {
    return (
      <div className="sticky top-4 flex justify-end">
        <Button
          size="icon"
          variant="outline"
          onClick={() => setCollapsed(false)}
          aria-label="Ouvrir la sidebar heures restantes"
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <Card className="sticky top-4">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3 space-y-0">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Heures restantes par affaire
          </CardTitle>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setCollapsed(true)}
            aria-label="Réduire la sidebar"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {recap.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Aucune affaire avec heures budgétées.
            </p>
          ) : (
            recap.map(({ affaire, prevues, assignees, realisees, restantes, pct }) => {
              const depasse = pct > 100;
              const proche = pct >= 80 && pct <= 100;
              const showStaffer = canStaff && restantes > 0;
              return (
                <div key={affaire.id} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{affaire.numero}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{affaire.nom}</p>
                    </div>
                    {depasse ? (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                    ) : proche ? (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                    )}
                  </div>
                  <DualProgress
                    staffees={assignees}
                    realisees={realisees}
                    budget={prevues}
                    size="sm"
                    showLabel={false}
                  />
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span className="truncate">
                      <span className="font-mono">{assignees.toFixed(0)}h</span> staffées ·{" "}
                      <span className="font-mono">{realisees.toFixed(0)}h</span> réalisées
                    </span>
                    <span className={cn("shrink-0 font-semibold", depasse && "text-destructive")}>
                      {depasse ? `+${(assignees - prevues).toFixed(0)}h` : `${restantes.toFixed(0)}h restantes`}
                    </span>
                  </div>
                  {showStaffer && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-full justify-center gap-1 text-[11px]"
                      onClick={() => setStafferAffaire(affaire)}
                    >
                      <Sparkles className="h-3 w-3" />
                      Staffer
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {canStaff && stafferAffaire && (
        <StafferAffaireDialog
          open={!!stafferAffaire}
          onOpenChange={(o) => !o && setStafferAffaire(null)}
          affaire={stafferAffaire}
          consommation={consommation}
          employes={employes!}
          metiers={metiers!}
          assignations={assignations!}
          absences={absences!}
          defaultDate={defaultDate!}
          onConsommationChanged={onConsommationChanged ?? (() => {})}
          onSaved={onChanged!}
        />
      )}
    </>
  );
}
