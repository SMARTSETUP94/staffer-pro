import { COLONNES_AFFECTATIONS } from './affectations-consolide';

export type PassageExport = {
  date: string; affaire_id: string; personne_cle: string; personne: string;
  code_chantier: string; chantier: string; operations: string[]; responsable: string;
  lieux: string[]; source: 'Staffing' | 'Import historique'; nom_original: string;
  fichiers_source: string; format: string;
};

export function cellulesHistorique(lignes: PassageExport[]) {
  const personnes = new Map<string, PassageExport[]>();
  const chantiers = new Map<string, PassageExport[]>();
  for (const l of lignes) {
    personnes.set(l.personne_cle, [...(personnes.get(l.personne_cle) ?? []), l]);
    chantiers.set(l.affaire_id, [...(chantiers.get(l.affaire_id) ?? []), l]);
  }
  const date = (s: string) => new Date(`${s}T00:00:00Z`);
  const periode = (ls: PassageExport[]) => ls.map(l => l.date).sort();
  return {
    Affectations: [ [...COLONNES_AFFECTATIONS], ...lignes.map(l => [date(l.date), new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' }).format(date(l.date)), l.code_chantier, l.chantier, l.operations.join(' / '), l.responsable, l.personne, l.nom_original, l.fichiers_source, l.format]) ],
    Personnes: [ ['Personne', 'Nb affectations', 'Première date', 'Dernière date', 'Chantier 1', 'Nb 1', 'Chantier 2', 'Nb 2', 'Chantier 3', 'Nb 3'], ...[...personnes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, ls]) => {
      const frequences = new Map<string, { code: string; nom: string; nb: number }>();
      for (const l of ls) { const old = frequences.get(l.affaire_id); frequences.set(l.affaire_id, { code: l.code_chantier, nom: l.chantier, nb: (old?.nb ?? 0) + 1 }); }
      const top = [...frequences.entries()].sort(([ia, a], [ib, b]) => b.nb - a.nb || a.code.localeCompare(b.code) || ia.localeCompare(ib)).slice(0, 3);
      const dates = periode(ls);
      return [ls[0]?.personne ?? '', ls.length, date(dates[0] ?? ''), date(dates.at(-1) ?? ''), ...Array.from({ length: 3 }, (_, i) => { const t = top[i]?.[1]; return t ? [`${t.code} · ${t.nom}`, t.nb] : ['', 0]; }).flat()];
    }) ],
    Chantiers: [ ['Code chantier', 'Chantier', 'Nb affectations', 'Première date', 'Dernière date', 'Opérations'], ...[...chantiers.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, ls]) => { const dates = periode(ls); return [ls[0]?.code_chantier ?? '', ls[0]?.chantier ?? '', ls.length, date(dates[0] ?? ''), date(dates.at(-1) ?? ''), [...new Set(ls.flatMap(l => l.operations))].sort().join(' / ')]; }) ],
  };
}

export async function exporterHistorique(lignes: PassageExport[]) {
  const XLSX = await import('xlsx-js-style');
  const wb = XLSX.utils.book_new();
  for (const [nom, rows] of Object.entries(cellulesHistorique(lignes))) {
    const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true, dateNF: 'dd/mm/yyyy' });
    for (const [key, cell] of Object.entries(sheet)) {
      if (key.startsWith('!')) continue;
      // Keep every user-provided string a literal text cell, never an Excel formula.
      if (typeof cell.v === 'string') { cell.t = 's'; delete cell.f; }
      if (cell.t === 'd') cell.z = 'dd/mm/yyyy';
    }
    sheet['!cols'] = rows[0]?.map(() => ({ wch: 24 }));
    if (sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] };
    XLSX.utils.book_append_sheet(wb, sheet, nom);
  }
  XLSX.writeFile(wb, 'Historique des affectations.xlsx');
}