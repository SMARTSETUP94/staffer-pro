/**
 * Sprint C / C3 — Sheet d'ajout manuel d'un employé sur un métier d'objet.
 *
 * Refacto de l'ancien `AddPersonneDialog` (Lot 8.3b) :
 * - Dialog → Sheet (panneau latéral droit, plus confortable sur mobile et
 *   meilleur pour les listes longues — point soulevé par la dette 8.3b)
 * - Liste candidats extraite dans `EmployePickerList` (réutilisable N2)
 *
 * Comportement métier inchangé : assigne sur toute la fenêtre du métier,
 * gère le slider de présence (10→100 %), warning cumul > 100 %.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  addManualMemberToObjet,
  listObjetEquipeCandidats,
} from "@/server/objet-equipe-mutations.functions";
import { EmployePickerList, type CandidatRow } from "./EmployePickerList";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objetId: string;
  metierId: number;
  metierLabel: string;
}

export function AddPersonneSheet({
  open,
  onOpenChange,
  objetId,
  metierId,
  metierLabel,
}: Props) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [presence, setPresence] = useState(100);
  const qc = useQueryClient();

  const fetchCandidats = useServerFn(listObjetEquipeCandidats);
  const assignMutation = useServerFn(addManualMemberToObjet);

  const { data: candidats, isLoading } = useQuery<CandidatRow[]>({
    queryKey: ["objet-candidats", metierId],
    queryFn: () => fetchCandidats({ data: { metierId } }) as Promise<CandidatRow[]>,
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Sélectionnez un employé");
      return assignMutation({
        data: { objetId, employeId: selectedId, metierId, presencePct: presence },
      });
    },
    onSuccess: (res) => {
      if (res.status === "no_plan") {
        toast.error("Aucun plan publié sur cet objet.");
        return;
      }
      if (res.status === "already_assigned") {
        toast.warning("Cet employé est déjà assigné sur toute la fenêtre.");
        return;
      }
      const cumulMsg =
        res.warning_cumul && res.warning_cumul.length > 0
          ? ` · ⚠️ ${res.warning_cumul.length} jour(s) en cumul > 100 %`
          : "";
      toast.success(`${res.inserted} jour(s) ajouté(s)${cumulMsg}`);
      qc.invalidateQueries({ queryKey: ["objet-equipe", objetId] });
      qc.invalidateQueries({ queryKey: ["fiche-objet", objetId] });
      handleClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleClose() {
    onOpenChange(false);
    setSelectedId(null);
    setSearch("");
    setPresence(100);
  }

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader className="space-y-1">
          <SheetTitle>Ajouter une personne — {metierLabel}</SheetTitle>
          <SheetDescription>
            L'employé sera ajouté sur toute la fenêtre couverte par les steps de
            ce métier sur l'objet. Les jours déjà assignés sont ignorés.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <EmployePickerList
            candidats={candidats}
            isLoading={isLoading}
            selectedId={selectedId}
            onSelect={setSelectedId}
            search={search}
            onSearchChange={setSearch}
            heightClass="h-72"
          />

          {selectedId && (
            <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Présence quotidienne</label>
                <Badge variant="outline" className="font-mono">
                  {presence} %
                </Badge>
              </div>
              <Slider
                value={[presence]}
                onValueChange={(v) => setPresence(v[0])}
                min={10}
                max={100}
                step={10}
              />
              {presence < 100 && (
                <Alert className="border-amber-500/40 bg-amber-500/5 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  <AlertDescription className="text-xs">
                    Présence partielle : l'employé pourra être affecté ailleurs
                    le même jour.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Annuler
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!selectedId || mutation.isPending}
            data-testid="add-personne-confirm"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ajouter
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
