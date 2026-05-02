/**
 * v0.23 — Fixtures matrices Excel (mock structure Progbat).
 *
 * Format : matrice [N°, Désignation, Qté, Unité, PU HT, Total HT, Temps prévu]
 * Header row inclus. Permet aux tests d'appeler parseDevisProgbatFromMatrix sans xlsx.
 *
 * Reproduit la structure observée sur les 14 devis Progbat réels :
 *  - Niveau 1 = lot principal (objet ou chantier)
 *  - Niveau 2 = objet (parfois) ou phase
 *  - Niveau 3+ = sous-prestations métier
 */

export type FixtureMatrix = (string | number | null)[][];

const HEADER: FixtureMatrix[number] = [
  "N°",
  "Désignation",
  "Qté",
  "Unité",
  "PU HT",
  "Total HT",
  "Temps prévu",
];

function meta(num: string, lib: string): FixtureMatrix {
  return [[num, "", "", "", "", "", ""], [lib, "", "", "", "", "", ""], HEADER];
}

/* ============================================================ */
/* D-2153 — 4 objets fabrication                                 */
/* ============================================================ */
export const FIXTURE_D2153: FixtureMatrix = [
  ...meta("D-2153", "Stand expo client A"),
  ["1", "Bar central", 1, "u", null, null, null],
  ["1.1", "Bureau d'étude", 1, "h", 60, 480, 8],
  ["1.2", "Construction bois", 1, "ff", 50, 1200, 24],
  ["1.3", "Peinture laque finition", 1, "ff", 25, 300, 6],
  ["1.4", "Liste de matière pour bois", 1, "ff", 800, 800, null],
  ["2", "Banquette VIP", 2, "u", null, null, null],
  ["2.1", "Bureau d'étude", 1, "h", 60, 240, 4],
  ["2.2", "Métallerie soudure", 1, "ff", 50, 750, 15],
  ["2.3", "Tapisserie garnissage", 1, "ff", 45, 540, 12],
  ["2.4", "Liste des tissus matière courant", 1, "ff", 600, 600, null],
  ["3", "Cloison décor", 1, "u", null, null, null],
  ["3.1", "Construction bois", 1, "ff", 50, 800, 16],
  ["3.2", "Numérique découpe CNC", 1, "ff", 60, 480, 8],
  ["3.3", "Peinture laque", 1, "ff", 25, 250, 5],
  ["4", "Totem signalétique", 3, "u", null, null, null],
  ["4.1", "Bureau d'étude", 1, "h", 60, 180, 3],
  ["4.2", "Numérique impression 3D", 1, "ff", 60, 360, 6],
  ["4.3", "Manutention emballage", 1, "ff", 35, 105, 3],
  ["5", "Montage sur site", 1, "ff", null, 2000, 40],
  ["6", "Démontage", 1, "ff", null, 800, 16],
];

/* ============================================================ */
/* D-2141 — 3 bars (phases sommées)                              */
/* ============================================================ */
export const FIXTURE_D2141: FixtureMatrix = [
  ...meta("D-2141", "3 bars événement Y"),
  ["1", "Bar A", 1, "u", null, null, null],
  ["1.1", "Phase étude — Bureau d'étude", 1, "ff", null, 360, 6],
  ["1.2", "Phase fab — Construction bois", 1, "ff", null, 1000, 20],
  ["1.3", "Phase finition — Peinture", 1, "ff", null, 250, 5],
  ["2", "Bar B", 1, "u", null, null, null],
  ["2.1", "Phase étude — Bureau d'étude", 1, "ff", null, 240, 4],
  ["2.2", "Phase fab — Métallerie", 1, "ff", null, 600, 12],
  ["2.3", "Phase finition — Peinture", 1, "ff", null, 200, 4],
  ["3", "Bar C", 1, "u", null, null, null],
  ["3.1", "Bureau d'étude", 1, "ff", null, 180, 3],
  ["3.2", "Construction bois", 1, "ff", null, 800, 16],
  ["4", "Montage day 1", 1, "ff", null, 1500, 30],
  ["5", "Démontage day 4", 1, "ff", null, 600, 12],
];

/* ============================================================ */
/* D-2023 — 2 objets + lot Achat (exclu)                         */
/* ============================================================ */
export const FIXTURE_D2023: FixtureMatrix = [
  ...meta("D-2023", "Mobilier showroom"),
  ["1", "Présentoir A", 1, "u", null, null, null],
  ["1.1", "Bureau d'étude", 1, "ff", null, 300, 5],
  ["1.2", "Construction bois", 1, "ff", null, 900, 18],
  ["1.3", "Peinture vernis", 1, "ff", null, 200, 4],
  ["2", "Présentoir B", 1, "u", null, null, null],
  ["2.1", "Bureau d'étude", 1, "ff", null, 240, 4],
  ["2.2", "Métallerie ferronnerie", 1, "ff", null, 700, 14],
  ["3", "Achat fournitures spéciales", 1, "ff", null, 1200, null],
  ["3.1", "Achat — Quincaillerie spéciale", 1, "ff", null, 1200, null],
  ["4", "Montage", 1, "ff", null, 600, 12],
];

/* ============================================================ */
/* D-1973 — 1 prototype                                          */
/* ============================================================ */
export const FIXTURE_D1973: FixtureMatrix = [
  ...meta("D-1973", "Prototype maquette"),
  ["1", "Prototype démonstrateur", 1, "u", null, null, null],
  ["1.1", "Bureau d'étude", 1, "ff", null, 600, 10],
  ["1.2", "Numérique CNC + impression 3D", 1, "ff", null, 480, 8],
  ["1.3", "Construction bois", 1, "ff", null, 500, 10],
  ["1.4", "Peinture laque", 1, "ff", null, 150, 3],
  ["1.5", "Manutention conditionnement", 1, "ff", null, 70, 2],
];

/* ============================================================ */
/* D-1816 — 1 objet simple                                       */
/* ============================================================ */
export const FIXTURE_D1816: FixtureMatrix = [
  ...meta("D-1816", "Mur signalétique"),
  ["1", "Mur signalétique 4x3m", 1, "u", null, null, null],
  ["1.1", "Construction bois — ossature", 1, "ff", null, 800, 16],
  ["1.2", "Peinture laque", 1, "ff", null, 300, 6],
  ["2", "Pose sur site", 1, "ff", null, 400, 8],
];

/* ============================================================ */
/* D-1831 — 3 objets (Qté 4 et 27)                               */
/* ============================================================ */
export const FIXTURE_D1831: FixtureMatrix = [
  ...meta("D-1831", "Mobilier événement Z"),
  ["1", "Tabouret", 27, "u", null, null, null],
  ["1.1", "Bureau d'étude", 1, "ff", null, 120, 2],
  ["1.2", "Métallerie soudure", 1, "ff", null, 250, 5],
  ["1.3", "Tapisserie tissu", 1, "ff", null, 180, 4],
  ["2", "Table haute", 4, "u", null, null, null],
  ["2.1", "Bureau d'étude", 1, "ff", null, 180, 3],
  ["2.2", "Construction bois", 1, "ff", null, 400, 8],
  ["2.3", "Peinture", 1, "ff", null, 100, 2],
  ["3", "Plateau service", 1, "u", null, null, null],
  ["3.1", "Construction bois", 1, "ff", null, 300, 6],
  ["4", "Montage", 1, "ff", null, 800, 16],
  ["5", "Démontage", 1, "ff", null, 400, 8],
];

/* ============================================================ */
/* D-1625 — 4 objets (Tissu = Tapisserie)                        */
/* ============================================================ */
export const FIXTURE_D1625: FixtureMatrix = [
  ...meta("D-1625", "Banquettes lounge"),
  ["1", "Banquette 2 places", 2, "u", null, null, null],
  ["1.1", "Bureau d'étude", 1, "ff", null, 150, 2.5],
  ["1.2", "Construction bois", 1, "ff", null, 400, 8],
  ["1.3", "Tissu garnissage", 1, "ff", null, 250, 5],
  ["2", "Banquette 3 places", 2, "u", null, null, null],
  ["2.1", "Bureau d'étude", 1, "ff", null, 180, 3],
  ["2.2", "Construction bois", 1, "ff", null, 500, 10],
  ["2.3", "Tissu rembourrage", 1, "ff", null, 300, 6],
  ["3", "Pouf", 6, "u", null, null, null],
  ["3.1", "Construction bois", 1, "ff", null, 80, 1.5],
  ["3.2", "Tissu garnissage", 1, "ff", null, 100, 2],
  ["4", "Cloison séparation", 1, "u", null, null, null],
  ["4.1", "Construction bois", 1, "ff", null, 600, 12],
  ["4.2", "Peinture laque", 1, "ff", null, 200, 4],
];

/* ============================================================ */
/* D-1665 — 1 objet + renvoi "Voir devis 1586"                   */
/* ============================================================ */
export const FIXTURE_D1665: FixtureMatrix = [
  ...meta("D-1665", "Complément stand"),
  ["1", "Module additionnel", 1, "u", null, null, null],
  ["1.1", "Bureau d'étude", 1, "ff", null, 300, 5],
  ["1.2", "Construction bois", 1, "ff", null, 700, 14],
  ["1.3", "Peinture", 1, "ff", null, 150, 3],
  ["2", "Voir devis 1586 pour la base", 1, "ff", null, 0, null],
];

/* ============================================================ */
/* D-1707 — 2 objets                                             */
/* ============================================================ */
export const FIXTURE_D1707: FixtureMatrix = [
  ...meta("D-1707", "Décor scénique"),
  ["1", "Décor mur fond", 1, "u", null, null, null],
  ["1.1", "Bureau d'étude", 1, "ff", null, 360, 6],
  ["1.2", "Construction bois", 1, "ff", null, 1200, 24],
  ["1.3", "Peinture patine", 1, "ff", null, 400, 8],
  ["2", "Praticable", 4, "u", null, null, null],
  ["2.1", "Construction bois", 1, "ff", null, 300, 6],
  ["2.2", "Peinture", 1, "ff", null, 100, 2],
  ["3", "Permanence montage", 1, "ff", null, 1000, 20],
];

/* ============================================================ */
/* D-2022 — chantier seul (0 objet)                              */
/* ============================================================ */
export const FIXTURE_D2022: FixtureMatrix = [
  ...meta("D-2022", "Pose seule sur site"),
  ["1", "Montage day 1", 1, "ff", null, 1200, 24],
  ["2", "Montage day 2", 1, "ff", null, 1200, 24],
  ["3", "Démontage", 1, "ff", null, 600, 12],
  ["4", "Transport livraison", 1, "ff", null, 400, null],
];

/* ============================================================ */
/* D-1650 — chantier seul (0 objet)                              */
/* ============================================================ */
export const FIXTURE_D1650: FixtureMatrix = [
  ...meta("D-1650", "Permanence event"),
  ["1", "Permanence montage day 1", 1, "ff", null, 800, 16],
  ["2", "Permanence montage day 2", 1, "ff", null, 800, 16],
  ["3", "Démontage day 3", 1, "ff", null, 400, 8],
];

/* ============================================================ */
/* D-2028 — 1 objet + budget accessoires                         */
/* ============================================================ */
export const FIXTURE_D2028: FixtureMatrix = [
  ...meta("D-2028", "Stand modulaire"),
  ["1", "Module exposition", 1, "u", null, null, null],
  ["1.1", "Bureau d'étude", 1, "ff", null, 480, 8],
  ["1.2", "Construction bois", 1, "ff", null, 1500, 30],
  ["1.3", "Métallerie", 1, "ff", null, 600, 12],
  ["1.4", "Peinture laque", 1, "ff", null, 300, 6],
  ["1.5", "Budget accessoires", 1, "ff", null, 450, null],
  ["1.6", "Liste de matière pour bois", 1, "ff", null, 950, null],
  ["2", "Montage", 1, "ff", null, 600, 12],
];

/* ============================================================ */
/* D-2133 — chantier seul transport (0 objet)                    */
/* ============================================================ */
export const FIXTURE_D2133: FixtureMatrix = [
  ...meta("D-2133", "Transport et installation"),
  ["1", "Transport aller", 1, "ff", null, 600, null],
  ["2", "Transport retour", 1, "ff", null, 600, null],
  ["3", "Pose sur site", 1, "ff", null, 1200, 24],
  ["4", "Dépose", 1, "ff", null, 600, 12],
];

/* ============================================================ */
/* D-3204 — Devis Progbat moderne 3 niveaux (cas test Gabin)     */
/*  Section 1 = "I2 BAR A COCKTAIL DOUBLE" (regroupement visuel) */
/*    Objet 1.1 "Remise en peinture du bar existant" qte=1       */
/*      Postes 1.1.1 BE, 1.1.2 Construction, 1.1.3 Peinture      */
/*    Objet 1.2 "Décor mural" qte=2                              */
/*      Postes 1.2.1 Numérique, 1.2.2 Peinture                   */
/*  Section 2 = "MOBILIER VIP"                                   */
/*    Objet 2.1 "Tabouret haut" qte=12                           */
/*      Postes 2.1.1 Métallerie, 2.1.2 Tissu                     */
/*  Avec descriptions (lignes commentaires sans numéro).         */
/* ============================================================ */
export const FIXTURE_D3204: FixtureMatrix = [
  ...meta("D-3204", "Bar cocktail + mobilier VIP"),
  // Section 1 : Temps prévu déclaré = 8 + 24 + 6 + (3+5)*2 = 54h
  ["1", "I2 BAR A COCKTAIL DOUBLE", null, "", null, null, 54],
  // Objet 1.1 qte=1
  ["1.1", "Remise en peinture du bar existant", 1, "u", null, null, null],
  ["", "Bar bois 4m × 1m, plateau zinc, 4 pieds laqués", null, "", null, null, null],
  ["1.1.1", "Tarif du bureau d'étude", 1, "h", 60, 480, 8],
  ["1.1.2", "Construction heures", 1, "h", 50, 1200, 24],
  ["1.1.3", "Peinture nombre d'heures", 1, "h", 50, 300, 6],
  ["1.1.4", "Liste de matière pour bois", 1, "ff", 800, 800, null],
  // Objet 1.2 qte=2 → heures par UNITE × 2
  ["1.2", "Décor mural lumineux", 2, "u", null, null, null],
  ["", "Panneau LED 1.5m diffuseur PMMA", null, "", null, null, null],
  ["1.2.1", "Numérique nb d'heures", 1, "h", 60, 360, 3],
  ["1.2.2", "Peinture heures", 1, "h", 50, 500, 5],
  ["1.2.3", "LED + PMMA", 1, "ff", 250, 250, null],
  // Section 2 : Temps prévu déclaré = (3+4)*12 = 84h
  ["2", "MOBILIER VIP", null, "", null, null, 84],
  // Objet 2.1 qte=12
  ["2.1", "Tabouret haut", 12, "u", null, null, null],
  ["", "Assise tissu vert mousse h.75cm", null, "", null, null, null],
  ["2.1.1", "Métallerie heures", 1, "h", 50, 1800, 3],
  ["2.1.2", "Tissu nb d'heures", 1, "h", 45, 2160, 4],
  // Lots chantier
  ["3", "Montage day 1", 1, "ff", null, 2000, 40],
  ["4", "Démontage day 4", 1, "ff", null, 800, 16],
];

/* ============================================================ */
/* D-2150 — fabrication avec quantités multiples (cas Gabin)    */
/*  Section 1 : objets 1.1 (qte=60), 1.4 (qte=8), 1.5 (qte=3)   */
/*  Cas spécial : 1 poste "Suivi de projet" → BE                */
/* ============================================================ */
export const FIXTURE_D2150: FixtureMatrix = [
  ...meta("D-2150", "Décor événementiel"),
  // Section 1 : Temps déclaré = 60*0.15 + 8*1 + 3*2 = 9 + 8 + 6 = 23h
  ["1", "DECOR PRINCIPAL", null, "", null, null, 23],
  // Fausses briques qte=60
  ["1.1", "Fausse briques", 60, "u", null, null, null],
  ["1.1.1", "Numérique nb d'heures", 1, "h", 60, 540, 0.15],
  ["1.1.2", "Liste de matière pour bois", 1, "ff", 5, 300, null],
  // Châssis qte=8
  ["1.4", "Châssis tendu", 8, "u", null, null, null],
  ["", "Format 2m × 1m toile coton", null, "", null, null, null],
  ["1.4.1", "Construction heures", 1, "h", 50, 400, 1],
  // Stèles qte=3
  ["1.5", "Stèles", 3, "u", null, null, null],
  ["1.5.1", "Peinture nombre d'heures", 1, "h", 50, 300, 2],
  ["1.5.2", "Liste de matière pour bois", 1, "ff", 100, 300, null],
  // Suivi de projet → BE (cas Gabin : 14h)
  ["2", "SUIVI", null, "", null, null, 14],
  ["2.1", "Suivi de projet heures", 14, "h", 60, 840, 1],
];

/* ============================================================ */
/* D-1832 — Test 100% mapping auto (803h cas Gabin)              */
/*  Plusieurs objets, tous métiers, descriptions, qté variables  */
/* ============================================================ */
export const FIXTURE_D1832: FixtureMatrix = [
  ...meta("D-1832", "Stand expo majeur"),
  // Section 1 : Temps déclaré = (8+20+5)*1 + (4+12+4)*2 = 33 + 40 = 73h
  ["1", "STAND PRINCIPAL", null, "", null, null, 73],
  ["1.1", "Bar central", 1, "u", null, null, null],
  ["", "Bar L4m fond miroir", null, "", null, null, null],
  ["1.1.1", "Tarif du bureau d'étude", 1, "h", 60, 480, 8],
  ["1.1.2", "Construction heures", 1, "h", 50, 1000, 20],
  ["1.1.3", "Peinture nombre d'heures", 1, "h", 50, 250, 5],
  ["1.1.4", "Budget matériaux", 1, "ff", 800, 800, null],
  ["1.2", "Banquette VIP", 2, "u", null, null, null],
  ["", "L1.8m garnissage velours bleu nuit", null, "", null, null, null],
  ["1.2.1", "Tarif du bureau d'étude", 1, "h", 60, 480, 4],
  ["1.2.2", "Métallerie heures", 1, "h", 50, 1200, 12],
  ["1.2.3", "Tissu nb d'heures", 1, "h", 45, 360, 4],
  // Section 2 : Temps déclaré = (10+8)*1 = 18h
  ["2", "SIGNALETIQUE", null, "", null, null, 18],
  ["2.1", "Totem signalétique 3m", 1, "u", null, null, null],
  ["2.1.1", "Numérique nb d'heures", 1, "h", 60, 600, 10],
  ["2.1.2", "Construction heures", 1, "h", 50, 400, 8],
  ["2.1.3", "PMMA + adhésif", 1, "ff", 350, 350, null],
  // Section 3 : juste un poste manutention prémontage = 4h
  ["3", "PREMONTAGE ATELIER", null, "", null, null, 4],
  ["3.1", "Heures prémontage logistique interne", 1, "h", 35, 140, 4],
  // Lots chantier
  ["4", "Montage sur site day 1", 1, "ff", null, 3000, 60],
  ["5", "Démontage day 4", 1, "ff", null, 1200, 24],
];

/* ============================================================ */
/* D-2128 — 4e devis calibrage Gabin (585h, 100% mapping cible)  */
/*  Section 5 "Permanence" qte=3 → poste 5.1 affiche 10h           */
/*  → total réel = 10 × 3 = 30h (règle quantité Section)         */
/*  Inclut nouveaux patterns : Plans techniques (BE),             */
/*  Démontage Pecqueuse (Démontage), Stockage (Manutention),      */
/*  Budget matériaux avec heures (bascule Manutention),           */
/*  Liste des principales fournitures en logistique idem.         */
/* ============================================================ */
export const FIXTURE_D2128: FixtureMatrix = [
  ...meta("D-2128", "Stand modulaire + permanence"),
  // Section 1 : étude technique BE = 12 + 6 = 18h
  ["1", "ETUDES", null, "", null, null, 18],
  ["1.1", "Étude générale", 1, "u", null, null, null],
  ["1.1.1", "Tarif du bureau d'étude", 1, "h", 60, 720, 12],
  ["1.1.2", "Plans techniques heures", 1, "h", 60, 360, 6],
  // Section 2 : fabrication = 40 + 30 + 20 = 90h
  ["2", "FABRICATION", null, "", null, null, 90],
  ["2.1", "Bar principal 4m", 1, "u", null, null, null],
  ["2.1.1", "Construction heures", 1, "h", 50, 2000, 40],
  ["2.1.2", "Métallerie heures", 1, "h", 50, 1500, 30],
  ["2.1.3", "Peinture nombre d'heures", 1, "h", 50, 1000, 20],
  // Section 3 : logistique avec bascule conditionnelle = 8 + 4 = 12h
  ["3", "LOGISTIQUE", null, "", null, null, 12],
  ["3.1", "Logistique atelier", 1, "u", null, null, null],
  ["3.1.1", "Budget matériaux", 1, "h", 35, 280, 8], // bascule → manutention 8h
  ["3.1.2", "Liste des principales fournitures en logistique", 1, "h", 35, 140, 4], // bascule → manutention 4h
  // Section 4 : stockage = 5h (nouveau pattern)
  ["4", "STOCKAGE", null, "", null, null, 5],
  ["4.1", "Stockage atelier", 1, "u", null, null, null],
  ["4.1.1", "Stockage", 1, "h", 35, 175, 5],
  // Section 5 : groupe qte=3 — poste affiche 10h → total = 30h (règle qte Section)
  ["5", "ANIMATION SUR SITE", 3, "", null, null, 30],
  ["5.1", "Logistique sur site", 1, "u", null, null, null],
  ["5.1.1", "Logistique interne", 1, "h", 35, 350, 10],
  // Lots chantier : Montage + Démontage Pecqueuse (nouveau pattern Démontage)
  ["6", "Montage day 1", 1, "ff", null, 20000, 400],
  ["7", "Démontage Pecqueuse", 1, "ff", null, 1500, 30],
];

/* ============================================================ */
/* Index                                                         */
/* ============================================================ */
export const ALL_FIXTURES = {
  "D-2153": FIXTURE_D2153,
  "D-2141": FIXTURE_D2141,
  "D-2023": FIXTURE_D2023,
  "D-1973": FIXTURE_D1973,
  "D-1816": FIXTURE_D1816,
  "D-1831": FIXTURE_D1831,
  "D-1625": FIXTURE_D1625,
  "D-1665": FIXTURE_D1665,
  "D-1707": FIXTURE_D1707,
  "D-2022": FIXTURE_D2022,
  "D-1650": FIXTURE_D1650,
  "D-2028": FIXTURE_D2028,
  "D-2133": FIXTURE_D2133,
  "D-3204": FIXTURE_D3204,
  "D-2150": FIXTURE_D2150,
  "D-1832": FIXTURE_D1832,
  "D-2128": FIXTURE_D2128,
} as const;
