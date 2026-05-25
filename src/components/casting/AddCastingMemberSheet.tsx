/**
 * Sprint C / A1 — Sheet d'ajout multi-sélection au casting d'affaire (N2).
 *
 * Évolutions vs version C1 :
 *   - Multi-sélection via checkbox (compteur + bouton "Ajouter les X")
 *   - Tri par groupes : déjà casting (grisés, dessus) → CDI → CDD → Intérim
 *   - Recherche fuzzy nom OU prénom (substring case-insensitive)
 *   - Notes / role_terrain : visibles uniquement si exactement 1 sélection
 *     (cas multi : ajout en masse, sans notes individuelles)
 */
import { useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
  /** Ids déjà présents dans la phase (grisés mais affichés en tête). */
  excludeEmployeIds?: string[];
  /** Si fourni, ne montre que les employés dont `metier_principal_id` ∈ liste. */
  restrictMetierIds?: number[];
  /** Sous-titre injecté dans le sheet (ex. "Numérique"). */
  subEtapeLabel?: string;
}

const PHASE_LABEL_INLINE: Record<CastingPhase, string> = {
  commercial_etude: "Commercial / Étude",
  fabrication: "Fabrication",
  logistique: "Logistique",
  montage: "Montage",
  demontage: "Démontage",
};

type EmpRow = {
  id: string;
  nom: string;
  prenom: string;
  type_contrat: string;
  metier_principal_id: number | null;
};

/**
 * Tier de tri par contrat : CDI=1, CDD=2, Intérim=3, autre=4.
 * Cohérent avec la règle projet (CDI/CDD avant intérim).
 */
function contratTier(type: string): number {
  const t = (type ?? "").toUpperCase();
  if (t === "CDI") return 1;
  if (t === "CDD") return 2;
  if (t === "INTERIM" || t === "INTÉRIM") return 3;
  return 4;
}

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [roleTerrain, setRoleTerrain] = useState("");
  const [notes, setNotes] = useState("");

  const { data: employes, isLoading } = useQuery({
    queryKey: ["all-active-employes"],
    queryFn: () => fetchEmployes(),
    enabled: open,
    staleTime: 60_000,
  });

  const excludeSet = useMemo(() => new Set(excludeEmployeIds), [excludeEmployeIds]);

  /**
   * Liste affichée : déjà casting (disabled, top) → puis CDI → CDD → Intérim,
   * chaque groupe trié par nom. La recherche filtre les deux nom/prénom.
   */
  const sorted = useMemo(() => {
    const all = (employes ?? []) as EmpRow[];
    const q = search.trim().toLowerCase();
    const filtered = all.filter((e) => {
      if (!q) return true;
      return (
        e.nom.toLowerCase().includes(q) || e.prenom.toLowerCase().includes(q)
      );
    });
    return [...filtered].sort((a, b) => {
      const aIn = excludeSet.has(a.id) ? 0 : 1;
      const bIn = excludeSet.has(b.id) ? 0 : 1;
      if (aIn !== bIn) return aIn - bIn;
      const at = contratTier(a.type_contrat);
      const bt = contratTier(b.type_contrat);
      if (at !== bt) return at - bt;
      return (a.nom + a.prenom).localeCompare(b.nom + b.prenom, "fr");
    });
  }, [employes, search, excludeSet]);

  const selectableCount = sorted.filter((e) => !excludeSet.has(e.id)).length;
  const selectedCount = selectedIds.size;

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (selectedCount === 0) throw new Error("Sélectionnez au moins une personne");
      const ids = Array.from(selectedIds);
      const isSingle = ids.length === 1;
      // Séquentiel pour rester simple côté serveur (rate-limit safe).
      let ok = 0;
      let fail = 0;
      for (const employeId of ids) {
        try {
          await upsertFn({
            data: {
              affaireId,
              employeId,
              phase,
              roleTerrain: isSingle ? roleTerrain.trim() || null : null,
              notes: isSingle ? notes.trim() || null : null,
            },
          });
          ok++;
        } catch (e) {
          console.error("upsert casting failed", employeId, e);
          fail++;
        }
      }
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      if (ok > 0) {
        toast.success(
          ok === 1
            ? `1 personne ajoutée à ${PHASE_LABEL_INLINE[phase]}`
            : `${ok} personnes ajoutées à ${PHASE_LABEL_INLINE[phase]}`,
        );
      }
      if (fail > 0) {
        toast.error(`${fail} ajout(s) en échec — voir console`);
      }
      qc.invalidateQueries({ queryKey: ["casting-chantier", affaireId] });
      handleClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleClose() {
    onOpenChange(false);
    setSelectedIds(new Set());
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
            Sélectionnez une ou plusieurs personnes. Elles seront ajoutées à
            l'équipe affaire (N2) et pourront saisir leurs heures par héritage.
            Aucune assignation par objet n'est créée automatiquement.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou prénom…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {selectableCount} disponible{selectableCount > 1 ? "s" : ""}
              {selectedCount > 0 ? ` · ${selectedCount} sélectionnée${selectedCount > 1 ? "s" : ""}` : ""}
            </span>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-primary hover:underline"
              >
                Tout désélectionner
              </button>
            )}
          </div>

          <ScrollArea className="h-72 rounded-md border">
            {isLoading ? (
              <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Chargement...
              </div>
            ) : sorted.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                Aucun employé trouvé.
              </p>
            ) : (
              <ul className="divide-y">
                {sorted.map((e) => {
                  const isExcluded = excludeSet.has(e.id);
                  const isSelected = selectedIds.has(e.id);
                  return (
                    <li key={e.id}>
                      <label
                        className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors ${
                          isExcluded
                            ? "cursor-not-allowed opacity-50"
                            : isSelected
                              ? "bg-accent"
                              : "hover:bg-accent"
                        }`}
                        data-testid={`casting-candidat-${e.id}`}
                      >
                        <Checkbox
                          checked={isExcluded ? true : isSelected}
                          disabled={isExcluded}
                          onCheckedChange={() => !isExcluded && toggleOne(e.id)}
                        />
                        <span className="flex-1 font-medium">
                          {e.prenom} {e.nom}
                        </span>
                        {isExcluded ? (
                          <Badge variant="outline" className="text-[10px]">
                            déjà casting
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {e.type_contrat}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>

          {selectedCount === 1 && (
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">
                Note et rôle terrain — appliqués uniquement quand 1 seule
                personne est sélectionnée.
              </p>
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

          {selectedCount > 1 && (
            <p className="rounded-md border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              Ajout en masse : les notes et rôle terrain seront laissés vides
              pour ces {selectedCount} personnes (modifiables individuellement
              ensuite sur leur chip).
            </p>
          )}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Annuler
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={selectedCount === 0 || mutation.isPending}
            data-testid="casting-add-confirm"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {selectedCount <= 1
              ? "Ajouter"
              : `Ajouter les ${selectedCount}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
