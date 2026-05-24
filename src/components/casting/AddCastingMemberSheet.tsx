/**
 * Sprint C / C1 — Sheet d'ajout d'une personne dans le casting d'affaire (N2).
 *
 * Le picker liste tous les employés actifs (pas de tier-ranking — on n'est
 * pas dans le contexte d'un métier précis). role_terrain + notes sont des
 * champs libres optionnels (max 200 chars).
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  upsertAffaireEquipeMember,
  listAllActiveEmployes,
} from "@/server/equipe-mutations.functions";
import type { CastingPhase } from "@/server/casting-chantier.functions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  affaireId: string;
  phase: CastingPhase;
  phaseLabel: string;
  /** Ids déjà présents dans la phase (filtrés du picker). */
  excludeEmployeIds?: string[];
}

const PHASE_LABEL_INLINE: Record<CastingPhase, string> = {
  commercial_etude: "Commercial / Étude",
  fabrication: "Fabrication",
  montage: "Montage",
  demontage: "Démontage",
};

export function AddCastingMemberSheet({
  open,
  onOpenChange,
  affaireId,
  phase,
  phaseLabel,
  excludeEmployeIds = [],
}: Props) {
  const qc = useQueryClient();
  const fetchEmployes = useServerFn(listAllActiveEmployes);
  const upsertFn = useServerFn(upsertAffaireEquipeMember);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roleTerrain, setRoleTerrain] = useState("");
  const [notes, setNotes] = useState("");

  const { data: employes, isLoading } = useQuery({
    queryKey: ["all-active-employes"],
    queryFn: () => fetchEmployes(),
    enabled: open,
    staleTime: 60_000,
  });

  const excludeSet = new Set(excludeEmployeIds);
  const filtered = (employes ?? []).filter((e) => {
    if (excludeSet.has(e.id)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      e.nom.toLowerCase().includes(q) || e.prenom.toLowerCase().includes(q)
    );
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error("Sélectionnez un employé");
      return upsertFn({
        data: {
          affaireId,
          employeId: selectedId,
          phase,
          roleTerrain: roleTerrain.trim() || null,
          notes: notes.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success(`Personne ajoutée à ${PHASE_LABEL_INLINE[phase]}`);
      qc.invalidateQueries({ queryKey: ["casting-chantier", affaireId] });
      handleClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleClose() {
    onOpenChange(false);
    setSelectedId(null);
    setSearch("");
    setRoleTerrain("");
    setNotes("");
  }

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader className="space-y-1">
          <SheetTitle>Ajouter au casting — {phaseLabel}</SheetTitle>
          <SheetDescription>
            La personne sera ajoutée à l'équipe affaire (niveau 2). Elle pourra
            saisir ses heures par héritage. Ne crée PAS automatiquement
            d'assignation par objet (à faire séparément si besoin).
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un employé..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>

          <ScrollArea className="h-60 rounded-md border">
            {isLoading ? (
              <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Chargement...
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Aucun employé disponible.
              </p>
            ) : (
              <ul className="divide-y">
                {filtered.map((e) => {
                  const selected = e.id === selectedId;
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(e.id)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                          selected ? "bg-accent" : ""
                        }`}
                        data-testid={`casting-candidat-${e.id}`}
                      >
                        <span className="font-medium">
                          {e.prenom} {e.nom}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {e.type_contrat}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>

          {selectedId && (
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Rôle terrain <span className="text-muted-foreground">(optionnel, 200 max)</span>
                </label>
                <Input
                  value={roleTerrain}
                  onChange={(e) => setRoleTerrain(e.target.value.slice(0, 200))}
                  placeholder="ex : chef d'équipe, second…"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Notes <span className="text-muted-foreground">(optionnel, 200 max)</span>
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, 200))}
                  placeholder="Précision contractuelle, contrainte horaires…"
                  rows={2}
                />
                <p className="text-[10px] text-muted-foreground">
                  {notes.length}/200
                </p>
              </div>
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
            data-testid="casting-add-confirm"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ajouter
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
