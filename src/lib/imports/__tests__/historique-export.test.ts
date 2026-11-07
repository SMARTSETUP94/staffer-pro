import { describe, expect, it } from 'vitest';
import { cellulesHistorique, type PassageExport } from '../historique-export';
const base: PassageExport = { date: '2026-11-06', affaire_id: 'a', personne_cle: 'employe:p', personne: 'DUPONT Émile', code_chantier: '6001', chantier: 'Salon', operations: ['montage'], responsable: 'Chef', lieux: ['Paris'], source: 'Staffing', nom_original: 'DUPONT Émile', fichiers_source: '', format: 'Staffing terrain' };
describe('Historique Excel sans rémunération', () => {
  it('exporte exactement les dix colonnes du consolidé', () => {
    expect(cellulesHistorique([base]).Affectations[0]).toEqual(['Date', 'Jour', 'Code chantier', 'Chantier', 'Opération', 'Responsable', 'Personne', "Nom tel qu'écrit", 'Fichier(s) source', 'Format']);
    expect(cellulesHistorique([base]).Affectations[1]).toHaveLength(10);
  });
  it('compte les passages par personne et classe les trois chantiers fréquents', () => {
    const ls = [base, { ...base, date: '2026-11-05' }, { ...base, affaire_id: 'b', code_chantier: '6002' }];
    expect(cellulesHistorique(ls).Personnes[1]).toEqual(['DUPONT Émile', 3, new Date('2026-11-05T00:00:00Z'), new Date('2026-11-06T00:00:00Z'), '6001 · Salon', 2, '6002 · Salon', 1, '', 0, 3, 0]);
  });
  it('agrège période et opérations par chantier sans doubler les opérations', () => {
    expect(cellulesHistorique([base, { ...base, date: '2026-11-05', operations: ['montage', 'demontage'] }]).Chantiers[1]).toEqual(['6001', 'Salon', 2, new Date('2026-11-05T00:00:00Z'), new Date('2026-11-06T00:00:00Z'), 'demontage / montage', 2, 0]);
  });
  it('sépare terrain et atelier sans changer les dix colonnes', () => {
    const sheets = cellulesHistorique([base, { ...base, format: 'Staffing atelier' }, { ...base, source: 'Import historique', format: 'Excel original' }]);
    expect(sheets.Personnes[1]?.slice(-2)).toEqual([2, 1]);
    expect(sheets.Chantiers[1]?.slice(-2)).toEqual([2, 1]);
    expect(sheets.Affectations[2]?.[9]).toBe('Staffing atelier');
    expect(sheets.Affectations[3]?.[9]).toBe('Excel original');
    expect(sheets.Affectations.every(row => row.length === 10)).toBe(true);
  });
  it('compte un passage mixte une fois au total et dans chaque catégorie', () => {
    const row = cellulesHistorique([{ ...base, passage_terrain: true, passage_atelier: true }]).Personnes[1];
    expect(row?.[1]).toBe(1);
    expect(row?.slice(-2)).toEqual([1, 1]);
  });
  it('conserve la provenance import et la source Staffing dans Format', () => {
    const result = cellulesHistorique([base, { ...base, source: 'Import historique', format: 'Import historique', fichiers_source: 'ancien.xlsx' }]);
    expect(result.Affectations[1]?.slice(8)).toEqual(['', 'Staffing terrain']);
    expect(result.Affectations[2]?.slice(8)).toEqual(['ancien.xlsx', 'Import historique']);
  });
});