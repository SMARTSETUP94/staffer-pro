import { describe, expect, it } from 'vitest';
import { verifierPlanning, candidatsPersonne, passagesMultiples, type InterventionLue } from '../planning-hebdomadaire';
const bloc: InterventionLue = { date: '2026-11-13', code: '4132', chantier: 'CANAP92', type: 'permanence', heure: '09:00', heure_fin: null, lieu: 'VISUAL RIVE GAUCHE', responsable: 'Raoul', note: '', personnes: ['AIDEL Farid', 'CHURLAUD REMI'] };
describe('Import hebdomadaire', () => {
  it('conserve permanence et démontage le même jour', () => {
    const result = verifierPlanning([bloc, { ...bloc, type: 'demontage', heure: '16:00' }]);
    expect(result.interventions).toHaveLength(2);
    expect(result.interventions.map(b => b.type)).toEqual(['permanence', 'demontage']);
  });
  it('dédoublonne les personnes sans accents ni ordre imposé', () => {
    const result = verifierPlanning([bloc, { ...bloc, personnes: ['Farid Aidel', 'CHURLAUD Rémi'] }]);
    expect(result.interventions).toHaveLength(1); expect(result.interventions[0]?.personnes).toHaveLength(2);
  });
  it('rattache un externe Dispos existant sans créer un employé', () => {
    expect(candidatsPersonne('Rémi Churlaud', [{ id: 'externe', nom: 'CHURLAUD', prenom: 'REMI', origine: 'dispos' }])).toEqual([{ id: 'externe', nom: 'CHURLAUD', prenom: 'REMI', origine: 'dispos' }]);
  });
  it('garde les noms ambigus à valider', () => {
    expect(candidatsPersonne('Farid Aidel', [{ id: '1', nom: 'AIDEL', prenom: 'Farid', origine: 'employe' }, { id: '2', nom: 'AIDEL', prenom: 'Farid', origine: 'dispos' }])).toHaveLength(2);
  });
  it('ne suppose pas de fin pour une heure inconnue', () => {
    const result = verifierPlanning([{ ...bloc, date: '2026-11-12', heure: null, note: 'horaire à confirmer' }]);
    expect(result.interventions[0]?.heure).toBeNull(); expect(result.interventions[0]?.heure_fin).toBeNull();
  });
  it('signale plusieurs interventions par personne et jour', () => {
    expect(passagesMultiples([bloc, { ...bloc, type: 'demontage', heure: '16:00' }]).map(p => p.nombre)).toEqual([2, 2]);
  });
  it('refuse une date impossible', () => { expect(verifierPlanning([{ ...bloc, date: '2026-02-30' }]).erreurs).toHaveLength(1); });
});