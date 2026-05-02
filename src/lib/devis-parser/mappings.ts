/**
 * v0.31.4 — Mappings parser devis Progbat (regex case-insensitive ordonnées).
 *
 * Calibré sur 3 devis réels (3204, 2150, 1832) + 13 fixtures historiques.
 * Patterns figés avec Gabin :
 *  - Bois : "Construction heures", "Bois nb heures constructeurs", "Construction en atelier"
 *  - Métal : "Métallerie" + "heures"
 *  - Peinture : "Peinture (nombre d')heures" — m² peinture est MATERIEL
 *  - Numérique : "Numérique nb d'heures"
 *  - BE : "Tarif du bureau d'étude" / "bureau d'étude" / "Suivi de projet heures" / "Suivi de chantier"
 *  - Tapisserie : "Tissu nb d'heures"
 *  - Manutention : "Logistique interne", "Heures prémontage", typo "Logisitique"
 *  - Manutention/Montage : "Montage heures"
 *  - Manutention/Démontage : "Démontage heures"
 *
 * Catégorie matériel (hors heures) :
 *  - "m² de peinture", "Liste de matière", "Budget matériaux", "Budget location",
 *    "Fournitures d'emballage", "LED", "PMMA", "Prix loca", "Numérique - à ajouter - matière"
 *
 * Régul : ignoré (0 h) mais total HT conservé. Si Temps prévu > 0 → flag manuel.
 */

import type { FabMetier } from "@/hooks/use-fabrication";

/** Étape de gestion (5 étapes v0.22) liée à un métier atelier. */
export type FabricationEtapeType = "be" | "usinage" | "respo_fab" | "finition" | "manutention";

export const METIER_TO_ETAPE: Record<FabMetier, FabricationEtapeType> = {
  be: "be",
  numerique: "usinage",
  bois: "respo_fab",
  metal: "respo_fab",
  peinture: "finition",
  tapisserie: "finition",
  manutention: "manutention",
};

/* -------------------------------------------------------------------------- */
/* Patterns regex métiers — ORDRE PRIORITAIRE strict.                         */
/* Le premier qui matche gagne. Matériel doit être testé AVANT métier.        */
/* -------------------------------------------------------------------------- */

/**
 * Patterns matière / matériel (testés en priorité absolue).
 * NOTE v0.31.4c : "budget matériaux" et "fournitures logistique" deviennent
 * conditionnels (cf. isMatiereContextual) : si la ligne porte du temps prévu
 * elle bascule en heures Manutention/Logistique. Les patterns purs restent
 * ici pour le cas Temps prévu = 0.
 */
export const MATIERE_REGEX: RegExp[] = [
  /m2 de peinture/i,
  /m²\s*de peinture/i,
  /m2 peinture/i,
  /m²\s*peinture/i,
  /liste de mati[èe]re/i,
  /budget mat[ée]riaux/i,
  /budget location/i,
  /budget accessoires/i,
  /fournitures d'?emballage/i,
  /fournitures logistique/i,
  /liste des principales fournitures en logistique/i,
  /\bled\b/i,
  /\bpmma\b/i,
  /\bsunclear\b/i,
  /\bplexi\b/i,
  /\bpvc\b/i,
  /linno imprim[ée]/i,
  /adh[ée]sif/i,
  /quincaillerie/i,
  /mati[èe]re premi[èe]re/i,
  /prix loca/i,
  /num[ée]rique\s*-\s*[àa]\s*ajouter\s*-\s*mati[èe]re/i,
  /liste des [ée]l[ée]ments en m[ée]tal mati[èe]re/i,
  /m[ée]tal mati[èe]re/i,
  /liste des tissus mati[èe]re/i,
];

/**
 * v0.31.4c — Patterns "matière conditionnelle" : ces libellés sont matière
 * UNIQUEMENT si la ligne ne porte pas d'heures. Sinon ils valent Manutention
 * (heures de récupération matière / logistique interne).
 */
export const MATIERE_CONDITIONAL_REGEX: RegExp[] = [
  /budget mat[ée]riaux/i,
  /liste des principales fournitures en logistique/i,
  /fournitures logistique/i,
];

/**
 * Table métier → patterns (ordre PRIORITAIRE).
 * Évalué dans l'ordre : be → numerique → metal → tapisserie → peinture → manutention → bois.
 * Bois en dernier car "construction" capture beaucoup.
 */
export const METIER_REGEX: Record<FabMetier, RegExp[]> = {
  be: [
    /tarif du bureau d['’ ]?[ée]tude/i,
    /bureau d['’ ]?[ée]tude/i,
    /suivi de projet[ _-]?heures?/i,
    /suivi de projet/i,
    /suivi de chantier/i,
    /plans techniques[ _-]?heures?/i,
    /plans techniques/i,
    /visite technique/i,
    /[ée]tude technique/i,
    /\bbe\s+(?:heures?|nb)/i,
  ],
  numerique: [
    /num[ée]rique[ _-]+(?:nb d['’ ]?)?heures?/i,
    /num[ée]rique\s+heures?/i,
    /\bnum[ée]rique\b/i,
    /d[ée]coupe\s*cnc/i,
    /\bcnc\b/i,
    /d[ée]coupe\s*laser/i,
    /\blaser\b/i,
    /impression\s*3d/i,
    /\b3d\b/i,
    /imprimante/i,
    /fraisage num[ée]rique/i,
  ],
  metal: [
    /m[ée]tallerie[^a-z]*(?:heures?|nb)?/i,
    /m[ée]tallerie/i,
    /serrurerie/i,
    /soudure/i,
    /ferronnerie/i,
    /\bm[ée]tal\b.*heures?/i,
  ],
  tapisserie: [
    /tissu[ _-]+(?:nb d['’ ]?)?heures?/i,
    /tapisserie/i,
    /rembourrage/i,
    /garnissage/i,
    /\btissus?\b/i,
  ],
  peinture: [
    /peinture[ _-]+(?:nombre d['’ ]?)?heures?/i,
    /peinture\s+heures?/i,
    /\bpeinture\b/i,
    /\bvernis\b/i,
    /\blaque\b/i,
  ],
  manutention: [
    /logistique interne/i,
    /heures pr[ée]montage/i,
    /pr[ée]montage/i,
    /logisitique/i, // typo Progbat
    /\blogistique\b/i,
    /^stockage$/i,
    /conditionnement/i,
    /emballage/i,
    /\bmanutention\b/i,
    /pr[ée]paration atelier/i,
    // v0.31.5 (item #113) — Coursier / livreur / chauffeur → Logistique (Manutention)
    /\bcoursier\b/i,
    /\bcoursiers?\b/i,
    /\blivreur\b/i,
    /\bchauffeur\b/i,
    /\bnavette\b/i,
  ],
  bois: [
    /construction[ _-]+heures?/i,
    /bois[ _-]+nb heures? constructeurs?/i,
    /construction en atelier/i,
    /\bconstruction\b/i,
    /\bconstructeurs?\b/i,
    /atelier bois/i,
    /menuiserie/i,
    /\bbois\b/i,
  ],
};

/** Ordre d'évaluation des métiers (priorité décroissante). */
export const METIER_ORDER: FabMetier[] = [
  "be",
  "numerique",
  "metal",
  "tapisserie",
  "peinture",
  "manutention",
  "bois",
];

/* -------------------------------------------------------------------------- */
/* Lots chantier (heures globales affaire).                                   */
/* -------------------------------------------------------------------------- */

export const MONTAGE_REGEX: RegExp[] = [
  /montage[ _-]+heures?/i,
  /\bmontage\b/i,
  /\bpose\b/i,
  /installation/i,
  /permanence/i,
  /tracage/i,
  /day\s*\d/i,
];

export const DEMONTAGE_REGEX: RegExp[] = [
  /d[ée]montage[ _-]+heures?/i,
  /\bd[ée]montage\b/i,
  /\bd[ée]pose\b/i,
  /d[ée]montage[ _-]?pecqueuse/i,
];

export const CHANTIER_REGEX: RegExp[] = [
  ...MONTAGE_REGEX,
  ...DEMONTAGE_REGEX,
  /transport/i,
  /livraison/i,
  /conditionnement et transport/i,
];

/* -------------------------------------------------------------------------- */
/* Régul : ignorée par défaut (0 h) mais total HT conservé. Si Temps prévu    */
/* > 0 → on retourne true sur isRegul + flag manuel ailleurs.                 */
/* -------------------------------------------------------------------------- */
export const REGUL_REGEX: RegExp[] = [
  /^r[ée]gul/i,
  /^cadrage/i,
  /\br[ée]gul[ée]?\b/i,
];

/* -------------------------------------------------------------------------- */
/* Lignes à exclure totalement (vraiment parasites).                          */
/* -------------------------------------------------------------------------- */
export const EXCLUDE_REGEX: RegExp[] = [
  // v0.31.5 — "Remise" exclu UNIQUEMENT si suivi d'un mot commercial / chiffre.
  // Bug devis 2141 : "Remise en peinture du bar existant" était exclu à tort.
  /^remise\s+(?:commerciale|client|consentie|exceptionnelle|globale|forfaitaire|sur\b|de\s+\d|[-\d])/i,
  /remise commerciale/i,
  /\bbenne\b/i,
  /\bleurre\b/i,
  /prix itw/i,
  /voir devis/i,
  /^achat\b/i,
  /sous[- ]total/i,
  /^total ht/i,
  /^total ttc/i,
];

/** Renvois externes "Voir devis XXXX" — pattern à détecter. */
export const RENVOI_REGEX = /voir\s+devis\s+([A-Z0-9-]+)/gi;

/* -------------------------------------------------------------------------- */
/* Backward compat : mots-clés utilisés par anciens callers (string-based).   */
/* On expose des arrays string pour ne pas casser les imports existants.      */
/* -------------------------------------------------------------------------- */

export const METIER_KEYWORDS: Record<FabMetier, string[]> = {
  be: ["bureau d'etude", "tarif du bureau d'etude", "suivi de projet", "suivi de chantier", "plans techniques"],
  numerique: ["numerique", "cnc", "laser", "impression 3d", "fraisage"],
  bois: ["construction", "bois", "constructeurs", "menuiserie"],
  metal: ["metallerie", "metal", "serrurerie", "soudure", "ferronnerie"],
  peinture: ["peinture", "vernis", "laque"],
  tapisserie: ["tissu", "tapisserie", "rembourrage", "garnissage"],
  manutention: ["logistique", "logisitique", "conditionnement", "emballage", "premontage", "manutention", "coursier", "livreur", "chauffeur", "navette"],
};

export const CHANTIER_KEYWORDS = ["montage", "pose", "installation", "permanence", "demontage", "depose", "transport"];
export const MONTAGE_KEYWORDS = ["montage", "pose", "installation", "permanence", "tracage", "day"];
export const DEMONTAGE_KEYWORDS = ["demontage", "depose"];
export const EXCLUDE_KEYWORDS = ["regul", "remise", "benne", "leurre", "voir devis", "achat", "sous-total", "sous total", "total ht", "total ttc"];
export const MATIERE_KEYWORDS = ["liste de matiere", "budget materiaux", "metal matiere", "tissus matiere", "pmma", "sunclear", "pvc", "plexi", "linno", "adhesif", "fournitures", "quincaillerie", "budget accessoires", "matiere premiere", "m2 peinture", "m² peinture", "led", "prix loca"];
