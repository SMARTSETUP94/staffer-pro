/**
 * v0.44.1 — Kanban Atelier : objets fab de mes chantiers actifs répartis
 * sur 4 colonnes (Bois / Peinture / Manut / Validé).
 *
 * Mapping :
 *   - statut_chef = 'fini'                                  → Validé
 *   - sinon, on prend la 1ère fabrication_etapes non terminée
 *     - type_etape ∈ {be, usinage, respo_fab}               → Bois
 *     - type_etape = 'finition'                             → Peinture
 *     - type_etape = 'manutention'                          → Manut
 *   - fallback (pas d'étape créée) → Bois
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMesAffairesChef } from "@/hooks/use-mes-affaires-chef";
import { useAuth } from "@/lib/auth-context";

export type KanbanColumn = "bois" | "peinture" | "manut" | "valide";

export interface KanbanObjet {
  id: string;
  affaire_id: string;
  affaire_numero: string;
  affaire_nom: string;
  reference: string;
  nom: string;
  quantite: number;
  statut_chef: "a_faire" | "en_cours" | "bloque" | "fini";
  column: KanbanColumn;
  thumbnail_path: string | null;
  date_fin_souhaitee: string | null;
  is_en_retard: boolean;
}

const KANBAN_LABEL: Record<KanbanColumn, string> = {
  bois: "Bois",
  peinture: "Peinture",
  manut: "Manut",
  valide: "Validé",
};

export const KANBAN_COLUMNS: KanbanColumn[] = ["bois", "peinture", "manut", "valide"];

export function kanbanLabel(c: KanbanColumn) {
  return KANBAN_LABEL[c];
}

export function useChantierKanban(filterAffaireIds: string[] | null) {
  const { user, isAdminOrChef } = useAuth();
  const { data: affaires } = useMesAffairesChef();
  const mineIds = (affaires ?? []).map((a) => a.id);
  const targetIds =
    filterAffaireIds && filterAffaireIds.length > 0
      ? filterAffaireIds.filter((id) => mineIds.includes(id))
      : mineIds;

  return useQuery<KanbanObjet[]>({
    queryKey: ["chantier-kanban", user?.id, targetIds.join(",")],
    enabled: isAdminOrChef && targetIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      // 1. Objets fab non archivés des affaires cibles
      const { data: objets, error: objErr } = await supabase
        .from("fabrication_objets")
        .select("id, affaire_id, reference, nom, quantite, statut_chef, archive, affaires(numero,nom)")
        .eq("archive", false)
        .in("affaire_id", targetIds)
        .order("reference");
      if (objErr) throw objErr;

      const objetIds = (objets ?? []).map((o) => o.id);
      if (objetIds.length === 0) return [];

      // 2. Étapes non terminées par objet (pour déduire la colonne)
      const { data: etapes } = await supabase
        .from("fabrication_etapes")
        .select("objet_id, type_etape, statut")
        .in("objet_id", objetIds)
        .neq("statut", "termine");

      const etapesParObjet = new Map<string, string[]>();
      (etapes ?? []).forEach((e) => {
        const arr = etapesParObjet.get(e.objet_id) ?? [];
        arr.push(e.type_etape);
        etapesParObjet.set(e.objet_id, arr);
      });

      // 3. Thumbnails (1ère photo par objet)
      const { data: photos } = await supabase
        .from("affaire_documents")
        .select("objet_id, storage_path, uploaded_at, mime_type, deleted_at")
        .in("objet_id", objetIds)
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false });
      const thumbParObjet = new Map<string, string>();
      (photos ?? [])
        .filter((p) => p.objet_id && (p.mime_type ?? "").startsWith("image/"))
        .forEach((p) => {
          if (p.objet_id && !thumbParObjet.has(p.objet_id)) thumbParObjet.set(p.objet_id, p.storage_path);
        });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (objets ?? []).map((o: any): KanbanObjet => {
        let column: KanbanColumn = "bois";
        if (o.statut_chef === "fini") {
          column = "valide";
        } else {
          const types = etapesParObjet.get(o.id) ?? [];
          if (types.includes("manutention")) column = "manut";
          else if (types.includes("finition")) column = "peinture";
          else column = "bois";
        }
        return {
          id: o.id,
          affaire_id: o.affaire_id,
          affaire_numero: o.affaires?.numero ?? "",
          affaire_nom: o.affaires?.nom ?? "",
          reference: o.reference,
          nom: o.nom,
          quantite: o.quantite,
          statut_chef: o.statut_chef,
          column,
          thumbnail_path: thumbParObjet.get(o.id) ?? null,
        };
      });
    },
  });
}
