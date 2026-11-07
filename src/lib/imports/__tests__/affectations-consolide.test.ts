import { describe, expect, it } from 'vitest';
import { cleNomTerrain, COLONNES_AFFECTATIONS, lireAffectationsConsolide, rapprocherAffectations } from '../affectations-consolide';

const ligne = ['03/06/2025', 'mardi', '6055', 'Chantier test', '', '', 'ÉVRARD François', 'Evrard F.', 'planning.xlsx', 'historique'];
describe('Historique consolidé terrain', () => {
  it('accepte les dix colonnes et une opération vide, sans inventer de durée', () => {
    const r = lireAffectationsConsolide([[...COLONNES_AFFECTATIONS], ligne], '2026-11-07');
    expect(r.erreurs).toEqual([]);
    expect(r.lignes[0]?.date).toBe('2025-06-03');
    expect(r.lignes[0]?.operation).toBe('');
    expect(r.lignes[0]).not.toHaveProperty('heures');
  });
  it('dédoublonne date chantier personne même si opération ou accents diffèrent', () => {
    const autre = [...ligne]; autre[4] = 'montage'; autre[6] = 'Francois Evrard';
    const r = lireAffectationsConsolide([[...COLONNES_AFFECTATIONS], ligne, autre], '2026-11-07');
    expect(r.lignes).toHaveLength(1); expect(r.doublons).toBe(1);
  });
  it('tolère casse accents espaces et ordre sans résoudre les homonymes', () => {
    expect(cleNomTerrain('  françois   ÉVRARD ')).toBe(cleNomTerrain('Evrard Francois'));
    const r = lireAffectationsConsolide([[...COLONNES_AFFECTATIONS], ligne], '2026-11-07');
    const noms = [{ id: 'a', nom: 'Evrard', prenom: 'Francois', origine: 'employe' as const }, { id: 'b', nom: 'Évrard', prenom: 'François', origine: 'dispos' as const }];
    expect(rapprocherAffectations(r.lignes, noms, [{ id: 'c', numero: '6055' }])[0]?.candidats).toHaveLength(2);
  });
  it('laisse une personne ou un code inconnu à rapprocher sans création', () => {
    const r = lireAffectationsConsolide([[...COLONNES_AFFECTATIONS], ligne], '2026-11-07');
    expect(rapprocherAffectations(r.lignes, [], [])[0]).toMatchObject({ candidats: [], affaireId: null });
  });
  it('refuse un jour incohérent et une date future', () => {
    const fauxJour = [...ligne]; fauxJour[1] = 'lundi';
    const futur = [...ligne]; futur[0] = '09/11/2026'; futur[1] = 'lundi';
    const r = lireAffectationsConsolide([[...COLONNES_AFFECTATIONS], fauxJour, futur], '2026-11-07');
    expect(r.lignes).toHaveLength(0); expect(r.erreurs).toHaveLength(2);
  });
  it('refuse un autre format et une date impossible', () => {
    expect(lireAffectationsConsolide([['Nom', 'Taux']], '2026-11-07').erreurs).toHaveLength(1);
    const invalide = [...ligne]; invalide[0] = '31/06/2025';
    expect(lireAffectationsConsolide([[...COLONNES_AFFECTATIONS], invalide], '2026-11-07').lignes).toHaveLength(0);
  });
});