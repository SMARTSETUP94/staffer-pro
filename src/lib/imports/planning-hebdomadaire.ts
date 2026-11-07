import { z } from 'zod';
import { ETAPE_TYPES } from '@/lib/logistique/etapes';
import { cleNomTerrain, type PersonneReference } from './affectations-consolide';

export const planningLuSchema = z.object({ interventions: z.array(z.object({
  date: z.string(), code: z.string(), chantier: z.string(), type: z.enum(ETAPE_TYPES),
  heure: z.string().nullable(), heure_fin: z.string().nullable(), lieu: z.string(),
  responsable: z.string(), note: z.string(), personnes: z.array(z.string()),
}).strict()) }).strict();
export type InterventionLue = z.infer<typeof planningLuSchema>['interventions'][number];
export type ReferencesPlanning = { personnes: (PersonneReference & { actif?: boolean })[]; affaires: { id: string; numero: string; nom: string }[] };

export function verifierPlanning(interventions: InterventionLue[]) {
  const erreurs: string[] = [];
  if (!interventions.length) erreurs.push('Aucune intervention trouvée.');
  const vues = new Map<string, InterventionLue>();
  for (const [index, b] of interventions.entries()) {
    const d = new Date(`${b.date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== b.date) erreurs.push(`Intervention ${index + 1} : date invalide.`);
    if (!b.code.trim() || !b.personnes.length || b.personnes.some(p => !p.trim())) erreurs.push(`Intervention ${index + 1} : chantier ou personnes manquants.`);
    if ([b.heure, b.heure_fin].some(h => h !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(h))) erreurs.push(`Intervention ${index + 1} : horaire invalide.`);
    const key = [b.date, b.code, b.type, b.heure ?? '', b.lieu.trim().toLocaleLowerCase('fr')].join('|');
    const precedent = vues.get(key);
    if (precedent) precedent.personnes = [...new Map([...precedent.personnes, ...b.personnes].map(p => [cleNomTerrain(p), p])).values()];
    else vues.set(key, { ...b, personnes: [...new Map(b.personnes.map(p => [cleNomTerrain(p), p])).values()] });
  }
  return { interventions: [...vues.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.heure ?? '').localeCompare(b.heure ?? '')), erreurs };
}

export function candidatsPersonne(nom: string, personnes: ReferencesPlanning['personnes']) {
  return personnes.filter(p => p.actif !== false && cleNomTerrain(`${p.nom} ${p.prenom}`) === cleNomTerrain(nom));
}

export function passagesMultiples(interventions: InterventionLue[]) {
  const comptes = new Map<string, { date: string; nom: string; nombre: number }>();
  for (const b of interventions) for (const nom of b.personnes) {
    const key = `${b.date}|${cleNomTerrain(nom)}`;
    const value = comptes.get(key) ?? { date: b.date, nom, nombre: 0 };
    value.nombre++; comptes.set(key, value);
  }
  return [...comptes.values()].filter(v => v.nombre > 1);
}