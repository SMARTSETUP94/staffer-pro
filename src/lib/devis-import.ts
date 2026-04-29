/**
 * Parser des devis Excel Setup Paris (format D-202604-XXXX.xlsx).
 *
 * Colonnes attendues (ordre indicatif, détectées par header) :
 *   N° | Désignation | Quantité | Unité | PU HT | Total | TVA | Temps prévu
 *
 * Hiérarchie : combinaison de
 *  - numérotation hiérarchique (1, 1.1, 1.1.1) si présente,
 *  - sinon lignes-titre (texte sans valeurs numériques).
 * Le métier de la section parente s'applique aux lignes-feuilles.
 *
 * Mapping métier : heuristique par mots-clés sur les libellés, override
 * manuel possible en preview.
 *
 * Exclusions du calcul `heures_prevues` (les lignes restent visibles mais
 * non importées) :
 *  - "budget matériaux", "liste matière", "régul"/"régularisation"
 *  - lignes "Total", "Sous-total", "TVA", "HT", "TTC"
 *  - lignes dont temps_prevu = 0 ou vide
 */
import * as XLSX from "xlsx";
import type { MetierCode } from "./employes-import";

export interface RawDevisRow {
  numero: string;
  designation: string;
  quantite: number | null;
  unite: string;
  puHt: number | null;
  total: number | null;
  tva: number | null;
  tempsPrevu: number | null;
}

export interface ParsedDevisLine extends RawDevisRow {
  /** Index 1-based parmi les lignes data (en-tête exclu). */
  rowIndex: number;
  /** Profondeur de la numérotation (1 → niveau 1, 1.1 → niveau 2, etc.). 0 si pas numérotée. */
  niveau: number;
  /** True si la ligne est une ligne-titre (pas de quantité ni temps, ou héritée d'un parent). */
  isSection: boolean;
  /** Métier déduit (heuristique). */
  metierCode: MetierCode | null;
  /** Métier hérité de la section parente. */
  metierParentCode: MetierCode | null;
  /** Métier final retenu pour l'import (override possible côté UI). */
  metierFinalCode: MetierCode | null;
  /** True si la ligne ne crée PAS de devis_postes (exclusion ou section). */
  excluded: boolean;
  /** Raisons des exclusions ou ambiguïtés. */
  warnings: string[];
}

export interface ParseDevisResult {
  /** Métadonnées du devis détectées en en-tête (si présentes). */
  meta: {
    numeroDevis: string | null;
    libelle: string | null;
  };
  lines: ParsedDevisLine[];
  /** Total temps prévu sommé sur les lignes non exclues. */
  totalTempsPrevu: number;
  /** Total montant HT sommé sur les lignes non exclues. */
  totalMontantHt: number;
  /** Erreurs de parsing globales. */
  errors: string[];
}

/* -------------------------------------------------------------------------- */
/* Heuristique mapping libellé → métier                                       */
/* -------------------------------------------------------------------------- */

const METIER_KEYWORDS: Record<MetierCode, string[]> = {
  construction: [
    "construction", "constructeur", "menuiserie", "menuisier", "chassis", "châssis",
    "ossature", "panneau", "contreplaque", "contre-plaque", "ctp", "mdf",
    "plateau", "praticable", "fabrication bois", "agencement",
  ],
  metallerie: [
    "metallerie", "métallerie", "serrurerie", "serrurier", "soudure", "soudage",
    "acier", "inox", "fer", "tube", "structure metal", "structure métal",
    "ferronnerie",
  ],
  peinture: [
    "peinture", "peintre", "patine", "vernis", "lasure", "laque",
    "enduit", "ponçage", "poncage", "apprêt", "appret", "mise en peinture",
  ],
  numerique: [
    "numerique", "numérique", "cnc", "commande numerique", "commande numérique",
    "decoupe numerique", "découpe numérique", "usinage", "fraisage",
    "decoupe laser", "découpe laser",
  ],
  tapisserie: [
    "tapisserie", "tapissier", "tissu", "rembourrage", "garnissage",
    "couture", "drapage", "voilage", "rideau", "accessoire", "accessoiriste",
    "habillage textile",
  ],
  machiniste: [
    "machiniste", "pose", "montage", "demontage", "démontage", "installation",
    "manutention sur site", "implantation",
  ],
  logistique: [
    "logistique", "magasinier", "stockage", "transport", "livraison",
    "preparation materiel", "préparation matériel", "chargement", "dechargement",
    "déchargement",
  ],
  suivi_projet: [
    "suivi projet", "suivi de projet", "management", "management de projet",
    "chef de projet", "bureau d'etude", "bureau d'étude", "bed", "bec",
    "etude", "étude", "conception", "dao", "plan", "metré", "metre",
  ],
};

import { stripDiacritics as STRIP_DIACRITICS, normalizeName as norm } from "./string-normalize";

export function guessMetierFromLibelle(libelle: string): MetierCode | null {
  const n = norm(libelle);
  if (!n) return null;
  // On scanne dans l'ordre où les codes apparaissent dans METIER_KEYWORDS.
  // Plusieurs métiers peuvent matcher : on prend celui avec le mot-clé le plus long
  // pour donner la priorité aux libellés spécifiques (ex. "commande numérique" > "numérique").
  let best: { code: MetierCode; len: number } | null = null;
  for (const [code, kws] of Object.entries(METIER_KEYWORDS) as [MetierCode, string[]][]) {
    for (const kw of kws) {
      if (n.includes(kw) && (!best || kw.length > best.len)) {
        best = { code, len: kw.length };
      }
    }
  }
  return best?.code ?? null;
}

/* -------------------------------------------------------------------------- */
/* Exclusions                                                                  */
/* -------------------------------------------------------------------------- */

const EXCLUSION_PATTERNS = [
  "budget materiaux", "budget matériaux",
  "liste matiere", "liste matière",
  "regul", "régul", "regularisation", "régularisation",
];

const TOTAL_PATTERNS = [
  "total ht", "total ttc", "total tva", "total general", "total général",
  "sous-total", "sous total", "soustotal",
  "tva ", "tva\t", " ht", " ttc",
];

function isExcludedByLibelle(libelle: string): { excluded: boolean; reason?: string } {
  const n = " " + norm(libelle) + " ";
  for (const p of EXCLUSION_PATTERNS) {
    if (n.includes(p)) return { excluded: true, reason: `Libellé exclu : « ${p} »` };
  }
  for (const p of TOTAL_PATTERNS) {
    if (n.includes(p)) return { excluded: true, reason: `Ligne de récap : « ${p.trim()} »` };
  }
  // Lignes "Total" / "TVA" / "HT" / "TTC" exactes (souvent en bout de tableau).
  const exact = norm(libelle);
  if (["total", "tva", "ht", "ttc", "sous-total", "sous total"].includes(exact)) {
    return { excluded: true, reason: "Ligne de récap" };
  }
  return { excluded: false };
}

/* -------------------------------------------------------------------------- */
/* Détection en-tête                                                           */
/* -------------------------------------------------------------------------- */

interface ColumnMap {
  numero: number;
  designation: number;
  quantite: number;
  unite: number;
  puHt: number;
  total: number;
  tva: number;
  tempsPrevu: number;
}

function findColumnMap(rows: unknown[][]): { headerRow: number; cols: ColumnMap } | null {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i];
    if (!row) continue;
    const cells = row.map((c) => norm(String(c ?? "")));
    const hasNumero = cells.findIndex((c) => c === "n°" || c === "no" || c === "n" || c === "num" || c === "numero");
    const hasDesignation = cells.findIndex((c) => c.includes("designation") || c.includes("désignation") || c.includes("libelle") || c.includes("libellé"));
    const hasTemps = cells.findIndex((c) => c.includes("temps"));
    if (hasDesignation >= 0 && hasTemps >= 0) {
      const find = (preds: ((c: string) => boolean)[]) => {
        for (const p of preds) {
          const idx = cells.findIndex(p);
          if (idx >= 0) return idx;
        }
        return -1;
      };
      const cols: ColumnMap = {
        numero: hasNumero >= 0 ? hasNumero : 0,
        designation: hasDesignation,
        quantite: find([(c) => c === "qte" || c === "qté" || c === "quantite" || c === "quantité"]),
        unite: find([(c) => c === "unite" || c === "unité" || c === "u" || c === "un"]),
        puHt: find([
          (c) => c.replace(/\./g, "").includes("pu ht") || c.replace(/\./g, "").includes("puht"),
          (c) => c === "pu" || c.includes("prix unit") || c.includes("p.u"),
        ]),
        total: find([
          (c) => {
            const k = c.replace(/\./g, "").replace(/\s+/g, " ").trim();
            return k === "total" || k === "total ht" || k === "totalht"
              || k.includes("total ht") || k.includes("sous-total") || k.includes("sous total")
              || k === "montant" || k === "montant ht" || k.includes("montant ht");
          },
        ]),
        tva: find([(c) => c === "tva" || c.includes("tva")]),
        tempsPrevu: hasTemps,
      };
      return { headerRow: i, cols };
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Numéro hiérarchique                                                         */
/* -------------------------------------------------------------------------- */

function parseHierarchicalNumber(raw: string): number {
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  // Match "1", "1.1", "1.1.1", "1.2.3.4" — éventuellement suivi d'un point ou espace.
  const m = s.match(/^(\d+(?:\.\d+)*)/);
  if (!m) return 0;
  return m[1].split(".").length;
}

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* -------------------------------------------------------------------------- */
/* Parsing principal                                                           */
/* -------------------------------------------------------------------------- */

export interface ParseDevisOptions {
  /** Si fourni, utilisé pour deviner le numéro de devis depuis le nom de fichier. */
  filename?: string;
}

export function parseDevisFromArrayBuffer(
  buffer: ArrayBuffer,
  opts: ParseDevisOptions = {},
): ParseDevisResult {
  const errors: string[] = [];
  // XLSX.read sait lire .xlsx, .xls et .csv (auto-détection via le contenu).
  const wb = XLSX.read(buffer, { type: "array", raw: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { meta: { numeroDevis: null, libelle: null }, lines: [], totalTempsPrevu: 0, totalMontantHt: 0, errors: ["Aucune feuille trouvée"] };
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });

  const map = findColumnMap(rows);
  if (!map) {
    return {
      meta: { numeroDevis: null, libelle: null },
      lines: [],
      totalTempsPrevu: 0,
      totalMontantHt: 0,
      errors: ["En-tête introuvable. Colonnes attendues : Désignation + Temps prévu."],
    };
  }
  const { headerRow, cols } = map;

  // Métadonnées : on cherche dans les lignes au-dessus du header.
  let numeroDevis: string | null = null;
  let libelle: string | null = null;
  for (let i = 0; i < headerRow; i++) {
    const row = rows[i] ?? [];
    for (const cell of row) {
      const s = String(cell ?? "").trim();
      if (!s) continue;
      const m = s.match(/D[-\s]?(\d{6})[-\s]?(\d{3,5})/i);
      if (m && !numeroDevis) numeroDevis = `D-${m[1]}-${m[2]}`;
      const sNorm = norm(s);
      if (
        !libelle &&
        s.length > 6 &&
        !sNorm.startsWith("devis") &&
        !/d[-\s]?\d{6}/.test(sNorm)
      ) {
        libelle = s.slice(0, 200);
      }
    }
  }
  if (!numeroDevis && opts.filename) {
    const m = opts.filename.match(/D[-_\s]?(\d{6})[-_\s]?(\d{3,5})/i);
    if (m) numeroDevis = `D-${m[1]}-${m[2]}`;
  }

  // Pile des sections actives (par niveau). currentByLevel[k] = code métier hérité du niveau k.
  const currentByLevel: (MetierCode | null)[] = [];
  const lines: ParsedDevisLine[] = [];

  let dataIdx = 0;
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const numero = String(row[cols.numero] ?? "").trim();
    const designation = String(row[cols.designation] ?? "").trim();
    const quantite = cols.quantite >= 0 ? toNumber(row[cols.quantite]) : null;
    const unite = cols.unite >= 0 ? String(row[cols.unite] ?? "").trim() : "";
    const puHt = cols.puHt >= 0 ? toNumber(row[cols.puHt]) : null;
    let total = cols.total >= 0 ? toNumber(row[cols.total]) : null;
    // Fallback : si Total absent mais quantité × PU disponibles, on calcule.
    if ((total == null || total === 0) && quantite != null && puHt != null) {
      const computed = quantite * puHt;
      if (computed !== 0) total = computed;
    }
    const tva = cols.tva >= 0 ? toNumber(row[cols.tva]) : null;
    const tempsPrevu = cols.tempsPrevu >= 0 ? toNumber(row[cols.tempsPrevu]) : null;

    // Ligne entièrement vide → on saute.
    if (!numero && !designation && quantite == null && total == null && tempsPrevu == null) continue;

    dataIdx++;
    const warnings: string[] = [];

    const niveau = parseHierarchicalNumber(numero);
    const guess = guessMetierFromLibelle(designation);

    // Détection "section" : pas de quantité ET pas de temps ET libellé non vide,
    // OU niveau hiérarchique 1 ou 2 sans valeurs.
    const isLeafFinancial = (quantite ?? 0) > 0 || (total ?? 0) > 0 || (tempsPrevu ?? 0) > 0;
    const isSection = !!designation && !isLeafFinancial;

    // Mise à jour de la pile des sections.
    if (isSection && niveau > 0) {
      currentByLevel[niveau - 1] = guess ?? currentByLevel[niveau - 1] ?? null;
      currentByLevel.length = niveau; // tronque les niveaux plus profonds
    } else if (isSection && niveau === 0) {
      // Section sans numérotation : on l'empile au niveau racine.
      currentByLevel[0] = guess ?? currentByLevel[0] ?? null;
      currentByLevel.length = 1;
    }

    // Métier hérité = le plus profond non null dans la pile.
    let metierParent: MetierCode | null = null;
    for (let k = currentByLevel.length - 1; k >= 0; k--) {
      if (currentByLevel[k]) { metierParent = currentByLevel[k]; break; }
    }

    const metierFinal = guess ?? metierParent ?? null;

    // Exclusions.
    const excl = isExcludedByLibelle(designation);
    let excluded = excl.excluded || isSection;
    if (excl.reason) warnings.push(excl.reason);
    if (isSection) warnings.push("Ligne de section (pas d'import)");
    if (!isSection && (tempsPrevu == null || tempsPrevu === 0)) {
      excluded = true;
      warnings.push("Temps prévu absent ou nul");
    }
    if (!metierFinal && !excluded) {
      warnings.push("Métier non détecté — à corriger manuellement");
    }

    lines.push({
      rowIndex: dataIdx,
      numero,
      designation,
      quantite,
      unite,
      puHt,
      total,
      tva,
      tempsPrevu,
      niveau,
      isSection,
      metierCode: guess,
      metierParentCode: metierParent,
      metierFinalCode: metierFinal,
      excluded,
      warnings,
    });
  }

  // Post-traitement : exclure automatiquement les lignes parents qui ont
  // des enfants détaillés avec heures (évite double comptage).
  // Une ligne A est parent de B si :
  //  - A.numero est un préfixe strict de B.numero (ex: "1.2" préfixe de "1.2.3")
  //  - A apparaît avant B dans le fichier
  // On détecte les parents qui ont au moins un descendant avec tempsPrevu > 0.
  const parentsWithChildren = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const parent = lines[i];
    if (!parent.numero) continue;
    const parentParts = parent.numero.match(/^(\d+(?:\.\d+)*)/)?.[1];
    if (!parentParts) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const child = lines[j];
      if (!child.numero) continue;
      const childParts = child.numero.match(/^(\d+(?:\.\d+)*)/)?.[1];
      if (!childParts) continue;
      // Enfant strict : commence par "parentParts." ET a un temps prévu.
      if (
        childParts.length > parentParts.length &&
        childParts.startsWith(parentParts + ".") &&
        (child.tempsPrevu ?? 0) > 0
      ) {
        parentsWithChildren.add(i);
        break;
      }
    }
  }
  for (const idx of parentsWithChildren) {
    const l = lines[idx];
    if (!l.excluded) {
      l.excluded = true;
      l.isSection = true;
      l.warnings.push("Ligne parent — heures détaillées dans les sous-postes (évite double comptage)");
    }
  }

  const totalTempsPrevu = lines.reduce((acc, l) => acc + (!l.excluded && l.tempsPrevu ? l.tempsPrevu : 0), 0);
  const totalMontantHt = lines.reduce((acc, l) => acc + (!l.excluded && l.total ? l.total : 0), 0);

  return { meta: { numeroDevis, libelle }, lines, totalTempsPrevu, totalMontantHt, errors };
}
