import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatHeures, type GrilleMetier, type PrefillLine } from "@/lib/grille-fabrication";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: PrefillLine[];
  metiers: GrilleMetier[];
  onConfirm: () => void;
}

/** Récapitulatif avant pré-remplissage depuis le devis (strictement non destructif). */
export function PrefillDevisDialog({ open, onOpenChange, lines, metiers, onConfirm }: Props) {
  const parMetier = new Map<number, { n: number; h: number }>();
  for (const l of lines) {
    const cur = parMetier.get(l.metier_id) ?? { n: 0, h: 0 };
    parMetier.set(l.metier_id, { n: cur.n + 1, h: cur.h + l.heures_prevues });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Pré-remplir depuis le devis</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                {lines.length === 0
                  ? "Aucune ligne à créer : la grille est déjà complète par rapport au devis."
                  : `${lines.length} ligne${lines.length > 1 ? "s" : ""} seront créées. Les valeurs déjà saisies ne sont jamais écrasées.`}
              </p>
              {parMetier.size > 0 && (
                <ul className="space-y-1 text-sm">
                  {[...parMetier.entries()].map(([metierId, agg]) => (
                    <li key={metierId} className="flex justify-between">
                      <span>{metiers.find((m) => m.id === metierId)?.libelle ?? `Métier ${metierId}`}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {agg.n} ligne{agg.n > 1 ? "s" : ""} · {formatHeures(agg.h)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction disabled={lines.length === 0} onClick={onConfirm}>
            Créer les lignes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
