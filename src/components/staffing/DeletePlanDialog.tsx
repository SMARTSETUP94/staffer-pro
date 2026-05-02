// v0.35.x — Hard delete plan dialog (admin only) — confirmation par saisie du numéro d'affaire.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { deleteStaffingPlan } from "@/server/staffing-plan-delete.functions";

export function DeletePlanDialog({
  planId,
  affaireNumero,
  affaireNom,
  affaireId,
  open,
  onOpenChange,
}: {
  planId: string;
  affaireNumero: string;
  affaireNom: string;
  affaireId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const del = useServerFn(deleteStaffingPlan);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");

  const canSubmit = confirm.trim() === affaireNumero && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await del({ data: { planId, confirmAffaireNumero: confirm.trim() } });
      toast.success(`Plan supprimé pour ${affaireNumero} — ${affaireNom}`);
      onOpenChange(false);
      if (affaireId) {
        await navigate({ to: "/affaires/$affaireId/fabrication", params: { affaireId } });
      } else {
        await navigate({ to: "/dashboard" });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur suppression");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Suppression irréversible du plan
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                Cette action supprime définitivement le plan staffing ainsi que :
              </p>
              <ul className="list-disc pl-5 text-xs space-y-1">
                <li>toutes les étapes calculées et leurs surcharges manuelles</li>
                <li>toutes les affectations personnes du plan</li>
                <li>les réservations CNC associées</li>
                <li>tous les snapshots d'historique</li>
                <li>le lien vers les créneaux du planning principal (créneaux conservés mais détachés)</li>
              </ul>
              <p className="font-semibold text-foreground">
                Affaire : {affaireNumero} — {affaireNom}
              </p>
              <p>
                Pour confirmer, saisissez exactement le numéro de l'affaire :{" "}
                <span className="font-mono font-bold">{affaireNumero}</span>
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="confirm-numero" className="text-xs">
            Numéro d'affaire
          </Label>
          <Input
            id="confirm-numero"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={affaireNumero}
            autoComplete="off"
            disabled={busy}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            disabled={!canSubmit}
            className="bg-destructive hover:bg-destructive/90"
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Supprimer définitivement
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
