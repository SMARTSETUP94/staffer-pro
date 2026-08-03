/**
 * LOT 8 — Parseur du classeur « planning Excel » (amorçage des données).
 *
 * Module PUR : il ne connaît ni Supabase ni `xlsx-js-style`. L'appelant lui
 * fournit les onglets déjà lus sous forme de tableaux de tableaux (AOA), ce
 * qui rend le parseur testable sans fichier binaire.
 *
 * Conversion de référence : le fichier exprime des JOURS-HOMMES
 * (`Nb pers.` × 1 jour). 1 personne-jour = HEURES_PAR_PERSONNE_JOUR heures.
 */
import { makeIssue, parseExcelDate, parseExcelNumber, type ImportIssue } from "@/lib/import-validation";

/** 1 personne-jour = 8 h (convention atelier, cf. HEURES_PAR_JOUR planning-atelier). */
export const HEURES_PAR_PERSONNE_JOUR = 8;

/* -------------------------------------------------------------- normalisation */

/** minuscule, sans accents, sans ponctuation ni espaces multiples. */
export function normLabel(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cellText(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).replace(/\s+/g, " ").trim();
}

/** « Oui », « OUI », « 🌙 Oui », « x », « true » → true. */
export function parseOuiNon(raw: unknown): boolean {
  const n = normLabel(raw);
  if (!n) return false;
  return ["oui", "o", "x", "true", "vrai", "1", "yes"].some((v) => n === v || n.endsWith(` ${v}`) || n.startsWith(`${v} `));
}

/* ------------------------------------------------------------- métiers mapping */

export interface MetierMapping {
  metierId: number | null;
  /** `Sous-traitance` n'est pas un métier : la ligne est marquée et exclue de la charge. */
  sousTraitance: boolean;
  reconnu: boolean;
}

/**
 * Synonymes fichier → `metiers.id`. Table volontairement extensible : ajouter
 * une entrée suffit, la reconnaissance est insensible à la casse/aux accents.
 */
export const METIER_SYNONYMES: Record<string, number> = {
  // 1 — Menuiserie
  bois: 1, menuiserie: 1, menuisier: 1, construction: 1, "menuiserie bois": 1,
  // 2 — Métallerie
  metal: 2, metallerie: 2, serrurerie: 2, metallier: 2, soudure: 2,
  // 3 — Peinture
  peinture: 3, peintre: 3, finition: 3, "peinture finition": 3,
  // 4 — Numérique
  numerique: 4, cnc: 4, "usinage numerique": 4, usinage: 4, "commande numerique": 4,
  // 5 — Tapisserie
  tapisserie: 5, tapissier: 5, "tissu": 5,
  // 6 — Machiniste
  machiniste: 6, machinerie: 6,
  // 7 — Logistique
  logistique: 7, manutention: 7, transport: 7, livraison: 7,
  // 8 — Bureau d'étude
  "bureau d etude": 8, "bureau d etudes": 8, be: 8, "bureau etude": 8, "suivi projet": 8, dessin: 8, conception: 8,
  // 9 — Impression UV
  "impression uv": 9, impression: 9, uv: 9,
};

const SOUS_TRAITANCE_LABELS = ["sous traitance", "sous traitant", "st", "externe", "prestataire"];

export function mapMetier(raw: unknown): MetierMapping {
  const n = normLabel(raw);
  if (!n) return { metierId: null, sousTraitance: false, reconnu: false };
  if (SOUS_TRAITANCE_LABELS.includes(n)) return { metierId: null, sousTraitance: true, reconnu: true };
  const id = METIER_SYNONYMES[n];
  if (id) return { metierId: id, sousTraitance: false, reconnu: true };
  return { metierId: null, sousTraitance: false, reconnu: false };
}

/* ----------------------------------------------------------- reconnaissance UI */

export type SheetKind = "fabrication" | "livraisons" | "affectations" | "listes";

const SHEET_SYNONYMES: { kind: SheetKind; tokens: string[] }[] = [
  { kind: "fabrication", tokens: ["fabrication", "fab", "atelier", "production"] },
  { kind: "livraisons", tokens: ["livraisons chantiers", "livraisons", "chantiers", "livraison chantier", "montages"] },
  { kind: "affectations", tokens: ["affectations equipes", "affectations", "equipes", "affectation equipe"] },
  { kind: "listes", tokens: ["listes", "liste", "referentiels", "parametres"] },
];

/** Reconnaissance souple du rôle d'un onglet à partir de son nom. */
export function detectSheetKind(name: string): SheetKind | null {
  const n = normLabel(name);
  if (!n) return null;
  for (const s of SHEET_SYNONYMES) {
    if (s.tokens.some((t) => n === t)) return s.kind;
  }
  for (const s of SHEET_SYNONYMES) {
    if (s.tokens.some((t) => n.includes(t))) return s.kind;
  }
  return null;
}

/* ------------------------------------------------------------------- en-têtes */

type HeaderMap = Record<string, number>;

/**
 * Localise la ligne d'en-tête (première ligne contenant au moins 2 libellés
 * connus) et renvoie l'index de colonne pour chaque champ canonique.
 */
function findHeader(
  rows: unknown[][],
  fields: Record<string, string[]>,
): { headerRow: number; map: HeaderMap } | null {
  const limit = Math.min(rows.length, 15);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] ?? [];
    const map: HeaderMap = {};
    row.forEach((cell, c) => {
      const n = normLabel(cell);
      if (!n) return;
      for (const [field, syns] of Object.entries(fields)) {
        if (map[field] != null) continue;
        if (syns.some((s) => n === s || n.startsWith(`${s} `))) map[field] = c;
      }
    });
    if (Object.keys(map).length >= 2) return { headerRow: r, map };
  }
  return null;
}

const get = (row: unknown[], map: HeaderMap, field: string): unknown => {
  const i = map[field];
  return i == null ? undefined : row[i];
};

/* ------------------------------------------------------------ onglet Fabrication */

export interface FabricationRow {
  /** Ligne Excel 1-based. */
  rowIndex: number;
  projet: string;
  code: string;
  date: string | null;
  dateBrute: unknown;
  element: string;
  tache: string;
  metierRaw: string;
  metierId: number | null;
  sousTraitance: boolean;
  metierReconnu: boolean;
  nbPers: number | null;
  statut: string;
  equipe: string[];
  aCompleter: boolean;
}

const FAB_FIELDS: Record<string, string[]> = {
  projet: ["projet", "chantier", "affaire", "projet client"],
  code: ["code", "n affaire", "numero", "num", "code affaire"],
  date: ["date", "jour"],
  element: ["element", "objet", "ouvrage", "lot"],
  tache: ["tache", "operation", "travail"],
  metier: ["metier", "pole", "corps d etat"],
  nbPers: ["nb pers", "nb personnes", "effectif", "personnes", "nb"],
  statut: ["statut", "etat"],
  equipe1: ["equipe 1", "equipe1"],
  equipe2: ["equipe 2", "equipe2"],
  equipe3: ["equipe 3", "equipe3"],
  lienTeams: ["lien teams", "teams", "lien"],
  aCompleter: ["a completer", "a faire completer", "incomplet"],
};

/* ------------------------------------------------------------ onglet Livraisons */

export interface LivraisonRow {
  rowIndex: number;
  mois: string;
  projet: string;
  /** Code affaire extrait du libellé « Projet / Client » s'il en contient un. */
  code: string | null;
  type: string;
  statut: string;
  debut: string | null;
  fin: string | null;
  duree: number | null;
  unite: string;
  nuit: boolean;
  nbTech: number | null;
  semi: number | null;
  m3_20: number | null;
  nature: string;
  notes: string;
}

const LIV_FIELDS: Record<string, string[]> = {
  mois: ["mois"],
  projet: ["projet client", "projet", "chantier", "client"],
  type: ["type", "nature operation", "prestation type"],
  statut: ["statut", "etat"],
  debut: ["debut", "date debut", "du"],
  fin: ["fin", "date fin", "au"],
  duree: ["duree"],
  unite: ["unite"],
  nuit: ["nuit", "travail de nuit"],
  nbTech: ["nb tech", "nb techniciens", "techniciens"],
  semi: ["semi", "nb semi"],
  m3_20: ["20 m3", "20m3", "20 m", "20m", "nb 20 m3", "nb 20m3"],
  nature: ["nature de la prestation", "nature prestation", "nature"],
  notes: ["notes", "commentaire", "remarques"],
};

/** Type d'opération normalisé : la livraison est traitée comme un montage. */
export type LivraisonKind = "montage" | "demontage" | "autre";

export function classifyLivraisonType(raw: unknown): LivraisonKind {
  const n = normLabel(raw);
  if (!n) return "autre";
  if (n.includes("demontage") || n.includes("repli") || n.includes("depose")) return "demontage";
  if (n.includes("montage") || n.includes("livraison") || n.includes("pose") || n.includes("installation")) {
    return "montage";
  }
  return "autre";
}

/** Extrait un code affaire à 4-5 chiffres d'un libellé libre. */
export function extractCode(raw: unknown): string | null {
  const m = /\b(\d{4,5})\b/.exec(String(raw ?? ""));
  return m ? m[1]! : null;
}

/* ---------------------------------------------------------- onglet Affectations */

export interface AffectationRow {
  rowIndex: number;
  personne: string;
  chantierRef: string;
  /** date ISO → nom de chantier saisi dans la cellule. */
  parDate: Record<string, string>;
}

/* ------------------------------------------------------------------- résultat */

export interface ParsedPlanning {
  fabrication: FabricationRow[];
  livraisons: LivraisonRow[];
  affectations: AffectationRow[];
  /** Onglets reconnus dans le classeur (nom réel → rôle). */
  sheets: { name: string; kind: SheetKind | null; rows: number }[];
  issues: ImportIssue[];
}

export type SheetInput = Record<string, unknown[][]>;

export interface ParseOptions {
  fabrication?: boolean;
  livraisons?: boolean;
  affectations?: boolean;
}

const isEmptyRow = (row: unknown[]) => row.every((c) => c == null || cellText(c) === "");

/** Parse le classeur (onglets déjà convertis en AOA). */
export function parsePlanningWorkbook(sheets: SheetInput, options: ParseOptions = {}): ParsedPlanning {
  const opts = { fabrication: true, livraisons: true, affectations: true, ...options };
  const issues: ImportIssue[] = [];
  const inventory: ParsedPlanning["sheets"] = Object.entries(sheets).map(([name, rows]) => ({
    name,
    kind: detectSheetKind(name),
    rows: Math.max(0, rows.length - 1),
  }));

  const pick = (kind: SheetKind): unknown[][] | null => {
    const entry = inventory.find((s) => s.kind === kind);
    return entry ? (sheets[entry.name] ?? null) : null;
  };

  const fabrication = opts.fabrication ? parseFabrication(pick("fabrication"), issues) : [];
  const livraisons = opts.livraisons ? parseLivraisons(pick("livraisons"), issues) : [];
  const affectations = opts.affectations ? parseAffectations(pick("affectations"), issues) : [];

  if (fabrication.length === 0 && livraisons.length === 0 && affectations.length === 0) {
    issues.push(
      makeIssue({
        severity: "error",
        code: "NO_DATA_ROWS",
        message: "Aucune ligne exploitable trouvée dans les onglets sélectionnés.",
      }),
    );
  }

  return { fabrication, livraisons, affectations, sheets: inventory, issues };
}

function parseFabrication(rows: unknown[][] | null, issues: ImportIssue[]): FabricationRow[] {
  if (!rows || rows.length === 0) return [];
  const header = findHeader(rows, FAB_FIELDS);
  if (!header) {
    issues.push(
      makeIssue({
        severity: "error",
        code: "MISSING_HEADER",
        message: "Onglet Fabrication : ligne d'en-tête introuvable (colonnes Projet / Code / Date / Élément attendues).",
      }),
    );
    return [];
  }
  const out: FabricationRow[] = [];
  for (let r = header.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (isEmptyRow(row)) continue;
    const element = cellText(get(row, header.map, "element"));
    const metierRaw = cellText(get(row, header.map, "metier"));
    const code = cellText(get(row, header.map, "code"));
    if (!element && !metierRaw && !code) continue;
    const metier = mapMetier(metierRaw);
    const dateBrute = get(row, header.map, "date");
    const equipe = ["equipe1", "equipe2", "equipe3"]
      .map((f) => cellText(get(row, header.map, f)))
      .filter(Boolean);
    out.push({
      rowIndex: r + 1,
      projet: cellText(get(row, header.map, "projet")),
      code,
      date: parseExcelDate(dateBrute),
      dateBrute,
      element,
      tache: cellText(get(row, header.map, "tache")),
      metierRaw,
      metierId: metier.metierId,
      sousTraitance: metier.sousTraitance,
      metierReconnu: metier.reconnu,
      nbPers: parseExcelNumber(get(row, header.map, "nbPers")),
      statut: cellText(get(row, header.map, "statut")),
      equipe,
      aCompleter: parseOuiNon(get(row, header.map, "aCompleter")),
    });
  }
  return out;
}

function parseLivraisons(rows: unknown[][] | null, issues: ImportIssue[]): LivraisonRow[] {
  if (!rows || rows.length === 0) return [];
  const header = findHeader(rows, LIV_FIELDS);
  if (!header) {
    issues.push(
      makeIssue({
        severity: "warning",
        code: "MISSING_HEADER",
        message: "Onglet Livraisons & Chantiers : ligne d'en-tête introuvable, onglet ignoré.",
      }),
    );
    return [];
  }
  const out: LivraisonRow[] = [];
  for (let r = header.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (isEmptyRow(row)) continue;
    const projet = cellText(get(row, header.map, "projet"));
    if (!projet) continue;
    out.push({
      rowIndex: r + 1,
      mois: cellText(get(row, header.map, "mois")),
      projet,
      code: extractCode(projet),
      type: cellText(get(row, header.map, "type")),
      statut: cellText(get(row, header.map, "statut")),
      debut: parseExcelDate(get(row, header.map, "debut")),
      fin: parseExcelDate(get(row, header.map, "fin")),
      duree: parseExcelNumber(get(row, header.map, "duree")),
      unite: cellText(get(row, header.map, "unite")),
      nuit: parseOuiNon(get(row, header.map, "nuit")),
      nbTech: parseExcelNumber(get(row, header.map, "nbTech")),
      semi: parseExcelNumber(get(row, header.map, "semi")),
      m3_20: parseExcelNumber(get(row, header.map, "m3_20")),
      nature: cellText(get(row, header.map, "nature")),
      notes: cellText(get(row, header.map, "notes")),
    });
  }
  return out;
}

function parseAffectations(rows: unknown[][] | null, issues: ImportIssue[]): AffectationRow[] {
  if (!rows || rows.length === 0) return [];
  const headerRowIdx = rows.findIndex((row) =>
    (row ?? []).some((c) => ["personne", "nom", "prenom"].includes(normLabel(c))),
  );
  if (headerRowIdx < 0) {
    issues.push(
      makeIssue({
        severity: "warning",
        code: "MISSING_HEADER",
        message: "Onglet Affectations équipes : colonne « Personne » introuvable, onglet ignoré.",
      }),
    );
    return [];
  }
  const headerRow = rows[headerRowIdx] ?? [];
  let colPersonne = -1;
  let colRef = -1;
  const dateCols: { col: number; date: string }[] = [];
  headerRow.forEach((cell, c) => {
    const n = normLabel(cell);
    if (colPersonne < 0 && ["personne", "nom", "prenom"].includes(n)) {
      colPersonne = c;
      return;
    }
    if (colRef < 0 && n.includes("chantier de reference")) {
      colRef = c;
      return;
    }
    const d = parseExcelDate(cell);
    if (d) dateCols.push({ col: c, date: d });
  });

  const out: AffectationRow[] = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const personne = cellText(row[colPersonne]);
    if (!personne) continue;
    const parDate: Record<string, string> = {};
    for (const dc of dateCols) {
      const v = cellText(row[dc.col]);
      if (v) parDate[dc.date] = v;
    }
    out.push({
      rowIndex: r + 1,
      personne,
      chantierRef: colRef >= 0 ? cellText(row[colRef]) : "",
      parDate,
    });
  }
  return out;
}
