/**
 * Sprint C / C3 — Composant réutilisable de sélection d'employé pour un métier.
 *
 * Extrait de l'ancien `AddPersonneDialog` (Lot 8.3b). Consommé par
 * `AddPersonneSheet` côté fiche objet et — à terme — par l'éditeur N2 du
 * casting chantier (Sprint C / C1).
 *
 * Props :
 * - candidats : liste rankée (Tier 1→4) renvoyée par `listObjetEquipeCandidats`
 * - isLoading : état de chargement
 * - selectedId : id employé sélectionné (controlled)
 * - onSelect : callback de sélection
 * - search / onSearchChange : champ de recherche (controlled)
 */
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Star } from "lucide-react";

export interface CandidatRow {
  id: string;
  nom: string;
  prenom: string;
  type_contrat: string;
  tier: 1 | 2 | 3 | 4;
  is_principal: boolean;
}

interface Props {
  candidats: CandidatRow[] | undefined;
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (q: string) => void;
  /** Hauteur du ScrollArea — défaut 320 px (h-80) */
  heightClass?: string;
  /** Auto-focus du champ de recherche à l'ouverture */
  autoFocus?: boolean;
}

const TIER_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: "Principal",
  2: "Secondaire",
  3: "Polyvalent",
  4: "Hors métier",
};

const TIER_TONE: Record<1 | 2 | 3 | 4, string> = {
  1: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  2: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  3: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  4: "border-muted bg-muted text-muted-foreground",
};

export function EmployePickerList({
  candidats,
  isLoading,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  heightClass = "h-80",
  autoFocus = true,
}: Props) {
  const filtered = useMemo(() => {
    if (!candidats) return [];
    const q = search.trim().toLowerCase();
    if (!q) return candidats;
    return candidats.filter(
      (c) =>
        c.nom.toLowerCase().includes(q) || c.prenom.toLowerCase().includes(q),
    );
  }, [candidats, search]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un employé..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8"
          autoFocus={autoFocus}
        />
      </div>

      <ScrollArea className={`${heightClass} rounded-md border`}>
        {isLoading && (
          <div className="flex h-full min-h-[120px] items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Chargement...
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Aucun candidat.
          </p>
        )}
        {!isLoading && filtered.length > 0 && (
          <ul className="divide-y">
            {filtered.map((c) => {
              const selected = c.id === selectedId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                      selected ? "bg-accent" : ""
                    }`}
                    data-testid={`candidat-${c.id}`}
                  >
                    <span className="flex items-center gap-2">
                      {c.is_principal && (
                        <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      )}
                      <span className="font-medium">
                        {c.prenom} {c.nom}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {c.type_contrat}
                      </span>
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${TIER_TONE[c.tier]}`}
                    >
                      {TIER_LABEL[c.tier]}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
