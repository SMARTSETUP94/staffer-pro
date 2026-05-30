/**
 * Helpers de parsing de fichiers pour l'outil Marges chantiers.
 *
 *  - xlsx : lib `xlsx-js-style` (fork SheetJS, même API). Output `rows: any[][]`.
 *  - csv  : encodage Windows-1252 + séparateur `;`. ⚠️ NE PAS utiliser SheetJS
 *           pour CSV (casse les décimales à virgule "157,5" → "1575").
 */
import * as XLSX from "xlsx-js-style";

/** Lit un .xlsx et retourne `rows: any[][]` pour la première feuille (ou la feuille nommée). */
export async function readXlsx(file: File, sheetName?: string): Promise<any[][]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const ws = wb.Sheets[name];
  return XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" });
}

/** Lit toutes les feuilles d'un .xlsx ; clé = nom de feuille. */
export async function readXlsxAllSheets(file: File): Promise<Record<string, any[][]>> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const out: Record<string, any[][]> = {};
  for (const name of wb.SheetNames) {
    out[name] = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, defval: "" });
  }
  return out;
}

/** Lit un CSV en Windows-1252 (Progbat) et split par `;` — préserve les virgules décimales. */
export async function readCsvWin1252(file: File): Promise<any[][]> {
  const buf = await file.arrayBuffer();
  const text = new TextDecoder("windows-1252").decode(buf);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.map((line) => line.split(";").map((c) => c.replace(/^"|"$/g, "")));
}

/** Lit un fichier .csv OU .xlsx (heures Progbat — formats mixtes). */
export async function readCsvOrXlsx(file: File): Promise<any[][]> {
  if (/\.csv$/i.test(file.name)) return readCsvWin1252(file);
  return readXlsx(file);
}
