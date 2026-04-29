import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Employe } from "@/hooks/use-planning-data";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** IDs déjà visibles dans la grille — on les marque "déjà ajouté" */
  alreadyVisibleIds: Set<string>;
  /** Callback quand l'utilisateur sélectionne un intérimaire à staffer */
  onSelect: (employe: Employe) => void;
}

export function AddInterimDialog({
  open,
  onOpenChange,
  alreadyVisibleIds,
  onSelect,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setQuery("");
    supabase
      .from("employes")
      .select(
        "id, prenom, nom, type_contrat, sous_type_contrat, agence_interim, metier_principal_id",
      )
      .eq("actif", true)
      .eq("non_staffing", false)
      .in("type_contrat", ["Interim", "Independant"])
      .order("nom")
      .then(({ data, error }) => {
        if (!error && data) setEmployes(data as Employe[]);
        setLoading(false);
      });
  }, [open]);

  const filtered = useMemo(() => {
    const q = normalizeName(query.trim());
    if (!q) return employes;
    return employes.filter((e) => {
      const hay = normalizeName(`${e.prenom} ${e.nom} ${e.agence_interim ?? ""} ${e.sous_type_contrat ?? ""}`);
      return hay.includes(q);
    });
  }, [employes, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            Ajouter un intérimaire / indépendant
          </DialogTitle>
          <DialogDescription>
            Recherche dans tous les intérim. et indép. actifs de la base, puis sélectionne pour
            créer une assignation.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            type="search"
            placeholder="Nom, prénom, agence…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 pl-8"
          />
        </div>

        <div className="max-h-[360px] overflow-y-auto rounded-md border">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Aucun résultat.
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((e) => {
                const already = alreadyVisibleIds.has(e.id);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => {
                        onSelect(e);
                        onOpenChange(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 p-2.5 text-left text-sm hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">
                          {e.prenom} {e.nom}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {e.sous_type_contrat || e.type_contrat}
                          {e.agence_interim && ` · ${e.agence_interim}`}
                        </div>
                      </div>
                      {already ? (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          déjà visible
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {e.type_contrat}
                        </Badge>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
