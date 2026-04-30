/**
 * v0.23 — Parser devis Progbat (côté navigateur).
 *
 * Pipeline :
 *  1. Lecture Excel via xlsx → matrice de cellules
 *  2. Détection en-tête + colonnes (N° / Désignation / Qté / PU / Total / Temps prévu)
 *  3. Métadonnées (numéro devis, libellé, client, total)
 *  4. Extraction des lignes-feuilles (avec niveau hiérarchique + métier hérité)
 *  5. detectDevisType (fabrication / chantier_seul / mixte / inconnu)
 *  6. Si chantier_seul → 0 objet, juste heures_chantier
 *  7. Sinon agrège par parent niveau 1 ou 2 :
 *      - somme heures par métier (× quantité)
 *      - somme matières dans budgetMateriaux
 *      - flags applicabilité, confidence
 *  8. Heures chantier (lots Montage/Démontage)
 *  9. Renvois externes "Voir devis XXXX"
 */
import * as XLSX from "xlsx-js-style";
import type { FabMetier } from "@/hooks/use-fabrication";
import { computeFlagsFromMetiers, detectTypeFinition, emptyHeures } from "./compute-flags";
import { detectDevisType } from "./detect-type";
import {
  isDemontageKeyword,
  isExcludeKeyword,
  isLineDisabled,
  isMatiere,
  isMontageKeyword,
  matchMetier,
  normalize,
} from "./match";
import { RENVOI_REGEX } from "./mappings";
import type {
  Confidence,
  DevisMetadata,
  HeuresChantier,
  ObjetCandidat,
  ParseResult,
  RenvoiExterne,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Détection en-tête / colonnes                                               */
/* -------------------------------------------------------------------------- */

interface ColumnMap {
  numero: number;
  designation: number;
  quantite: number;
  unite: number;
  puHt: number;
  total: number;
  tempsPrevu: number;
}

function findColumnMap(rows: unknown[][]): { headerRow: number; cols: ColumnMap } | null {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    if (!row) continue;
    const cells = row.map((c) => normalize(String(c ?? "")));
    const hasDesignation = cells.findIndex(
      (c) => c.includes("designation") || c.includes("libelle") || c.includes("intitule"),
    );
    const hasTemps = cells.findIndex((c) => c.includes("temps"));
    if (hasDesignation < 0 || hasTemps < 0) continue;

    const find = (preds: ((c: string) => boolean)[]) => {
      for (const p of preds) {
        const idx = cells.findIndex(p);
        if (idx >= 0) return idx;
      }
      return -1;
    };

    return {
      headerRow: i,
      cols: {
        numero: find([(c) => c === "n°" || c === "no" || c === "n" || c === "num" || c === "numero"]),
        designation: hasDesignation,
        quantite: find([(c) => c === "qte" || c === "qté" || c === "quantite" || c === "quantité"]),
        unite: find([(c) => c === "unite" || c === "unité" || c === "u" || c === "un"]),
        puHt: find([
          (c) => c.replace(/\./g, "").includes("puht"),
          (c) => c === "pu" || c.includes("prix unit"),
        ]),
        total: find([
          (c) => {
            const k = c.replace(/\./g, "").replace(/\s+/g, " ").trim();
            return k === "total" || k.includes("total ht") || k.includes("montant ht");
          },
        ]),
        tempsPrevu: hasTemps,
      },
    };
  }
  return null;
}

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\s/g, "").replace(",", ".").replace(/[€$]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseHierarchicalNumber(raw: string): number {
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  const m = s.match(/^(\d+(?:\.\d+)*)/);
  if (!m) return 0;
  return m[1].split(".").length;
}

function getHierarchicalCode(raw: string): string {
  return String(raw ?? "").trim().match(/^(\d+(?:\.\d+)*)/)?.[1] ?? "";
}

function isStrictDescendant(parentCode: string, childCode: string): boolean {
  if (!parentCode || !childCode) return false;
  return childCode.length > parentCode.length && childCode.startsWith(parentCode + ".");
}

/* -------------------------------------------------------------------------- */
/* Lignes intermédiaires                                                       */
/* -------------------------------------------------------------------------- */

interface ParsedRow {
  rowIndex: number;
  numero: string;
  hierarchique: string;
  niveau: number;
  designation: string;
  quantite: number | null;
  puHt: number | null;
  totalHt: number | null;
  tempsPrevu: number | null;
  isExclude: boolean;
  isMatiere: boolean;
  isMontage: boolean;
  isDemontage: boolean;
  metier: FabMetier | null;
}

function parseRows(rows: unknown[][], headerRow: number, cols: ColumnMap): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const numero = String(row[cols.numero] ?? "").trim();
    const designation = String(row[cols.designation] ?? "").trim();
    const quantite = cols.quantite >= 0 ? toNumber(row[cols.quantite]) : null;
    const puHt = cols.puHt >= 0 ? toNumber(row[cols.puHt]) : null;
    let totalHt = cols.total >= 0 ? toNumber(row[cols.total]) : null;
    if ((totalHt == null || totalHt === 0) && quantite != null && puHt != null) {
      const c = quantite * puHt;
      if (c !== 0) totalHt = c;
    }
    const tempsPrevu = cols.tempsPrevu >= 0 ? toNumber(row[cols.tempsPrevu]) : null;
    if (!numero && !designation && quantite == null && totalHt == null && tempsPrevu == null) continue;

    out.push({
      rowIndex: i + 1,
      numero,
      hierarchique: getHierarchicalCode(numero),
      niveau: parseHierarchicalNumber(numero),
      designation,
      quantite,
      puHt,
      totalHt,
      tempsPrevu,
      isExclude: isExcludeKeyword(designation),
      isMatiere: isMatiere(designation),
      isMontage: isMontageKeyword(designation),
      isDemontage: isDemontageKeyword(designation),
      metier: matchMetier(designation),
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Détection objets candidats (parents niveau 1 ou 2)                          */
/* -------------------------------------------------------------------------- */

function findObjetParents(rows: ParsedRow[]): ParsedRow[] {
  // Candidats : lignes niveau 1 ou 2 dont au moins un descendant strict est
  // une sous-prestation atelier (métier reconnu) — et qui ne sont pas elles-mêmes
  // exclues / lots chantier.
  const candidates: ParsedRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i];
    if (p.niveau !== 1 && p.niveau !== 2) continue;
    if (p.isExclude) continue;
    if (!p.designation) continue;
    // Si le parent lui-même est un lot chantier pur → pas un objet
    if ((p.isMontage || p.isDemontage) && !p.metier) continue;

    let hasAtelierChild = false;
    for (let j = i + 1; j < rows.length; j++) {
      const c = rows[j];
      if (!c.hierarchique) continue;
      if (!isStrictDescendant(p.hierarchique, c.hierarchique)) {
        // dès qu'on sort du sous-arbre, on s'arrête (les rows sont en ordre)
        if (c.niveau > 0 && c.niveau <= p.niveau) break;
        continue;
      }
      if (c.metier && (c.tempsPrevu ?? 0) > 0) {
        hasAtelierChild = true;
        break;
      }
    }
    if (hasAtelierChild) candidates.push(p);
  }

  // Élimine les parents qui ont eux-mêmes un parent dans la liste (on garde le plus profond)
  const result: ParsedRow[] = [];
  for (const c of candidates) {
    const hasDescendantCandidate = candidates.some(
      (other) => other !== c && isStrictDescendant(c.hierarchique, other.hierarchique),
    );
    if (!hasDescendantCandidate) result.push(c);
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Agrégation d'un objet                                                       */
/* -------------------------------------------------------------------------- */

function aggregateObjet(parent: ParsedRow, allRows: ParsedRow[]): ObjetCandidat {
  const heures = emptyHeures();
  let budgetMateriaux = 0;
  const warnings: string[] = [];
  const rowIndices: number[] = [];
  let descendantCount = 0;
  let metierUnknownCount = 0;

  // Quantité de l'objet : celle du parent si renseignée, sinon 1
  const quantite = parent.quantite && parent.quantite > 0 ? parent.quantite : 1;

  for (const c of allRows) {
    if (!isStrictDescendant(parent.hierarchique, c.hierarchique)) continue;
    if (c.isExclude) continue;
    descendantCount++;
    rowIndices.push(c.rowIndex);

    // Matière → budget cumulé
    if (c.isMatiere) {
      if (c.totalHt != null && c.totalHt > 0) {
        budgetMateriaux += c.totalHt;
      } else {
        warnings.push(`Matière sans montant ligne ${c.rowIndex} : « ${c.designation.slice(0, 40)} »`);
      }
      continue;
    }

    // Lots chantier dans un objet : ignorés (vont dans heuresChantier global)
    if ((c.isMontage || c.isDemontage) && !c.metier) continue;

    if (c.metier && (c.tempsPrevu ?? 0) > 0) {
      if (isLineDisabled({ quantite: c.quantite, heures: c.tempsPrevu, totalHt: c.totalHt })) {
        continue;
      }
      heures[c.metier] += c.tempsPrevu ?? 0;
    } else if (!c.metier && (c.tempsPrevu ?? 0) > 0) {
      metierUnknownCount++;
    }
  }

  // Multiplier les heures par la quantité de l'objet
  for (const k of Object.keys(heures) as FabMetier[]) {
    heures[k] = +(heures[k] * quantite).toFixed(2);
  }

  if (metierUnknownCount > 0) {
    warnings.push(`${metierUnknownCount} ligne(s) avec heures mais métier non détecté.`);
  }

  const totalHeures = +Object.values(heures).reduce((a, b) => a + b, 0).toFixed(2);
  const flags = computeFlagsFromMetiers(heures);
  const typeFinition = detectTypeFinition(heures);

  // Confidence : high si tout détecté, medium si warnings, low si totalHeures = 0 ou descendants vides
  let confidence: Confidence = "high";
  if (warnings.length > 0) confidence = "medium";
  if (totalHeures === 0 || descendantCount === 0) confidence = "low";

  return {
    numero: parent.hierarchique || parent.numero,
    nom: parent.designation,
    description: null,
    quantite,
    heures,
    totalHeures,
    budgetMateriaux: +budgetMateriaux.toFixed(2),
    typeFinition,
    flags,
    confidence,
    warnings,
    rowIndices,
  };
}

/* -------------------------------------------------------------------------- */
/* Heures chantier (Montage/Démontage globaux)                                */
/* -------------------------------------------------------------------------- */

function computeHeuresChantier(rows: ParsedRow[]): HeuresChantier {
  let montage = 0;
  let demontage = 0;
  let totalHt = 0;
  for (const r of rows) {
    if (r.isExclude) continue;
    if (r.isDemontage) {
      demontage += r.tempsPrevu ?? 0;
      totalHt += r.totalHt ?? 0;
    } else if (r.isMontage) {
      montage += r.tempsPrevu ?? 0;
      totalHt += r.totalHt ?? 0;
    }
  }
  return {
    montage: +montage.toFixed(2),
    demontage: +demontage.toFixed(2),
    totalHt: +totalHt.toFixed(2),
  };
}

/* -------------------------------------------------------------------------- */
/* Renvois externes "Voir devis XXXX"                                         */
/* -------------------------------------------------------------------------- */

function findRenvois(rows: ParsedRow[]): RenvoiExterne[] {
  const out: RenvoiExterne[] = [];
  for (const r of rows) {
    if (!r.designation) continue;
    RENVOI_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RENVOI_REGEX.exec(r.designation)) !== null) {
      out.push({ numeroDevis: m[1], contexte: r.designation, rowIndex: r.rowIndex });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Métadonnées                                                                 */
/* -------------------------------------------------------------------------- */

function extractMeta(rows: unknown[][], headerRow: number, filename?: string): DevisMetadata {
  let numeroDevis: string | null = null;
  let libelle: string | null = null;
  let client: string | null = null;

  for (let i = 0; i < headerRow; i++) {
    const row = rows[i] ?? [];
    for (const cell of row) {
      const s = String(cell ?? "").trim();
      if (!s) continue;
      const mNum = s.match(/D[-\s]?(\d{3,7})/i);
      if (mNum && !numeroDevis) numeroDevis = `D-${mNum[1]}`;
      const sNorm = normalize(s);
      if (!libelle && s.length > 6 && !sNorm.startsWith("devis") && !/d[-\s]?\d{3}/.test(sNorm)) {
        libelle = s.slice(0, 200);
      }
      if (!client && /^client\s*[:\-]/i.test(s)) {
        client = s.replace(/^client\s*[:\-]\s*/i, "").trim() || null;
      }
    }
  }
  if (!numeroDevis && filename) {
    const m = filename.match(/D[-_\s]?(\d{3,7})/i);
    if (m) numeroDevis = `D-${m[1]}`;
  }
  return { numeroDevis, libelle, client, totalHt: 0, nbLignes: 0 };
}

/* -------------------------------------------------------------------------- */
/* API publique                                                                */
/* -------------------------------------------------------------------------- */

export interface ParseDevisProgbatOptions {
  filename?: string;
}

export function parseDevisProgbatFromArrayBuffer(
  buffer: ArrayBuffer,
  opts: ParseDevisProgbatOptions = {},
): ParseResult {
  const wb = XLSX.read(buffer, { type: "array", raw: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return emptyResult(["Aucune feuille trouvée dans le fichier Excel."]);
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
  return parseDevisProgbatFromMatrix(rows, opts);
}

export function parseDevisProgbatFromMatrix(
  rows: unknown[][],
  opts: ParseDevisProgbatOptions = {},
): ParseResult {
  const map = findColumnMap(rows);
  if (!map) {
    return emptyResult(["En-tête introuvable. Colonnes attendues : Désignation + Temps prévu."]);
  }
  const { headerRow, cols } = map;
  const meta = extractMeta(rows, headerRow, opts.filename);
  const parsed = parseRows(rows, headerRow, cols);
  meta.nbLignes = parsed.length;
  meta.totalHt = +parsed.reduce((acc, r) => acc + (r.totalHt ?? 0), 0).toFixed(2);

  const devisType = detectDevisType(parsed.map((r) => ({ designation: r.designation })));
  const heuresChantier = computeHeuresChantier(parsed);
  const renvoisExternes = findRenvois(parsed);
  const warnings: string[] = [];

  let objetsCandidats: ObjetCandidat[] = [];
  if (devisType !== "chantier_seul" && devisType !== "inconnu") {
    const parents = findObjetParents(parsed);
    objetsCandidats = parents.map((p) => aggregateObjet(p, parsed));
    if (objetsCandidats.length === 0) {
      warnings.push("Aucun objet détecté malgré un type devis avec atelier — vérifier la hiérarchie.");
    }
  }

  if (devisType === "inconnu") {
    warnings.push("Type de devis indéterminé : aucune sous-prestation reconnue.");
  }

  return {
    meta,
    devisType,
    objetsCandidats,
    heuresChantier,
    renvoisExternes,
    warnings,
    errors: [],
  };
}

function emptyResult(errors: string[]): ParseResult {
  return {
    meta: { numeroDevis: null, libelle: null, client: null, totalHt: 0, nbLignes: 0 },
    devisType: "inconnu",
    objetsCandidats: [],
    heuresChantier: { montage: 0, demontage: 0, totalHt: 0 },
    renvoisExternes: [],
    warnings: [],
    errors,
  };
}
