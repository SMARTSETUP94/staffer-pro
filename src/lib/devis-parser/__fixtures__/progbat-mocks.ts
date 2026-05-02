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
} as const;
