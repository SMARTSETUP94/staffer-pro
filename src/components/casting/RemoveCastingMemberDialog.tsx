/**
 * Sprint C / C1 — AlertDialog de retrait d'un membre du casting d'affaire (N2).
 *
 * Si le membre est affecté à des objets (L3 actif), l'AlertDialog propose la
 * cascade explicite (D2 tranchée par produit).
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { removeAffaireEquipeMember } from "@/server/equipe-mutations.functions";
import { supabase } from "@/integrations/supabase/client";
import type { CastingPhase } from "@/server/casting-chantier.functions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  affaireId: string;
  employeId: string;
  employeLabel: string;
  phase: CastingPhase;
}

export function RemoveCastingMemberDialog({
  open,
  onOpenChange,
  affaireId,
  employeId,
  employeLabel,
  phase,
}: Props) {
  const qc = useQueryClient();
  const removeFn = useServerFn(removeAffaireEquipeMember);
  const [cascade, setCascade] = useState(false);

  // Compte ses affectations N3 actives sur l'affaire
  const { data: n3count } = useQuery({
    queryKey: ["foe-count-affaire", affaireId, employeId],
    enabled: open,
    queryFn: async () => {
      const { data: objs } = await supabase
        .from("fabrication_objets")
        .select("id")
        .eq("affaire_id", affaireId);
      const ids = (objs ?? []).map((o) => o.id as string);
      if (ids.length === 0) return 0;
      const { count } = await supabase
        .from("fabrication_objet_equipe")
        .select("id", { count: "exact", head: true })
        .eq("employe_id", employeId)
        .in("objet_id", ids)
        .is("removed_at", null);
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (n3count && n3count > 0) setCascade(true);
  }, [n3count]);

  const mutation = useMutation({
    mutationFn: () =>
      removeFn({
        data: { affaireId, employeId, phase, cascadeObjets: cascade },
      }),
    onSuccess: (res) => {
      const msg =
        res.cascaded_n3 > 0
          ? `Retiré du casting + ${res.cascaded_n3} affectation(s) objet retirée(s).`
          : "Retiré du casting.";
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["casting-chantier", affaireId] });
      qc.invalidateQueries({ queryKey: ["foe-count-affaire", affaireId, employeId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasObjAssignments = (n3count ?? 0) > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retirer {employeLabel} ?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                La personne sera retirée du casting de cette affaire pour la
                phase concernée. Son historique reste consultable.
              </p>
              {hasObjAssignments && (
                <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-foreground">
                  <Checkbox
                    checked={cascade}
                    onCheckedChange={(v) => setCascade(v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-xs">
                    Cette personne est aussi affectée à{" "}
                    <strong>{n3count}</strong> objet(s) de cette affaire.
                    Retirer également ces affectations ?
                  </span>
                </label>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="casting-remove-confirm"
          >
            Retirer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
