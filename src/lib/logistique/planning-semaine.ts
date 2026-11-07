/** Règles pures du Planning logistique (page unique) : besoins qualifiés, alertes « À traiter », messages équipe, copie d'équipe, filtres. */
import { memePersonne, statutDispo, alerteDispo, heureCourte, horaire, type AffectationPlanning, type DispoPlanning, type EtapePlanning, type PersonnePlanning } from '@/lib/imports/planning-equipes';

export type EtapeSemaine = EtapePlanning & { affaire_id: string; permis_requis?: string[] | null; caces_requis?: string[] | null; caces_autre_requis?: string | null; vehicule?: string | null };
export type AffectationSemaine = AffectationPlanning & { id: string; confirmation?: string | null };
export type PersonneSemaine = PersonnePlanning & { telephone?: string | null };

const PERMIS_COUVRE: Record<string, string[]> = { B: ['B', 'C', 'CE'], C: ['C', 'CE'], CE: ['CE'] };

export function equipeDe<P extends PersonnePlanning>(e: { id: string }, jour: string, affectations: AffectationSemaine[], personnes: P[]) {
  return affectations.filter(a => a.etape_id === e.id && a.date === jour).map(a => ({ a, p: personnes.find(p => memePersonne(p, a)) }));
}

export type Besoin = { label: string; couvert: boolean };
/** Puces « 1 chef · 1 permis C · 1 R489 » ; un permis supérieur couvre l'inférieur (CE ⊃ C ⊃ B). */
export function besoinsEtape(e: Pick<EtapeSemaine, 'nb_chefs_equipe' | 'permis_requis' | 'caces_requis'>, equipe: { a: AffectationPlanning; p?: PersonnePlanning }[]): Besoin[] {
  const res: Besoin[] = [];
  const chefs = e.nb_chefs_equipe ?? 0;
  if (chefs > 0) {
    const n = equipe.filter(x => x.a.role === 'chef_equipe').length;
    res.push({ label: `${chefs} chef${chefs > 1 ? 's' : ''}`, couvert: n >= chefs });
  }
  const permis = e.permis_requis ?? [];
  const pris = new Set<number>();
  for (const code of permis) {
    const ok = PERMIS_COUVRE[code] ?? [code];
    const i = equipe.findIndex((x, idx) => !pris.has(idx) && (x.p?.permis ?? []).some(c => ok.includes(c)));
    if (i >= 0) pris.add(i);
    res.push({ label: `1 permis ${code}`, couvert: i >= 0 });
  }
  for (const code of e.caces_requis ?? []) {
    res.push({ label: `1 ${code.replace(/^CACES_/, '')}`, couvert: equipe.some(x => (x.p?.caces ?? []).some(c => c.replace(/^CACES_/, '') === code.replace(/^CACES_/, ''))) });
  }
  return res;
}

export type Alerte = { code: 'pas_dispo' | 'sans_reponse' | 'chevauchement' | 'sous_staffee' | 'besoin' | 'horaire' | 'vehicule' | 'sans_demontage' | 'relance_dispos'; gravite: 'rouge' | 'orange'; texte: string; etape_id?: string; jour?: string };

const minutes = (h: string | null | undefined) => { if (!h) return null; const [a, b] = h.split(':'); return Number(a) * 60 + Number(b ?? 0); };
const plage = (e: EtapePlanning): [number, number] | null => { const d = minutes(e.heure); if (d === null) return null; const f = minutes(e.heure_fin); return [d, f !== null && f > d ? f : d + 240]; };
export const ajouterJoursIso = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nomCourt = (p?: PersonnePlanning) => (p ? `${p.nom} ${p.prenom}`.trim() : 'Personne à vérifier');
const tit = (e: EtapeSemaine, libelles: Record<string, string>) => `${e.numero} · ${libelles[e.type] ?? e.type}`;

export type EntreeAlertes = {
  dates: string[]; etapes: EtapeSemaine[]; affectations: AffectationSemaine[]; personnes: PersonneSemaine[]; dispos: DispoPlanning[];
  aujourdhui: string; libelles: Record<string, string>;
  /** Chantiers ayant au moins un démontage prévu (toutes dates). */
  avecDemontage: Set<string>;
  /** Intervenants Dispos actifs sans aucune réponse la semaine suivante (calculé seulement à partir du jeudi). */
  sansReponseSemaineSuivante?: PersonneSemaine[];
};

export function alertesPlanning(x: EntreeAlertes): Alerte[] {
  const out: Alerte[] = [];
  for (const jour of x.dates) {
    const duJour = x.etapes.filter(e => e.date <= jour && e.fin >= jour);
    for (const e of duJour) {
      const equipe = equipeDe(e, jour, x.affectations, x.personnes);
      const t = tit(e, x.libelles);
      for (const { p } of equipe) {
        if (!p) continue;
        const al = alerteDispo(statutDispo(p, jour, x.dispos));
        if (al === 'rouge') out.push({ code: 'pas_dispo', gravite: 'rouge', texte: `${nomCourt(p)} staffé « Pas dispo » sur ${t}`, etape_id: e.id, jour });
        else if (al === 'orange') out.push({ code: 'sans_reponse', gravite: 'orange', texte: `${nomCourt(p)} staffé sans réponse dispo sur ${t}`, etape_id: e.id, jour });
      }
      const besoin = e.nb_personnes ?? 0;
      if (besoin > equipe.length && jour >= x.aujourdhui && jour <= ajouterJoursIso(x.aujourdhui, 3)) out.push({ code: 'sous_staffee', gravite: 'rouge', texte: `${t} : ${equipe.length}/${besoin} à moins de 3 jours`, etape_id: e.id, jour });
      for (const b of besoinsEtape(e, equipe)) if (!b.couvert) out.push({ code: 'besoin', gravite: 'rouge', texte: `${t} : ${b.label} non couvert`, etape_id: e.id, jour });
      if (!e.heure) out.push({ code: 'horaire', gravite: 'orange', texte: `${t} : horaire à confirmer`, etape_id: e.id, jour });
      if ((e.type === 'chargement' || e.type === 'livraison') && !e.nb_vehicules && !e.vehicule) out.push({ code: 'vehicule', gravite: 'orange', texte: `${t} : aucun véhicule`, etape_id: e.id, jour });
    }
    // Même personne sur deux étapes qui se chevauchent le même jour
    const parPersonne = new Map<string, EtapeSemaine[]>();
    for (const a of x.affectations.filter(a => a.date === jour)) {
      const e = duJour.find(e => e.id === a.etape_id); if (!e) continue;
      const cle = a.employe_id ? `e:${a.employe_id}` : `d:${a.dispos_intervenant_id}`;
      parPersonne.set(cle, [...(parPersonne.get(cle) ?? []), e]);
    }
    for (const [cle, liste] of parPersonne) for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++) {
      const a = plage(liste[i]), b = plage(liste[j]);
      if (!a || !b || (a[0] < b[1] && b[0] < a[1])) {
        const p = x.personnes.find(p => (cle.startsWith('e:') ? p.origine === 'employe' : p.origine === 'dispos') && p.id === cle.slice(2));
        out.push({ code: 'chevauchement', gravite: 'rouge', texte: `${nomCourt(p)} sur ${tit(liste[i], x.libelles)} et ${tit(liste[j], x.libelles)} en même temps`, etape_id: liste[j].id, jour });
      }
    }
  }
  const vus = new Set<string>();
  for (const e of x.etapes) if (e.type === 'montage' && !x.avecDemontage.has(e.affaire_id) && !vus.has(e.affaire_id)) {
    vus.add(e.affaire_id);
    out.push({ code: 'sans_demontage', gravite: 'orange', texte: `${e.numero} · ${e.nom} : montage sans démontage prévu`, etape_id: e.id, jour: e.date });
  }
  for (const p of x.sansReponseSemaineSuivante ?? []) out.push({ code: 'relance_dispos', gravite: 'orange', texte: `${nomCourt(p)} n'a pas répondu pour la semaine prochaine` });
  return out.sort((a, b) => (a.gravite === b.gravite ? 0 : a.gravite === 'rouge' ? -1 : 1) || (a.jour ?? '').localeCompare(b.jour ?? ''));
}

/** Intervenants Dispos (non reliés ou reliés) actifs sans aucune ligne de dispo sur la période. */
export function sansReponse(personnes: PersonneSemaine[], dispos: DispoPlanning[]) {
  return personnes.filter(p => p.actif !== false && p.dispos_id && !dispos.some(d => d.intervenant_id === p.dispos_id));
}
export const estJeudiOuApres = (iso: string) => { const j = new Date(`${iso}T12:00:00Z`).getUTCDay(); return j === 4 || j === 5 || j === 6 || j === 0; };

const jourLong = (iso: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const ligneEtape = (e: EtapeSemaine, libelles: Record<string, string>) => [`${e.numero} ${e.nom}`, libelles[e.type] ?? e.type, horaire(e) || 'horaire à confirmer', e.lieu].filter(Boolean).join(' · ');

/** Message WhatsApp du jour : une intervention par paragraphe, chef en premier. */
export function messageWhatsappJour(jour: string, etapes: EtapeSemaine[], affectations: AffectationSemaine[], personnes: PersonneSemaine[], libelles: Record<string, string>) {
  const duJour = etapes.filter(e => e.date <= jour && e.fin >= jour).sort((a, b) => (a.heure ?? '99').localeCompare(b.heure ?? '99'));
  const titre = `*Planning ${jourLong(jour)}*`;
  if (!duJour.length) return `${titre}\nAucune intervention.`;
  return [titre, ...duJour.map(e => {
    const eq = equipeDe(e, jour, affectations, personnes).sort((a, b) => Number(b.a.role === 'chef_equipe') - Number(a.a.role === 'chef_equipe'));
    const chef = eq.find(x => x.a.role === 'chef_equipe');
    return [`▶ ${ligneEtape(e, libelles)}`, chef ? `Chef : ${nomCourt(chef.p)}` : null, eq.length ? `Équipe : ${eq.map(x => nomCourt(x.p)).join(', ')}` : 'Équipe : à compléter'].filter(Boolean).join('\n');
  })].join('\n\n');
}

/** Missions de la semaine d'une personne. */
export function missionsPersonne(p: PersonneSemaine, dates: string[], etapes: EtapeSemaine[], affectations: AffectationSemaine[], libelles: Record<string, string>) {
  const lignes = dates.flatMap(jour => affectations.filter(a => a.date === jour && memePersonne(p, a)).map(a => {
    const e = etapes.find(e => e.id === a.etape_id);
    return e ? `• ${jourLong(jour)} : ${ligneEtape(e, libelles)}${a.role === 'chef_equipe' ? ' (chef)' : ''}` : null;
  }).filter(Boolean) as string[]);
  return [`*Missions de ${nomCourt(p)}*`, ...(lignes.length ? lignes : ['Aucune mission cette semaine.'])].join('\n');
}

/** Personnes à ajouter sur la cible, sans doublon avec l'équipe déjà en place. */
export function equipeACopier<P extends PersonnePlanning>(source: { a: AffectationPlanning; p?: P }[], cible: { id: string }, jour: string, affectations: AffectationPlanning[]) {
  const deja = affectations.filter(a => a.etape_id === cible.id && a.date === jour);
  return source.filter(x => x.p && !deja.some(d => memePersonne(x.p!, d))).map(x => ({ p: x.p!, role: x.a.role === 'chef_equipe' ? 'chef_equipe' : 'equipier' }));
}

export type FiltresPlanning = { chantier: string; operation: string; personne: string; nonPourvu: boolean; alerte: boolean };
export const FILTRES_VIDES: FiltresPlanning = { chantier: '', operation: '', personne: '', nonPourvu: false, alerte: false };
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').trim();

export function filtrerEtapes<E extends EtapeSemaine>(etapes: E[], f: FiltresPlanning, x: { affectations: AffectationSemaine[]; personnes: PersonneSemaine[]; alertes: Alerte[] }) {
  return etapes.filter(e => {
    if (f.chantier && !norm(`${e.numero} ${e.nom}`).includes(norm(f.chantier))) return false;
    if (f.operation && e.type !== f.operation) return false;
    const aff = x.affectations.filter(a => a.etape_id === e.id);
    if (f.personne && !aff.some(a => { const p = x.personnes.find(p => memePersonne(p, a)); return p && norm(`${p.nom} ${p.prenom}`).includes(norm(f.personne)); })) return false;
    if (f.nonPourvu) {
      const jours: string[] = []; for (let d = e.date; d <= e.fin; d = ajouterJoursIso(d, 1)) jours.push(d);
      if (!jours.some(j => aff.filter(a => a.date === j).length < Math.max(1, e.nb_personnes ?? 0))) return false;
    }
    if (f.alerte && !x.alertes.some(a => a.etape_id === e.id)) return false;
    return true;
  });
}
export { heureCourte };
