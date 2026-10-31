/** Règles pures du lien devis ↔ pipeline opportunités (bouton des vignettes, badge, version à signer). */
import type { DevisStatut } from "@/components/devis/editeur/api";

export interface DevisBadge { devis_id: string; version: number; statut_redaction: DevisStatut }

export const STATUTS_PIPELINE_OUVERTS = ["a_faire", "a_l_etude", "envoye", "presque_gagne"] as const;

/** « creer » uniquement en À faire sans devis et avec le droit de rédiger ; « ouvrir » dans les colonnes ouvertes. */
export function devisPipelineAction(p: { statut: string; badge: DevisBadge | null | undefined; peutRediger: boolean; flag: boolean }): "creer" | "ouvrir" | null {
  if (!p.flag) return null;
  if (!(STATUTS_PIPELINE_OUVERTS as readonly string[]).includes(p.statut)) return null;
  if (p.badge) return "ouvrir";
  if (p.statut === "a_faire" && p.peutRediger) return "creer";
  return null;
}

/** Version proposée à la signature : la dernière envoyée, sinon la dernière validée. */
export function versionSignaturePropose<T extends { id: string; version: number; statut_redaction: string }>(devis: T[]): T | null {
  const cands = devis.filter((d) => d.statut_redaction === "transfere" || d.statut_redaction === "valide");
  const envoyes = cands.filter((d) => d.statut_redaction === "transfere").sort((a, b) => b.version - a.version);
  if (envoyes[0]) return envoyes[0];
  return cands.sort((a, b) => b.version - a.version)[0] ?? null;
}

/** Jours BE affichés (arrondi demi-journée supérieure, déjà fait côté serveur) : « 3,5 j ». */
export function formatJoursBe(j: number): string {
  return `${String(Math.round(j * 2) / 2).replace(".", ",")} j`;
}
