/**
 * Lot 8.3b — Confirmation de retrait d'un employé sur un métier d'objet.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { toast } from "sonner";
import { removeMemberFromObjet } from "@/server/objet-equipe-mutations.functions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objetId: string;
  employeId: string;
  employeLabel: string;
  metierId: number;
  metierLabel: string;
}

export function RemovePersonneDialog({
  open,
  onOpenChange,
  objetId,
  employeId,
  employeLabel,
  metierId,
  metierLabel,
}: Props) {
  const qc = useQueryClient();
  const remove = useServerFn(removeMemberFromObjet);

  const mutation = useMutation({
    mutationFn: () => remove({ data: { objetId, employeId, metierId } }),
    onSuccess: (res) => {
      toast.success(`${res.deleted} jour(s) retiré(s)`);
      qc.invalidateQueries({ queryKey: ["objet-equipe", objetId] });
      qc.invalidateQueries({ queryKey: ["fiche-objet", objetId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retirer {employeLabel} ?</AlertDialogTitle>
          <AlertDialogDescription>
            Toutes les affectations de cette personne sur le métier{" "}
            <strong>{metierLabel}</strong> de cet objet seront supprimées du
            plan publié. Cette action est immédiate et journalisée.
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
            data-testid="remove-personne-confirm"
          >
            Retirer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
