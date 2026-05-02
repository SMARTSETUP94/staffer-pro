/**
 * v0.31.4 — Parser devis Progbat (refonte 3 niveaux strict).
 *
 * Hiérarchie figée :
 *  - Section N (ex: "1") : regroupement visuel, AUCUN objet créé directement.
 *      Mais si la section n'a pas de N.M (postes directement à N.K) → objet implicite.
 *  - Objet N.M (ex: "1.2") : OBJET DE FABRICATION dans le staffing.
 *      Hérite des heures de ses postes enfants (multipliées par sa quantité).
 *      Description = lignes commentaires sans numéro entre N.M et N.M+1.
 *  - Poste N.M.K (ex: "1.2.3") : ligne d'heures atelier OU matériel.
 *      Heures affichées = par UNITE → multiplier par la quantité de l'objet parent.
 *
 * Anti-bug critique : cross-check sum(objets après × qté) vs Temps prévu Section.
 *
 * Régul : 0 h, mais Total HT conservé. Si Temps prévu > 0 → flag warning manuel.
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
  isRegul,
  matchMetier,
  normalize,
} from "./match";
import { RENVOI_REGEX } from "./mappings";
import type {
  Confidence,
  DevisMetadata,
  HeuresChantier,
  IntegrityCheck,
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

function getParentCode(code: string): string {
  const parts = code.split(".");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join(".");
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
  isRegul: boolean;
  metier: FabMetier | null;
  /** Ligne de commentaire (pas de numéro mais désignation) → nourrit description. */
  isComment: boolean;
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

    // Skip lignes 100% vides
    if (!numero && !designation && quantite == null && totalHt == null && tempsPrevu == null) continue;

    const hier = getHierarchicalCode(numero);
    const isComment = !hier && designation.length > 0;

    out.push({
      rowIndex: i + 1,
      numero,
      hierarchique: hier,
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
      isRegul: isRegul(designation),
      metier: matchMetier(designation),
      isComment,
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Identification Sections (N) et Objets (N.M)                                */
/* -------------------------------------------------------------------------- */

/** Indices dans `rows` des lignes Section (niveau 1 non-chantier-pur, non-exclu). */
function findSections(rows: ParsedRow[]): ParsedRow[] {
  return rows.filter(
    (r) =>
      r.niveau === 1 &&
      r.hierarchique &&
      !r.isExclude &&
      !((r.isMontage || r.isDemontage) && !r.metier) &&
      !!r.designation,
  );
}

/** Sous-arbre strict d'un nœud (toutes lignes dont le code commence par parent.). */
function descendantsOf(parent: ParsedRow, allRows: ParsedRow[]): ParsedRow[] {
  return allRows.filter((c) => isStrictDescendant(parent.hierarchique, c.hierarchique));
}

/**
 * Description d'un objet = concat des lignes commentaires (sans numéro)
 * situées entre la ligne objet et la prochaine ligne numérotée.
 */
function extractDescription(objet: ParsedRow, allRows: ParsedRow[]): string | null {
  const idx = allRows.indexOf(objet);
  if (idx < 0) return null;
  const parts: string[] = [];
  for (let j = idx + 1; j < allRows.length; j++) {
    const r = allRows[j];
    if (r.hierarchique) break; // on s'arrête à la prochaine ligne numérotée
    if (r.isComment && r.designation) parts.push(r.designation);
  }
  if (parts.length === 0) return null;
  return parts.join(" — ").slice(0, 500);
}

/* -------------------------------------------------------------------------- */
/* Agrégation d'un objet (N.M) à partir de ses postes enfants (N.M.K)         */
/* -------------------------------------------------------------------------- */

function aggregateObjet(parent: ParsedRow, allRows: ParsedRow[]): ObjetCandidat {
  const heures = emptyHeures();
  let budgetMateriaux = 0;
  const warnings: string[] = [];
  const rowIndices: number[] = [];
  let descendantCount = 0;
  let metierUnknownCount = 0;

  // Quantité de l'objet : celle du parent si renseignée et > 0, sinon 1.
  const quantite = parent.quantite && parent.quantite > 0 ? parent.quantite : 1;

  const children = descendantsOf(parent, allRows);

  for (const c of children) {
    if (c.isExclude) continue;
    if (c.isComment) continue;
    descendantCount++;
    rowIndices.push(c.rowIndex);

    // Régul : 0 h mais Total HT préservé. Flag warning si Temps > 0.
    if (c.isRegul) {
      if (c.totalHt && c.totalHt > 0) budgetMateriaux += c.totalHt;
      if ((c.tempsPrevu ?? 0) > 0) {
        warnings.push(
          `Régul ligne ${c.rowIndex} avec ${c.tempsPrevu}h — à valider manuellement.`,
        );
      }
      continue;
    }

    // Matière → budget cumulé (× quantité objet pour aligner sur le total réel)
    if (c.isMatiere) {
      const ht = c.totalHt ?? 0;
      if (ht > 0) {
        budgetMateriaux += ht * quantite;
      } else {
        warnings.push(
          `Matière sans montant ligne ${c.rowIndex} : « ${c.designation.slice(0, 40)} »`,
        );
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
      warnings.push(
        `Métier non détecté ligne ${c.rowIndex} (${c.tempsPrevu}h) : « ${c.designation.slice(0, 50)} »`,
      );
    }
  }

  // Multiplication par la quantité de l'objet (heures = par unité dans l'Excel)
  for (const k of Object.keys(heures) as FabMetier[]) {
    heures[k] = +(heures[k] * quantite).toFixed(2);
  }

  if (metierUnknownCount > 0) {
    warnings.push(`${metierUnknownCount} ligne(s) avec heures mais métier non détecté.`);
  }

  const totalHeures = +Object.values(heures).reduce((a, b) => a + b, 0).toFixed(2);
  const flags = computeFlagsFromMetiers(heures);
  const typeFinition = detectTypeFinition(heures);

  let confidence: Confidence = "high";
  if (warnings.length > 0) confidence = "medium";
  if (totalHeures === 0 || descendantCount === 0) confidence = "low";

  return {
    numero: parent.hierarchique || parent.numero,
    nom: parent.designation,
    description: extractDescription(parent, allRows),
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
/* Construction des objets pour une Section donnée                            */
/*  - Cas normal : Section N → objets N.M détectés                            */
/*  - Cas spécial : Section N sans N.M mais avec N.K (atelier direct)         */
/*    → objet implicite portant le libellé de la Section                      */
/* -------------------------------------------------------------------------- */

function buildObjetsForSection(section: ParsedRow, allRows: ParsedRow[]): ObjetCandidat[] {
  const subTree = descendantsOf(section, allRows);

  // Détection de la profondeur réelle :
  //  - Profondeur 3 (Progbat moderne) : Section N → Objets N.M → Postes N.M.K
  //  - Profondeur 2 (historique simple) : Section N → Postes N.M directement
  //    → on crée un objet IMPLICITE portant le libellé de la Section.
  const hasNiveau3 = subTree.some((r) => r.niveau >= 3);

  const objets: ObjetCandidat[] = [];

  if (hasNiveau3) {
    // Cas 3 niveaux : objets = N.M qui ont au moins un enfant atelier/matière
    const niveau2 = subTree.filter((r) => r.niveau === 2 && !r.isExclude && !r.isComment);
    for (const obj of niveau2) {
      if ((obj.isMontage || obj.isDemontage) && !obj.metier) continue;
      if (!obj.designation) continue;

      const directChildren = descendantsOf(obj, allRows);
      const hasAnyAtelier = directChildren.some(
        (c) => !c.isExclude && !c.isComment && (c.metier || c.isMatiere),
      );
      const isLeafAtelier =
        directChildren.length === 0 && !!obj.metier && (obj.tempsPrevu ?? 0) > 0;
      const isLeafMatiere = directChildren.length === 0 && obj.isMatiere;

      if (hasAnyAtelier || isLeafAtelier || isLeafMatiere) {
        objets.push(aggregateObjet(obj, allRows));
      }
    }
  }

  // Cas 2 niveaux OU 3 niveaux sans aucun objet détecté → objet implicite Section.
  if (objets.length === 0) {
    const hasAtelierAnywhere = subTree.some(
      (c) => !c.isExclude && !c.isComment && c.metier && (c.tempsPrevu ?? 0) > 0,
    );
    const hasMatiere = subTree.some((c) => !c.isExclude && c.isMatiere);
    if (hasAtelierAnywhere || hasMatiere) {
      objets.push(aggregateObjet(section, allRows));
    }
  }

  return objets;
}

/* -------------------------------------------------------------------------- */
/* Cross-check intégrité Section vs Σ(objets après × qté)                     */
/* -------------------------------------------------------------------------- */

function buildIntegrityCheck(
  section: ParsedRow,
  objets: ObjetCandidat[],
): IntegrityCheck | null {
  const heuresDeclarees = section.tempsPrevu ?? 0;
  // Si la section ne déclare rien et qu'on n'a aucun objet → pas de check
  if (heuresDeclarees === 0 && objets.length === 0) return null;

  const heuresCalculees = +objets.reduce((acc, o) => acc + o.totalHeures, 0).toFixed(2);
  const ecart = +(heuresCalculees - heuresDeclarees).toFixed(2);
  const abs = Math.abs(ecart);
  let severite: IntegrityCheck["severite"] = "ok";
  if (heuresDeclarees > 0) {
    const ratio = abs / heuresDeclarees;
    if (abs > 0.5 && ratio > 0.05) severite = "error";
    else if (abs > 0.5) severite = "warning";
  } else if (heuresCalculees > 0) {
    // Section sans heures déclarées mais on a calculé : info, pas d'alerte
    severite = "ok";
  }

  return {
    sectionNumero: section.hierarchique || section.numero,
    sectionNom: section.designation,
    heuresDeclarees: +heuresDeclarees.toFixed(2),
    heuresCalculees,
    ecart,
    severite,
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
  const integrityChecks: IntegrityCheck[] = [];

  let objetsCandidats: ObjetCandidat[] = [];
  if (devisType !== "chantier_seul" && devisType !== "inconnu") {
    const sections = findSections(parsed);
    for (const sec of sections) {
      const objets = buildObjetsForSection(sec, parsed);
      objetsCandidats.push(...objets);
      const check = buildIntegrityCheck(sec, objets);
      if (check) {
        integrityChecks.push(check);
        if (check.severite === "error") {
          warnings.push(
            `⚠ Section ${check.sectionNumero} « ${check.sectionNom.slice(0, 40)} » : ` +
              `écart ${check.ecart > 0 ? "+" : ""}${check.ecart}h ` +
              `(déclaré ${check.heuresDeclarees}h, calculé ${check.heuresCalculees}h)`,
          );
        }
      }
    }
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
    integrityChecks,
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
    integrityChecks: [],
    warnings: [],
    errors,
  };
}
