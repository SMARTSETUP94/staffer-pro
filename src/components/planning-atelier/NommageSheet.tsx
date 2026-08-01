import { useMemo } from "react";
import { AlertTriangle, Loader2, UserMinus } from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAssignationsDuJour, useEmployesDisponibles } from "@/hooks/use-planning-atelier";
import { detectDoubleAffectation, employesAbsents, type NommageRow, type PlanRow } from "@/lib/planning-atelier";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanRow | null;
  metierLibelle: string;
  ligneLabel: string;
  /** Assignations déjà rattachées à cette ligne de planning. */
  nommages: NommageRow[];
  canEdit: boolean;
  pending: boolean;
  onNommer: (employeId: string) => void;
  onRetirer: (assignationId: string) => void;
}

/** Temps 2 : nommage optionnel des personnes sur une cellule d'effectif. */
export function NommageSheet({
  open, onOpenChange, plan, metierLibelle, ligneLabel, nommages, canEdit, pending,
  onNommer, onRetirer,
}: Props) {
  const dispo = useEmployesDisponibles(plan?.metier_id ?? null, plan?.date ?? null);
  const jour = useAssignationsDuJour(open ? (plan?.date ?? null) : null);

  const nommesParEmploye = useMemo(
    () => new Map(nommages.map((n) => [n.employe_id, n])),
    [nommages],
  );
  const absents = useMemo(
    () => employesAbsents(dispo.data?.absences ?? [], plan?.date ?? ""),
    [dispo.data, plan?.date],
  );
  const conflits = useMemo(
    () =>
      plan
        ? detectDoubleAffectation(jour.data ?? [], plan.date, plan.id)
        : new Map<string, { affaire_id: string }>(),
    [jour.data, plan],
  );
  const numeroParAffaire = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of jour.data ?? []) if (a.affaire_numero) m.set(a.affaire_id, a.affaire_numero);
    return m;
  }, [jour.data]);

  const employes = dispo.data?.employes ?? [];
  const nbNommes = nommages.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Nommer les personnes</SheetTitle>
          <SheetDescription>
            {ligneLabel} · {metierLibelle} · {plan?.date}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-2 rounded-md border bg-muted/40 p-3 text-sm">
          <span className="font-medium">{plan?.nb_pers ?? 0} personne{(plan?.nb_pers ?? 0) > 1 ? "s" : ""} attendue{(plan?.nb_pers ?? 0) > 1 ? "s" : ""}</span>
          {" · "}
          <span className={nbNommes >= (plan?.nb_pers ?? 0) ? "text-emerald-600 dark:text-emerald-500" : "text-amber-600 dark:text-amber-500"}>
            {nbNommes} nommée{nbNommes > 1 ? "s" : ""}
          </span>
          <p className="mt-1 text-xs text-muted-foreground">
            Le nommage est optionnel : l'effectif anonyme suffit à calculer la charge atelier.
          </p>
        </div>

        <ScrollArea className="-mx-2 mt-3 flex-1 px-2">
          {dispo.isLoading ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : employes.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Aucun employé rattaché à ce métier.
            </p>
          ) : (
            <ul className="space-y-1">
              {employes.map((e) => {
                const nomme = nommesParEmploye.get(e.id);
                const absent = absents.has(e.id);
                const conflit = conflits.get(e.id);
                return (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                  >
                    <label className="flex min-w-0 flex-1 items-center gap-2">
                      <Checkbox
                        checked={!!nomme}
                        disabled={!canEdit || pending || (absent && !nomme)}
                        onCheckedChange={(c) => {
                          if (c === true) onNommer(e.id);
                          else if (nomme) onRetirer(nomme.id);
                        }}
                        aria-label={`Nommer ${e.prenom} ${e.nom}`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">
                          {e.prenom} {e.nom}
                        </span>
                        {absent && (
                          <span className="text-xs text-muted-foreground">Absent ce jour-là</span>
                        )}
                        {!absent && conflit && (
                          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
                            <AlertTriangle className="h-3 w-3" />
                            Déjà affecté ·{" "}
                            {numeroParAffaire.get(conflit.affaire_id) ?? "autre affaire"}
                          </span>
                        )}
                      </span>
                    </label>
                    <div className="flex items-center gap-1">
                      {e.metier_principal_id !== plan?.metier_id && (
                        <Badge variant="outline" className="text-[10px]">secondaire</Badge>
                      )}
                      {nomme && canEdit && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          disabled={pending}
                          onClick={() => onRetirer(nomme.id)}
                          aria-label="Retirer"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
