import { normalizeName } from '@/lib/string-normalize';

export const COLONNES_AFFECTATIONS = ['Date', 'Jour', 'Code chantier', 'Chantier', 'Opération', 'Responsable', 'Personne', 'Nom tel qu\'écrit', 'Fichier(s) source', 'Format'] as const;

export type PassageHistorique = {
  ligne: number; date: string; code: string; chantier: string; operation: string;
  responsable: string; personne: string; nomOriginal: string; sources: string; format: string;
};
export type PersonneReference = { id: string; nom: string; prenom: string; origine: 'employe' | 'dispos' };
export type Rapprochement = { ligne: PassageHistorique; candidats: PersonneReference[]; affaireId: string | null };

export function cleNomTerrain(nom: string): string {
  return normalizeName(nom).split(/\s+/).filter(Boolean).sort().join(' ');
}

function dateFr(valeur: unknown): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(valeur ?? '').trim());
  if (!match) return null;
  const [, jour, mois, annee] = match;
  const iso = `${annee}-${mois}-${jour}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

export function lireAffectationsConsolide(rows: unknown[][], aujourdHui: string) {
  const erreurs: string[] = [];
  const lignes: PassageHistorique[] = [];
  const entete = rows[0] ?? [];
  if (COLONNES_AFFECTATIONS.some((titre, i) => String(entete[i] ?? '').trim() !== titre) || entete.length !== 10) {
    return { lignes, erreurs: ['Les dix colonnes de l’onglet Affectations doivent respecter le format convenu.'], doublons: 0 };
  }
  const vus = new Set<string>();
  let doublons = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (row.every(c => c === null || c === undefined || String(c).trim() === '')) continue;
    const text = (n: number) => String(row[n] ?? '').trim();
    const date = dateFr(row[0]);
    const code = text(2);
    const personne = text(6);
    if (!date || !code || !personne) { erreurs.push(`Ligne ${i + 1} : date, code chantier et personne obligatoires (date jj/mm/aaaa).`); continue; }
    if (date > aujourdHui) { erreurs.push(`Ligne ${i + 1} : date future, à saisir dans Staffing.`); continue; }
    const jour = normalizeName(new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'Europe/Paris' }).format(new Date(`${date}T12:00:00Z`)));
    if (normalizeName(text(1)) !== jour) { erreurs.push(`Ligne ${i + 1} : le jour ne correspond pas à la date.`); continue; }
    const cle = `${date}|${code}|${cleNomTerrain(personne)}`;
    if (vus.has(cle)) { doublons++; continue; }
    vus.add(cle);
    lignes.push({ ligne: i + 1, date, code, chantier: text(3), operation: text(4), responsable: text(5), personne, nomOriginal: text(7), sources: text(8), format: text(9) });
  }
  return { lignes, erreurs, doublons };
}

export function rapprocherAffectations(lignes: PassageHistorique[], personnes: PersonneReference[], affaires: { id: string; numero: string }[]): Rapprochement[] {
  const noms = new Map<string, PersonneReference[]>();
  for (const p of personnes) {
    const cle = cleNomTerrain(`${p.nom} ${p.prenom}`);
    noms.set(cle, [...(noms.get(cle) ?? []), p]);
  }
  const codes = new Map(affaires.map(a => [a.numero, a.id]));
  return lignes.map(ligne => ({ ligne, candidats: noms.get(cleNomTerrain(ligne.personne)) ?? [], affaireId: codes.get(ligne.code) ?? null }));
}