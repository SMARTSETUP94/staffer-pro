/**
 * v0.44.1 — Photos rattachées à un objet de fabrication précis.
 * Wrapper sur useAffaireDocuments avec filtre objet_id côté requête.
 * L'upload écrit affaire_documents avec objet_id renseigné → la photo apparaît
 * aussi dans la galerie globale du chantier (Sprint 2).
 */
import { useAffaireDocuments } from "@/hooks/use-affaire-documents";

export function useObjetPhotos(affaireId: string | null | undefined, objetId: string | null | undefined) {
  return useAffaireDocuments(affaireId ?? null, { objetId: objetId ?? undefined });
}
