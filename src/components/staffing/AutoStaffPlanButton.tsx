// v0.35.10 #1 — Bouton "Baguette magique" : auto-staff plan complet (tous steps).
// Affiche dialog confirmation + résumé après exécution (steps traités, slots remplis, manqués).
import { useState, forwardRef, useImperativeHandle } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Wand2, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { autoStaffPlan } from "@/server/staffing-autostaff-plan.functions";

export interface AutoStaffPlanButtonHandle {
  /** Ouvre le dialog de confirmation (raccourci clavier A). */
  trigger: () => void;
}

interface Props {
  planId: string;
  /** Nb de steps total (pour info dans le dialog). */
  stepsCount: number;
  /** Appelé après auto-staff réussi pour recharger les sections. */
  onCompleted: () => void;
}

export const AutoStaffPlanButton = forwardRef<AutoStaffPlanButtonHandle, Props>(
  function AutoStaffPlanButton({ planId, stepsCount, onCompleted }, ref) {
  const autoStaff = useServerFn(autoStaffPlan);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    steps_traites: number;
    steps_skipped: number;
    filled_total: number;
    unfilled_total: number;
  } | null>(null);
  const [resultOpen, setResultOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    trigger: () => {
      if (!running && stepsCount > 0) setConfirmOpen(true);
    },
  }), [running, stepsCount]);

  const handleRun = async () => {
    setConfirmOpen(false);
    setRunning(true);
    try {
      const res = await autoStaff({ data: { planId } });
      setResult(res);
      setResultOpen(true);
      onCompleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur auto-staff");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="default"
        className="bg-violet-600 hover:bg-violet-700 text-white"
        onClick={() => setConfirmOpen(true)}
        disabled={running || stepsCount === 0}
        title="Affecter automatiquement tous les créneaux non couverts"
      >
        {running ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Wand2 className="mr-1 h-3 w-3" />
        )}
        Auto-staff complet
      </Button>

      {/* Confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-violet-600" />
              Auto-staff plan complet
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  L'algorithme va parcourir <strong>{stepsCount} créneau{stepsCount > 1 ? "x" : ""}</strong>{" "}
                  dans l'ordre métier (BE → Num → Bois/Métal/Peint/Tap → Manut) et affecter
                  automatiquement les meilleurs candidats disponibles selon la règle :
                </p>
                <ul className="list-disc pl-5 text-xs">
                  <li>Priorité <strong>CDI</strong> &gt; <strong>CDD</strong> &gt; <strong>Intermittent</strong></li>
                  <li>Compétence métier principale puis polyvalente</li>
                  <li>Disponibilité réelle (autres plans publiés + ce plan)</li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  Les affectations existantes ne sont pas écrasées : seuls les slots manquants sont remplis.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleRun} className="bg-violet-600 hover:bg-violet-700">
              Lancer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Résultat */}
      <AlertDialog open={resultOpen} onOpenChange={setResultOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {result && result.unfilled_total === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              Auto-staff terminé
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {result && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded border border-border bg-muted/40 p-2">
                        <div className="text-xs text-muted-foreground">Créneaux traités</div>
                        <div className="text-2xl font-bold">{result.steps_traites}</div>
                      </div>
                      <div className="rounded border border-border bg-muted/40 p-2">
                        <div className="text-xs text-muted-foreground">Créneaux non touchés</div>
                        <div className="text-2xl font-bold">{result.steps_skipped}</div>
                      </div>
                      <div className="rounded border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 p-2">
                        <div className="text-xs text-emerald-700 dark:text-emerald-400">Slots remplis</div>
                        <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                          {result.filled_total}
                        </div>
                      </div>
                      <div className="rounded border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-2">
                        <div className="text-xs text-amber-700 dark:text-amber-400">Slots manquants</div>
                        <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                          {result.unfilled_total}
                        </div>
                      </div>
                    </div>
                    {result.unfilled_total > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Les slots manquants viennent souvent d'un manque de personnel disponible
                        (autres plans en concurrence) ou de compétences métier insuffisantes dans l'équipe.
                        Vérifiez la matrice <em>Compétences équipe</em> et les plans publiés concurrents.
                      </p>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setResultOpen(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
