/** Helpers purs du Planning équipes : dispos, lisibilité, export et réimport Excel. */
import type { InterventionLue } from './planning-hebdomadaire';

export type PersonnePlanning = { id: string; nom: string; prenom: string; origine: 'employe' | 'dispos'; actif?: boolean; chef?: boolean | null; permis?: string[] | null; caces?: string[] | null; caces_autre?: string | null; dispos_id?: string | null; poste?: string | null };
export type AffectationPlanning = { id?: string; employe_id: string | null; dispos_intervenant_id: string | null; date: string; etape_id: string | null; affaire_id: string; role?: string | null };
export type EtapePlanning = { id: string; date: string; fin: string; heure: string | null; heure_fin?: string | null; horaire_libre?: string | null; note?: string | null; nb_vehicules?: number | null; nb_chefs_equipe?: number | null; nb_personnes?: number | null; type: string; numero: string; nom: string; lieu: string | null; responsable: string | null; affaire_id?: string };
export type DispoPlanning = { intervenant_id: string; employe_id: string | null; jour: string; journee: boolean; soiree: boolean; pas_dispo: boolean };
export type StatutDispo = 'J' | 'S' | 'J+S' | 'pas' | 'vide';

export function memePersonne(p: PersonnePlanning, a: AffectationPlanning) {
  return p.origine === 'employe' ? a.employe_id === p.id : a.dispos_intervenant_id === p.id;
}
export function personnesStaffees<T extends PersonnePlanning>(personnes: T[], affectations: AffectationPlanning[], debut: string, fin: string): T[] {
  return personnes.filter(p => affectations.some(a => a.date >= debut && a.date <= fin && memePersonne(p, a))).sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
}

export function statutDispo(p: PersonnePlanning, jour: string, dispos: DispoPlanning[]): StatutDispo {
  const d = dispos.find(d => d.jour === jour && ((p.dispos_id && d.intervenant_id === p.dispos_id) || (p.origine === 'dispos' && d.intervenant_id === p.id) || (p.origine === 'employe' && d.employe_id === p.id)));
  if (!d) return 'vide';
  if (d.pas_dispo) return 'pas';
  if (d.journee && d.soiree) return 'J+S';
  if (d.journee) return 'J';
  if (d.soiree) return 'S';
  return 'vide';
}
export const estDispo = (s: StatutDispo) => s === 'J' || s === 'S' || s === 'J+S';
/** Rouge : staffé un jour « Pas dispo » ; orange : staffé sans réponse. */
export function alerteDispo(s: StatutDispo): 'rouge' | 'orange' | null {
  return s === 'pas' ? 'rouge' : s === 'vide' ? 'orange' : null;
}
/** Dispo d'abord, puis sans réponse, puis pas dispo ; ordre alphabétique ensuite. */
export function trierCandidats<T extends PersonnePlanning>(personnes: T[], jour: string, dispos: DispoPlanning[]): T[] {
  const rang = (p: T) => { const s = statutDispo(p, jour, dispos); return estDispo(s) ? 0 : s === 'vide' ? 1 : 2; };
  return [...personnes].sort((a, b) => rang(a) - rang(b) || a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
}
export function dispoNonStaffes<T extends PersonnePlanning>(personnes: T[], jour: string, dispos: DispoPlanning[], affectations: AffectationPlanning[]): T[] {
  return trierCandidats(personnes.filter(p => p.actif !== false && estDispo(statutDispo(p, jour, dispos)) && !affectations.some(a => a.date === jour && memePersonne(p, a))), jour, dispos);
}

/** « 07:00:00 » → « 7h », « 07:30 » → « 7h30 ». */
export function heureCourte(h: string | null | undefined) {
  if (!h) return '';
  const [hh, mm] = h.split(':');
  return `${Number(hh)}h${mm && mm !== '00' ? mm : ''}`;
}
export function horaire(e: Pick<EtapePlanning, 'heure' | 'heure_fin'>) {
  if (!e.heure) return '';
  return e.heure_fin ? `${heureCourte(e.heure)}–${heureCourte(e.heure_fin)}` : heureCourte(e.heure);
}
export function libelleCase(e: EtapePlanning, libelles: Record<string, string>) {
  return [`${e.numero} · ${libelles[e.type] ?? e.type}`, heureCourte(e.heure)].filter(Boolean).join(' ');
}

export function nomExport(p: PersonnePlanning | undefined, role?: string | null) {
  if (!p) return '(à vérifier)';
  return `${p.nom.toLocaleUpperCase('fr')} ${p.prenom}${role === 'chef_equipe' ? ' (chef)' : ''}`.trim();
}
const hhmm = (h: string | null | undefined) => (h ? h.slice(0, 5) : null);
export function commentaires(e: EtapePlanning) {
  const parts: string[] = [];
  parts.push(e.heure ? (e.heure_fin ? `${hhmm(e.heure)}–${hhmm(e.heure_fin)}` : hhmm(e.heure)!) : 'horaire à confirmer');
  if (e.horaire_libre && e.horaire_libre !== e.note) parts.push(e.horaire_libre);
  if (e.note) parts.push(e.note);
  if (e.nb_vehicules) parts.push(`${e.nb_vehicules} véhicule${e.nb_vehicules > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

export type BlocExport = { jour: string; etape: EtapePlanning; personnes: { nom: string; personne?: PersonnePlanning; role?: string | null }[] };
export function blocsExport(dates: string[], etapes: EtapePlanning[], affectations: AffectationPlanning[], personnes: PersonnePlanning[]): BlocExport[] {
  const blocs: BlocExport[] = [];
  for (const jour of dates) for (const e of etapes.filter(e => e.date <= jour && e.fin >= jour).sort((a, b) => (a.heure ?? '99').localeCompare(b.heure ?? '99') || a.numero.localeCompare(b.numero))) {
    const vus = new Set<string>();
    const liste = affectations.filter(a => a.etape_id === e.id && a.date === jour).flatMap(a => {
      const p = personnes.find(p => memePersonne(p, a));
      const cle = p ? `${p.origine}:${p.id}` : `?${a.employe_id ?? a.dispos_intervenant_id}`;
      if (vus.has(cle)) return [];
      vus.add(cle);
      return [{ nom: nomExport(p, a.role), personne: p, role: a.role }];
    }).sort((a, b) => (b.role === 'chef_equipe' ? 1 : 0) - (a.role === 'chef_equipe' ? 1 : 0) || a.nom.localeCompare(b.nom, 'fr'));
    blocs.push({ jour, etape: e, personnes: liste });
  }
  return blocs;
}

export const ENTETE_BLOC = ['Code', 'Nom chantier', 'Responsable', 'Opération', 'Adresse', 'Commentaires'];
export const COLONNES_STAFFING = ['etape_id', 'affaire_id', 'date', 'code', 'chantier', 'type', 'heure', 'heure_fin', 'lieu', 'responsable', 'note', 'personne_id', 'origine', 'nom', 'role'];
export type Cellule = string | number | { date: string };
/** Lignes de la feuille « Planning » au format de la logistique. */
export function lignesPlanning(blocs: BlocExport[], libelles: Record<string, string>): Cellule[][] {
  const rows: Cellule[][] = [];
  let jourCourant = '';
  for (const b of blocs) {
    if (b.jour !== jourCourant) { if (jourCourant) rows.push([]); rows.push([{ date: b.jour }]); jourCourant = b.jour; }
    const e = b.etape;
    rows.push([...ENTETE_BLOC]);
    const comm = [commentaires(e), b.personnes.length < (e.nb_personnes ?? 0) || !b.personnes.length ? `Besoin : ${b.personnes.length}/${e.nb_personnes ?? 0}` : ''].filter(Boolean).join(' · ');
    rows.push([e.numero, e.nom, e.responsable ?? '', libelles[e.type] ?? e.type, e.lieu ?? '', comm]);
    const noms = b.personnes.map(p => p.nom);
    for (let i = 0; i < noms.length; i += 6) rows.push(noms.slice(i, i + 6));
    rows.push([]);
  }
  return rows;
}
export function lignesStaffing(blocs: BlocExport[]): string[][] {
  const rows = [COLONNES_STAFFING];
  for (const b of blocs) for (const p of b.personnes) {
    const e = b.etape;
    rows.push([e.id, e.affaire_id ?? '', b.jour, e.numero, e.nom, e.type, hhmm(e.heure) ?? '', hhmm(e.heure_fin) ?? '', e.lieu ?? '', e.responsable ?? '', e.note ?? '', p.personne?.id ?? '', p.personne?.origine ?? '', p.nom, p.role ?? '']);
  }
  return rows;
}

export const serialExcel = (iso: string) => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000;
export const isoDepuisSerial = (n: number) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);

export type LectureDeterministe = { interventions: InterventionLue[]; personnes: Record<string, string>; affaires: Record<string, string>; etapes: Record<number, string> };
const nettoyerNom = (n: string) => n.replace(/\s*\((chef|à vérifier)\)\s*$/i, '').trim();

/** Lecture sans IA : onglet « _staffing » prioritaire, sinon structure exacte de la feuille « Planning ». */
export function lirePlanningExcel(feuilles: Record<string, unknown[][]>, libelles: Record<string, string>, cleNom: (n: string) => string): LectureDeterministe | null {
  const staffing = feuilles['_staffing'];
  if (staffing?.length && COLONNES_STAFFING.every((c, i) => String(staffing[0]?.[i] ?? '') === c)) {
    const groupes = new Map<string, InterventionLue & { etape_id: string; affaire_id: string }>();
    const personnes: Record<string, string> = {};
    for (const r of staffing.slice(1)) {
      const v = (i: number) => String(r[i] ?? '').trim();
      if (!v(0) || !v(2)) continue;
      const cle = `${v(0)}|${v(2)}`;
      const g = groupes.get(cle) ?? { etape_id: v(0), affaire_id: v(1), date: v(2), code: v(3), chantier: v(4), type: v(5) as InterventionLue['type'], heure: v(6) || null, heure_fin: v(7) || null, lieu: v(8), responsable: v(9), note: v(10), personnes: [] };
      const nom = nettoyerNom(v(13));
      if (nom) { g.personnes.push(nom); if (v(11) && v(12)) personnes[cleNom(nom)] = `${v(12)}:${v(11)}`; }
      groupes.set(cle, g);
    }
    const liste = [...groupes.values()].filter(g => g.personnes.length).sort((a, b) => a.date.localeCompare(b.date) || (a.heure ?? '').localeCompare(b.heure ?? ''));
    const affaires: Record<string, string> = {}; const etapes: Record<number, string> = {};
    const interventions = liste.map(({ etape_id, affaire_id, ...b }, i) => { if (affaire_id) affaires[b.code] = affaire_id; etapes[i] = etape_id; return b; });
    return { interventions, personnes, affaires, etapes };
  }
  const planning = feuilles['Planning'];
  if (!planning) return null;
  const types = Object.fromEntries(Object.entries(libelles).map(([k, l]) => [l.toLocaleLowerCase('fr'), k]));
  const interventions: InterventionLue[] = [];
  let jour = '';
  for (let i = 0; i < planning.length; i++) {
    const r = planning[i] ?? [];
    const premier = r[0];
    if (typeof premier === 'number' && r.slice(1).every(c => c == null || c === '')) { jour = isoDepuisSerial(premier); continue; }
    if (ENTETE_BLOC.every((h, k) => String(r[k] ?? '').trim() === h)) {
      const v = (planning[i + 1] ?? []).map(c => String(c ?? '').trim());
      const type = types[(v[3] ?? '').toLocaleLowerCase('fr')];
      if (!jour || !type) return null;
      const segments = (v[5] ?? '').split(' · ');
      const m = /^(\d{2}:\d{2})(?:–(\d{2}:\d{2}))?$/.exec(segments[0] ?? '');
      const reste = segments.slice(m || segments[0] === 'horaire à confirmer' ? 1 : 0).filter(s => !/^\d+ véhicules?$/.test(s) && !/^Besoin : \d+\/\d+$/.test(s));
      const noms: string[] = [];
      let j = i + 2;
      for (; j < planning.length && (planning[j] ?? []).some(c => c != null && c !== ''); j++) noms.push(...(planning[j] ?? []).map(c => nettoyerNom(String(c ?? ''))).filter(n => n && n !== ''));
      if (noms.length) interventions.push({ date: jour, code: v[0] ?? '', chantier: v[1] ?? '', type: type as InterventionLue['type'], heure: m?.[1] ?? null, heure_fin: m?.[2] ?? null, lieu: v[4] ?? '', responsable: v[2] ?? '', note: reste.join(' · '), personnes: noms });
      i = j;
    }
  }
  return interventions.length ? { interventions, personnes: {}, affaires: {}, etapes: {} } : null;
}
