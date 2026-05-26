/**
 * Bloc 9 Q3 — Alias canonique de compression photo mission.
 *
 * Le helper réel vit dans `src/lib/image-compression.ts` (utilisé par
 * affaire-documents, fab-photos, avatars). Ce fichier est l'alias attendu
 * par le spec Bloc 9 pour rester explicite côté carte mission (uploads
 * de photos `avant_montage` / `apres_demontage` / `probleme`).
 *
 * → Une seule source de vérité, deux entry points sémantiques.
 */
export {
  compressImageIfPossible,
  type CompressionResult,
} from "./image-compression";
