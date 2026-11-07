import { blocsExport, lignesPlanning, lignesStaffing, serialExcel, ENTETE_BLOC, type EtapePlanning, type AffectationPlanning, type PersonnePlanning } from './planning-equipes';
import { ETAPE_LABELS } from '@/lib/logistique/etapes';

const POLICE = { name: 'Arial', sz: 11 };
export async function creerExportPlanning(dates: string[], etapes: EtapePlanning[], affectations: AffectationPlanning[], personnes: PersonnePlanning[]) {
  const module = await import('xlsx-js-style');
  const XLSX = module.default ?? module;
  const blocs = blocsExport(dates, etapes, affectations, personnes);
  const rows = lignesPlanning(blocs, ETAPE_LABELS);
  const sheet: Record<string, unknown> = {};
  rows.forEach((r, ri) => r.forEach((c, ci) => {
    const ref = XLSX.utils.encode_cell({ r: ri, c: ci });
    if (typeof c === 'object') sheet[ref] = { t: 'n', v: serialExcel(c.date), z: 'dddd d mmmm yyyy', s: { font: { ...POLICE, bold: true } } };
    else {
      const entete = ENTETE_BLOC.every((h, k) => r[k] === h);
      sheet[ref] = { t: 's', v: String(c), s: { font: { ...POLICE, bold: entete }, alignment: { vertical: 'top', wrapText: true }, ...(entete ? { fill: { patternType: 'solid', fgColor: { rgb: 'D9D9D9' } } } : {}) } };
    }
  }));
  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length - 1, 0), c: 5 } });
  sheet['!cols'] = [18, 32, 24, 22, 35, 40].map(wch => ({ wch }));
  const staffing = XLSX.utils.aoa_to_sheet(lignesStaffing(blocs));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Planning');
  XLSX.utils.book_append_sheet(wb, staffing, '_staffing');
  wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] };
  return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Lit un classeur exporté (ou au format logistique) en tableaux bruts par feuille. */
export async function lireClasseur(buffer: ArrayBuffer): Promise<Record<string, unknown[][]>> {
  const module = await import('xlsx-js-style');
  const XLSX = module.default ?? module;
  const wb = XLSX.read(buffer, { type: 'array' });
  return Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, blankrows: true, defval: null }) as unknown[][]]));
}

export function nomFichierPlanning(debut: string, fin: string, semaine: number) {
  const f = (iso: string, an = false) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}${an ? `-${iso.slice(0, 4)}` : ''}`;
  return `Planning S${semaine} du ${f(debut)} au ${f(fin, true)}.xlsx`;
}
