/**
 * v0.32.0 — Validation partagée des imports Excel/CSV.
 *
 * Objectif : rendre tous les imports (devis, opportunités) résilients aux
 * fichiers mal formés en produisant un rapport d'erreurs lisible et
 * actionnable, plutôt qu'un crash ou un toast cryptique.
 *
 * Conventions :
 *  - severity "error"  → bloque l'import (Valider désactivé)
 *  - severity "warning" → permet l'import mais signale au user
 *  - severity "info"    → contexte (ex: ligne ignorée car vide)
 *  - rowIndex / column sont **1-based** comme Excel (l'en-tête = ligne 1)
 *  - column peut être une lettre Excel ("A", "BL") ou un nom métier ("Quantité")
 */

export type ImportIssueSeverity = "error" | "warning" | "info";

export type ImportIssueCode =
  /* Erreurs de fichier / structure */
  | "FILE_EMPTY"
  | "FILE_TOO_LARGE"
  | "PARSE_FAILED"
  | "MISSING_HEADER"
  | "NO_DATA_ROWS"
  /* Erreurs de cellule */
  | "INVALID_NUMBER"
  | "INVALID_DATE"
  | "INVALID_TEXT"
  | "OUT_OF_BOUNDS"
  | "REQUIRED_FIELD_MISSING"
  /* Erreurs métier / cohérence */
  | "DUPLICATE_KEY"
  | "TOTAL_MISMATCH"
  | "DATE_RANGE_INCOHERENT"
  | "UNKNOWN_REFERENCE";

export interface ImportIssue {
  severity: ImportIssueSeverity;
  code: ImportIssueCode;
  /** Ligne Excel (1-based, en-tête = 1). null si l'erreur est globale au fichier. */
  rowIndex: number | null;
  /** Nom de colonne lisible (ex: "Quantité") ou lettre Excel. null si global. */
  column: string | null;
  /** Valeur brute lue (utile pour debug et tooltip). */
  value?: unknown;
  /** Message FR actionnable. Toujours présent. */
  message: string;
}

/** Helper de construction d'erreur (préserve la cohérence). */
export function makeIssue(args: Partial<ImportIssue> & Pick<ImportIssue, "code" | "message">): ImportIssue {
  return {
    severity: args.severity ?? "error",
    code: args.code,
    rowIndex: args.rowIndex ?? null,
    column: args.column ?? null,
    value: args.value,
    message: args.message,
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers de validation atomiques                                            */
/* -------------------------------------------------------------------------- */

/**
 * Parse un nombre depuis Excel (peut être number, string "1 234,56", "1234.56", "").
 * Retourne null si vide/non parseable. Pour signaler une erreur, utiliser validateNumber().
 */
export function parseExcelNumber(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .trim()
    .replace(/\s+/g, "")
    .replace(/[\u00a0\u202f]/g, "")
    .replace(/(\d),(\d)/, "$1.$2");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Valide un nombre lu depuis une cellule. Retourne {value, issue?}.
 * issue est défini si la valeur n'est pas vide ET pas parseable.
 */
export function validateNumber(
  raw: unknown,
  ctx: { rowIndex: number; column: string; field: string; required?: boolean; min?: number; max?: number },
): { value: number | null; issue?: ImportIssue } {
  const isEmpty = raw == null || raw === "";
  if (isEmpty) {
    if (ctx.required) {
      return {
        value: null,
        issue: makeIssue({
          code: "REQUIRED_FIELD_MISSING",
          rowIndex: ctx.rowIndex,
          column: ctx.column,
          message: `Ligne ${ctx.rowIndex} · ${ctx.field} est obligatoire (cellule vide).`,
        }),
      };
    }
    return { value: null };
  }
  const n = parseExcelNumber(raw);
  if (n == null) {
    return {
      value: null,
      issue: makeIssue({
        code: "INVALID_NUMBER",
        rowIndex: ctx.rowIndex,
        column: ctx.column,
        value: raw,
        message: `Ligne ${ctx.rowIndex} · ${ctx.field} : nombre attendu, lu « ${String(raw)} ». Vérifie la cellule (texte ou format ?).`,
      }),
    };
  }
  if (ctx.min != null && n < ctx.min) {
    return {
      value: n,
      issue: makeIssue({
        code: "OUT_OF_BOUNDS",
        rowIndex: ctx.rowIndex,
        column: ctx.column,
        value: n,
        message: `Ligne ${ctx.rowIndex} · ${ctx.field} = ${n} hors bornes (minimum ${ctx.min}).`,
      }),
    };
  }
  if (ctx.max != null && n > ctx.max) {
    return {
      value: n,
      issue: makeIssue({
        code: "OUT_OF_BOUNDS",
        rowIndex: ctx.rowIndex,
        column: ctx.column,
        value: n,
        message: `Ligne ${ctx.rowIndex} · ${ctx.field} = ${n} hors bornes (maximum ${ctx.max}).`,
      }),
    };
  }
  return { value: n };
}

/**
 * Valide une date. Accepte Date JS, nombre Excel série, ISO string, "DD/MM/YYYY".
 * Retourne ISO yyyy-MM-dd ou null.
 */
export function parseExcelDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  // Date JS
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return toIsoDate(raw);
  }
  // Numéro de série Excel (jours depuis 1899-12-30)
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return toIsoDate(d);
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  // ISO yyyy-MM-dd
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : toIsoDate(d);
  }
  // DD/MM/YYYY ou DD-MM-YYYY
  const fr = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
  if (fr) {
    const day = Number(fr[1]);
    const month = Number(fr[2]);
    let year = Number(fr[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    if (Number.isNaN(d.getTime()) || d.getMonth() !== month - 1) return null;
    return toIsoDate(d);
  }
  // Fallback Date.parse
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : toIsoDate(d);
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function validateDate(
  raw: unknown,
  ctx: { rowIndex: number; column: string; field: string; required?: boolean },
): { value: string | null; issue?: ImportIssue } {
  const isEmpty = raw == null || raw === "";
  if (isEmpty) {
    if (ctx.required) {
      return {
        value: null,
        issue: makeIssue({
          code: "REQUIRED_FIELD_MISSING",
          rowIndex: ctx.rowIndex,
          column: ctx.column,
          message: `Ligne ${ctx.rowIndex} · ${ctx.field} est obligatoire (date vide).`,
        }),
      };
    }
    return { value: null };
  }
  const iso = parseExcelDate(raw);
  if (!iso) {
    return {
      value: null,
      issue: makeIssue({
        code: "INVALID_DATE",
        rowIndex: ctx.rowIndex,
        column: ctx.column,
        value: raw,
        message: `Ligne ${ctx.rowIndex} · ${ctx.field} : date invalide « ${String(raw)} ». Formats acceptés : JJ/MM/AAAA, AAAA-MM-JJ.`,
      }),
    };
  }
  return { value: iso };
}

/** Cohérence : date_fin >= date_debut. */
export function validateDateRange(
  debut: string | null,
  fin: string | null,
  ctx: { rowIndex: number | null; fieldDebut: string; fieldFin: string },
): ImportIssue | null {
  if (!debut || !fin) return null;
  if (fin >= debut) return null;
  const where = ctx.rowIndex != null ? `Ligne ${ctx.rowIndex} · ` : "";
  return makeIssue({
    code: "DATE_RANGE_INCOHERENT",
    rowIndex: ctx.rowIndex,
    column: ctx.fieldFin,
    severity: "warning",
    message: `${where}${ctx.fieldFin} (${fin}) est antérieure à ${ctx.fieldDebut} (${debut}).`,
  });
}

/** Vérifie que les en-têtes attendues sont bien présentes. */
export function validateHeaders(
  detected: string[],
  required: string[],
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const detectedNorm = new Set(detected.map(norm));
  for (const h of required) {
    if (!detectedNorm.has(norm(h))) {
      issues.push(
        makeIssue({
          code: "MISSING_HEADER",
          rowIndex: 1,
          column: h,
          message: `Colonne attendue « ${h} » introuvable dans le fichier. En-têtes détectées : ${detected.join(", ") || "(aucune)"}.`,
        }),
      );
    }
  }
  return issues;
}

/** Vérifie que somme des postes ≈ total devis (tolérance € HT). */
export function validateTotalsMatch(
  computed: number,
  expected: number,
  ctx: { field: string; tolerance?: number },
): ImportIssue | null {
  const tol = ctx.tolerance ?? 1;
  if (Math.abs(computed - expected) <= tol) return null;
  return makeIssue({
    code: "TOTAL_MISMATCH",
    rowIndex: null,
    column: ctx.field,
    severity: "warning",
    message: `Total ${ctx.field} : somme des lignes = ${computed.toFixed(2)} mais total annoncé = ${expected.toFixed(2)} (écart ${(computed - expected).toFixed(2)}).`,
  });
}

/** Détecte les doublons sur une clé (ex: référence d'objet). */
export function findDuplicates<T>(
  rows: readonly T[],
  keyOf: (row: T, idx: number) => string | null | undefined,
  ctx: { rowIndexOf?: (row: T, idx: number) => number; field: string },
): ImportIssue[] {
  const seen = new Map<string, number[]>();
  rows.forEach((row, idx) => {
    const k = keyOf(row, idx);
    if (!k) return;
    const list = seen.get(k) ?? [];
    list.push(ctx.rowIndexOf ? ctx.rowIndexOf(row, idx) : idx + 2);
    seen.set(k, list);
  });
  const issues: ImportIssue[] = [];
  for (const [key, lines] of seen) {
    if (lines.length < 2) continue;
    issues.push(
      makeIssue({
        code: "DUPLICATE_KEY",
        rowIndex: lines[0]!,
        column: ctx.field,
        severity: "warning",
        value: key,
        message: `Doublon « ${key} » sur ${ctx.field} : présent ${lines.length} fois (lignes ${lines.join(", ")}).`,
      }),
    );
  }
  return issues;
}

/* -------------------------------------------------------------------------- */
/* Catégorisation et sérialisation                                            */
/* -------------------------------------------------------------------------- */

export interface IssueCounts {
  errors: number;
  warnings: number;
  infos: number;
  total: number;
}

export function countIssues(issues: readonly ImportIssue[]): IssueCounts {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const i of issues) {
    if (i.severity === "error") errors++;
    else if (i.severity === "warning") warnings++;
    else infos++;
  }
  return { errors, warnings, infos, total: issues.length };
}

export function hasBlocking(issues: readonly ImportIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/** Indexe les issues par (rowIndex, column) pour highlighting inline rapide. */
export function indexIssuesByCell(
  issues: readonly ImportIssue[],
): Map<string, ImportIssue[]> {
  const map = new Map<string, ImportIssue[]>();
  for (const i of issues) {
    if (i.rowIndex == null) continue;
    const key = `${i.rowIndex}|${i.column ?? "*"}`;
    const list = map.get(key) ?? [];
    list.push(i);
    map.set(key, list);
  }
  return map;
}

/** Construit un CSV (UTF-8 BOM) téléchargeable du rapport. */
export function issuesToCsv(issues: readonly ImportIssue[]): string {
  const header = ["Severite", "Code", "Ligne", "Colonne", "Valeur lue", "Message"];
  const escape = (s: unknown): string => {
    const str = s == null ? "" : String(s);
    if (/[",;\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const rows = issues.map((i) =>
    [
      i.severity,
      i.code,
      i.rowIndex ?? "",
      i.column ?? "",
      i.value ?? "",
      i.message,
    ]
      .map(escape)
      .join(";"),
  );
  return "\uFEFF" + [header.join(";"), ...rows].join("\r\n");
}

export function downloadIssuesCsv(
  issues: readonly ImportIssue[],
  filename = "rapport-import.csv",
): void {
  if (typeof window === "undefined") return;
  const csv = issuesToCsv(issues);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Convertit une exception JS en issue PARSE_FAILED lisible. */
export function exceptionToIssue(err: unknown, context = "Lecture du fichier"): ImportIssue {
  const msg = err instanceof Error ? err.message : String(err);
  return makeIssue({
    code: "PARSE_FAILED",
    rowIndex: null,
    column: null,
    message: `${context} : ${msg}. Vérifie que le fichier est un .xlsx/.csv valide et non corrompu.`,
  });
}

/** Convertit une liste de strings legacy en issues normalisées. */
export function legacyStringsToIssues(
  messages: readonly string[],
  defaults: { severity?: ImportIssueSeverity; code?: ImportIssueCode } = {},
): ImportIssue[] {
  return messages.map((m) =>
    makeIssue({
      code: defaults.code ?? "PARSE_FAILED",
      severity: defaults.severity ?? "warning",
      message: m,
      rowIndex: null,
      column: null,
    }),
  );
}
