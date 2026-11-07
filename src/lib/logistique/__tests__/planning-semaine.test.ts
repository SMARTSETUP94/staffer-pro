import { describe, expect, it } from 'vitest';
import { alertesPlanning, besoinsEtape, equipeACopier, filtrerEtapes, messageWhatsappJour, missionsPersonne, FILTRES_VIDES, type EtapeSemaine, type AffectationSemaine, type PersonneSemaine } from '../planning-semaine';

const L = { montage: 'Montage', livraison: 'Livraison', rotation: 'Rotation', demontage: 'Démontage' };
const etape = (o: Partial<EtapeSemaine> = {}): EtapeSemaine => ({ id: 'e1', affaire_id: 'A', date: '2026-11-10', fin: '2026-11-10', heure: '07:00:00', heure_fin: '15:30:00', type: 'montage', numero: '4130', nom: 'The Voice', lieu: 'Lendit', responsable: null, nb_personnes: 3, ...o });
const P: PersonneSemaine[] = [
  { id: 'p1', nom: 'MARTIN', prenom: 'Léo', origine: 'employe', permis: ['CE'], caces: ['R489'] },
  { id: 'p2', nom: 'DURAND', prenom: 'Ali', origine: 'dispos', dispos_id: 'p2', permis: ['B'] },
];
const aff = (id: string, p: PersonneSemaine, o: Partial<AffectationSemaine> = {}): AffectationSemaine => ({ id, employe_id: p.origine === 'employe' ? p.id : null, dispos_intervenant_id: p.origine === 'dispos' ? p.id : null, date: '2026-11-10', etape_id: 'e1', affaire_id: 'A', role: 'equipier', ...o });
const dispo = (id: string, o = {}) => ({ intervenant_id: id, employe_id: null, jour: '2026-11-10', journee: true, soiree: false, pas_dispo: false, ...o });
const base = { dates: ['2026-11-10'], dispos: [dispo('p2')], aujourdhui: '2026-11-08', libelles: L, avecDemontage: new Set(['A']) };

describe('besoins qualifiés', () => {
  it('un permis CE couvre un permis C requis, chef manquant reste rouge', () => {
    const b = besoinsEtape({ nb_chefs_equipe: 1, permis_requis: ['C'], caces_requis: ['R489'] }, [{ a: aff('a1', P[0]), p: P[0] }]);
    expect(b).toEqual([{ label: '1 chef', couvert: false }, { label: '1 permis C', couvert: true }, { label: '1 R489', couvert: true }]);
  });
  it('un permis B ne couvre pas un permis C', () => {
    expect(besoinsEtape({ permis_requis: ['C'] }, [{ a: aff('a2', P[1]), p: P[1] }])[0].couvert).toBe(false);
  });
});

describe('alertes À traiter', () => {
  it('pas dispo en rouge, sans réponse en orange, sous-staffé à J-3', () => {
    const al = alertesPlanning({ ...base, dispos: [dispo('p2', { pas_dispo: true, journee: false })], etapes: [etape()], affectations: [aff('a1', P[0]), aff('a2', P[1])], personnes: P });
    expect(al.map(a => a.code).sort()).toEqual(['pas_dispo', 'sans_reponse', 'sous_staffee']);
  });
  it('chevauchement, horaire, véhicule et montage sans démontage', () => {
    const e2 = etape({ id: 'e2', type: 'livraison', heure: null, heure_fin: null, nb_personnes: 1, affaire_id: 'B', numero: '4132' });
    const al = alertesPlanning({ ...base, aujourdhui: '2026-11-01', avecDemontage: new Set(), etapes: [etape({ nb_personnes: 1 }), e2], affectations: [aff('a2', P[1]), aff('a3', P[1], { etape_id: 'e2', affaire_id: 'B' })], personnes: P });
    const codes = al.map(a => a.code);
    expect(codes).toContain('chevauchement');
    expect(codes).toContain('horaire');
    expect(codes).toContain('vehicule');
    expect(codes.filter(c => c === 'sans_demontage')).toHaveLength(1);
  });
  it('deux rotations 6h et 20h ne se chevauchent pas', () => {
    const al = alertesPlanning({ ...base, etapes: [etape({ type: 'rotation', heure: '06:00', heure_fin: null, nb_personnes: 1 }), etape({ id: 'e2', type: 'rotation', heure: '20:00', heure_fin: null, nb_personnes: 1 })], affectations: [aff('a2', P[1]), aff('a3', P[1], { etape_id: 'e2' })], personnes: P });
    expect(al.map(a => a.code)).not.toContain('chevauchement');
  });
});

describe('communication équipe', () => {
  it('message WhatsApp du jour avec chef en premier', () => {
    const m = messageWhatsappJour('2026-11-10', [etape()], [aff('a2', P[1]), aff('a1', P[0], { role: 'chef_equipe' })], P, L);
    expect(m).toBe('*Planning mardi 10 novembre*\n\n▶ 4130 The Voice · Montage · 7h–15h30 · Lendit\nChef : MARTIN Léo\nÉquipe : MARTIN Léo, DURAND Ali');
  });
  it('missions de la semaine d’une personne', () => {
    expect(missionsPersonne(P[0], ['2026-11-10', '2026-11-11'], [etape()], [aff('a1', P[0], { role: 'chef_equipe' })], L)).toBe('*Missions de MARTIN Léo*\n• mardi 10 novembre : 4130 The Voice · Montage · 7h–15h30 · Lendit (chef)');
  });
});

describe('copie d’équipe et filtres', () => {
  it('copie sans doublon et garde le rôle chef', () => {
    const src = [{ a: aff('a1', P[0], { role: 'chef_equipe' }), p: P[0] }, { a: aff('a2', P[1]), p: P[1] }];
    const r = equipeACopier(src, { id: 'e9' }, '2026-11-11', [aff('x', P[1], { etape_id: 'e9', date: '2026-11-11' })]);
    expect(r).toEqual([{ p: P[0], role: 'chef_equipe' }]);
  });
  it('filtre non pourvu et personne (sans accents)', () => {
    const e = [etape(), etape({ id: 'e2', nb_personnes: 1 })];
    const a = [aff('a1', P[0]), aff('a2', P[0], { etape_id: 'e2' })];
    expect(filtrerEtapes(e, { ...FILTRES_VIDES, nonPourvu: true }, { affectations: a, personnes: P, alertes: [] }).map(x => x.id)).toEqual(['e1']);
    expect(filtrerEtapes(e, { ...FILTRES_VIDES, personne: 'leo' }, { affectations: a, personnes: P, alertes: [] })).toHaveLength(2);
  });
});
