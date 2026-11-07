import { describe, expect, it } from 'vitest';
import { alerteDispo, blocsExport, dispoNonStaffes, libelleCase, lignesPlanning, lignesStaffing, lirePlanningExcel, personnesStaffees, statutDispo, trierCandidats, serialExcel, type DispoPlanning, type PersonnePlanning } from '../planning-equipes';
import { creerExportPlanning, lireClasseur, nomFichierPlanning } from '../planning-equipes-export';
import { ETAPE_LABELS } from '@/lib/logistique/etapes';
import { cleNomTerrain } from '../affectations-consolide';

const kevin: PersonnePlanning = { id: 'e1', nom: 'Etrillard', prenom: 'Kevin', origine: 'employe', dispos_id: 'd1', actif: true };
const rayan: PersonnePlanning = { id: 'd2', nom: 'Kitoune', prenom: 'Rayan', origine: 'dispos', dispos_id: 'd2', actif: true };
const morad: PersonnePlanning = { id: 'e3', nom: 'Id barka', prenom: 'Morad', origine: 'employe', actif: true };
const dispos: DispoPlanning[] = [
  { intervenant_id: 'd1', employe_id: 'e1', jour: '2026-11-09', journee: true, soiree: false, pas_dispo: false },
  { intervenant_id: 'd2', employe_id: null, jour: '2026-11-09', journee: false, soiree: false, pas_dispo: true },
];
const etape = { id: 's1', affaire_id: 'a1', date: '2026-11-09', fin: '2026-11-10', heure: '07:00:00', heure_fin: '12:30:00', type: 'demontage', nb_personnes: 5, nb_vehicules: 2, note: '1 porteur', numero: '4120', nom: 'Rotation Murat', lieu: 'MURAT', responsable: 'Raoul' };
const vide = { ...etape, id: 's2', numero: '6039', nom: 'Desk', heure: null, heure_fin: null, nb_vehicules: null, note: null, nb_personnes: 5, date: '2026-11-09', fin: '2026-11-09' };
const affectations = [
  { employe_id: 'e1', dispos_intervenant_id: null, date: '2026-11-09', etape_id: 's1', affaire_id: 'a1', role: 'chef_equipe' },
  { employe_id: null, dispos_intervenant_id: 'd2', date: '2026-11-09', etape_id: 's1', affaire_id: 'a1', role: 'equipier' },
];

describe('dispos dans le planning', () => {
  it('lit J, pas dispo et sans réponse', () => {
    expect(statutDispo(kevin, '2026-11-09', dispos)).toBe('J');
    expect(statutDispo(rayan, '2026-11-09', dispos)).toBe('pas');
    expect(statutDispo(morad, '2026-11-09', dispos)).toBe('vide');
  });
  it('alerte rouge si pas dispo, orange si sans réponse', () => {
    expect(alerteDispo('pas')).toBe('rouge');
    expect(alerteDispo('vide')).toBe('orange');
    expect(alerteDispo('J')).toBeNull();
  });
  it('trie dispo, puis sans réponse, puis pas dispo', () => {
    expect(trierCandidats([rayan, morad, kevin], '2026-11-09', dispos).map(p => p.id)).toEqual(['e1', 'e3', 'd2']);
  });
  it('liste les dispos non staffés du jour', () => {
    expect(dispoNonStaffes([kevin, rayan, morad], '2026-11-09', dispos, [])).toEqual([kevin]);
    expect(dispoNonStaffes([kevin], '2026-11-09', dispos, affectations)).toEqual([]);
  });
  it('ne garde que les personnes staffées', () => {
    expect(personnesStaffees([morad, rayan, kevin], affectations, '2026-11-09', '2026-11-15').map(p => p.id)).toEqual(['e1', 'd2']);
  });
});

describe('export au format logistique', () => {
  it('case lisible', () => expect(libelleCase(etape, ETAPE_LABELS)).toBe('4120 · Démontage 7h'));
  it('nom du fichier', () => expect(nomFichierPlanning('2026-11-09', '2026-11-15', 46)).toBe('Planning S46 du 09-11 au 15-11-2026.xlsx'));
  it('vraie date, commentaires complets, chef et besoin 0/5', () => {
    const rows = lignesPlanning(blocsExport(['2026-11-09'], [etape, vide], affectations, [kevin, rayan]), ETAPE_LABELS);
    expect(rows[0]).toEqual([{ date: '2026-11-09' }]);
    expect(rows[2]).toEqual(['4120', 'Rotation Murat', 'Raoul', 'Démontage', 'MURAT', '07:00–12:30 · 1 porteur · 2 véhicules · Besoin : 2/5']);
    expect(rows[3]).toEqual(['ETRILLARD Kevin (chef)', 'KITOUNE Rayan']);
    expect(rows[6]?.[5]).toBe('horaire à confirmer · Besoin : 0/5');
  });
  it('personne introuvable marquée sans bloquer', () => {
    const b = blocsExport(['2026-11-09'], [etape], affectations, [kevin]);
    expect(b[0]?.personnes.map(p => p.nom)).toContain('(à vérifier)');
  });
  it('aller-retour export → réimport sans différence', async () => {
    const blob = await creerExportPlanning(['2026-11-09', '2026-11-10'], [etape, vide], affectations, [kevin, rayan]);
    const feuilles = await lireClasseur(await blob.arrayBuffer());
    const lu = lirePlanningExcel(feuilles, ETAPE_LABELS, cleNomTerrain)!;
    expect(lu.interventions).toEqual([{ date: '2026-11-09', code: '4120', chantier: 'Rotation Murat', type: 'demontage', heure: '07:00', heure_fin: '12:30', lieu: 'MURAT', responsable: 'Raoul', note: '1 porteur', personnes: ['ETRILLARD Kevin', 'KITOUNE Rayan'] }]);
    expect(lu.etapes).toEqual({ 0: 's1' });
    expect(Object.values(lu.personnes).sort()).toEqual(['dispos:d2', 'employe:e1']);
    expect(feuilles['Planning']?.[0]?.[0]).toBe(serialExcel('2026-11-09'));
    const sansStaffing = lirePlanningExcel({ Planning: feuilles['Planning']! }, ETAPE_LABELS, cleNomTerrain)!;
    expect(sansStaffing.interventions.map(({ date, code, type, heure, heure_fin, note, personnes }) => ({ date, code, type, heure, heure_fin, note, personnes }))).toEqual([{ date: '2026-11-09', code: '4120', type: 'demontage', heure: '07:00', heure_fin: '12:30', note: '1 porteur', personnes: ['ETRILLARD Kevin', 'KITOUNE Rayan'] }]);
    expect(lignesStaffing(blocsExport(['2026-11-09'], [etape], affectations, [kevin, rayan]))).toHaveLength(3);
  });
});
