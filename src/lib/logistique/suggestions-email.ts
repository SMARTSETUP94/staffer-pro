import { decalerJoursOuvres, DELAIS_DEFAUT } from "./retroplanning";

export type SuggestionType = "appro" | "emballage" | "chargement" | "livraison" | "tracage" | "montage" | "finitions" | "permanence" | "rotation" | "demontage" | "dechargement";
export type SuggestionLine = { keep: boolean; date: string; type: SuggestionType; contenu: string; lieu: string; auto?: boolean };

export const LIEU_ATELIER = "Atelier";

/**
 * Complète les étapes détectées dans un email :
 * - montage sur place → conditionnement (emballage) puis chargement à l'atelier, en amont, cochés ;
 * - démontage → déchargement à l'atelier en option (décoché).
 * Ne duplique pas une étape déjà présente.
 */
export function completerSuggestionsEmail(lines: SuggestionLine[], delais = DELAIS_DEFAUT): SuggestionLine[] {
  const has = (t: SuggestionType) => lines.some((l) => l.type === t);
  const earliest = (t: SuggestionType) => lines.filter((l) => l.type === t).map((l) => l.date).sort()[0];
  const latest = (t: SuggestionType) => lines.filter((l) => l.type === t).map((l) => l.date).sort().at(-1);
  const extra: SuggestionLine[] = [];
  const ref = earliest("livraison") ?? earliest("montage");
  if (has("montage") && ref) {
    const charg = earliest("chargement") ?? decalerJoursOuvres(ref, -delais.delai_chargement);
    if (!has("chargement")) extra.push({ keep: true, auto: true, date: charg, type: "chargement", contenu: "Chargement à l'atelier", lieu: LIEU_ATELIER });
    if (!has("emballage")) extra.push({ keep: true, auto: true, date: decalerJoursOuvres(charg, -delais.delai_emballage), type: "emballage", contenu: "Conditionnement", lieu: LIEU_ATELIER });
  }
  const dem = latest("demontage");
  if (dem && !has("dechargement")) {
    extra.push({ keep: false, auto: true, date: decalerJoursOuvres(dem, delais.delai_dechargement), type: "dechargement", contenu: "Déchargement", lieu: LIEU_ATELIER });
  }
  return [...lines, ...extra].sort((a, b) => a.date.localeCompare(b.date));
}
