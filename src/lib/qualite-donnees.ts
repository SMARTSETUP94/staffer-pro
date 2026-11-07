/**
 * Qualité des données — règles pures partagées par la page admin et les tests.
 * Aucun champ de contrat ni de rémunération n'est lu ou proposé ici.
 */
import { normalizeName } from "@/lib/string-normalize";

/** Clé de nom insensible aux accents, à la casse, aux tirets/apostrophes et à l'ordre prénom/nom. */
export function cleNomQualite(...parts: (string | null | undefined)[]): string {
  return normalizeName(parts.filter(Boolean).join(" "))
    .replace(/[-'’_.]/g, " ")
    .split(/\s+/).filter(Boolean).sort().join(" ");
}

export type PersonneNom = { id: string; prenom: string | null; nom: string | null };

/** Candidats employés pour une fiche Dispos non reliée (refus « pas la même personne » exclus). */
export function candidatsHomonymes<T extends PersonneNom>(fiche: PersonneNom, employes: T[], refuses: string[] = []): T[] {
  const cle = cleNomQualite(fiche.prenom, fiche.nom);
  if (!cle) return [];
  return employes.filter((e) => !refuses.includes(e.id) && cleNomQualite(e.prenom, e.nom) === cle);
}

/** Paires d'employés probablement en doublon (même clé de nom), chaque paire une seule fois. */
export function pairesDoublons<T extends PersonneNom>(liste: T[]): [T, T][] {
  const parCle = new Map<string, T[]>();
  for (const p of liste) {
    const k = cleNomQualite(p.prenom, p.nom);
    if (k) parCle.set(k, [...(parCle.get(k) ?? []), p]);
  }
  const out: [T, T][] = [];
  for (const g of parCle.values()) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) out.push([g[i], g[j]]);
  return out;
}

const telNorm = (t: string | null | undefined) => {
  const d = (t ?? "").replace(/\D/g, "");
  return d.startsWith("33") && d.length === 11 ? `0${d.slice(2)}` : d;
};
const setEq = (a: string[] = [], b: string[] = []) => [...a].sort().join(",") === [...b].sort().join(",");

export type FicheDispos = { telephone: string | null; permis: string[] | null; caces: string[] | null; poste_terrain: string | null; est_chef_equipe_terrain: boolean | null };
export type FicheEmployeTerrain = { telephone: string | null; categories_permis: string[] | null; caces?: string[] | null; poste_principal: string | null; est_chef_equipe_terrain: boolean | null };
export type ChampDiff = "telephone" | "permis" | "caces" | "poste" | "chef";
export type DiffDispos = { champ: ChampDiff; dispos: string; employe: string };

/** Différences terrain Dispos → employé. Dispos fait foi ; une valeur Dispos vide ne propose rien. */
export function diffDisposEmploye(d: FicheDispos, e: FicheEmployeTerrain, avecCaces = false): DiffDispos[] {
  const out: DiffDispos[] = [];
  if (d.telephone?.trim() && telNorm(d.telephone) !== telNorm(e.telephone)) out.push({ champ: "telephone", dispos: d.telephone.trim(), employe: e.telephone ?? "" });
  const permis = (d.permis ?? []).filter((p) => ["B", "C", "CE", "D"].includes(p));
  if (permis.length && !setEq(permis, e.categories_permis ?? [])) out.push({ champ: "permis", dispos: permis.join(", "), employe: (e.categories_permis ?? []).join(", ") });
  if (avecCaces && d.caces?.length && !setEq(d.caces, e.caces ?? [])) out.push({ champ: "caces", dispos: d.caces.join(", "), employe: (e.caces ?? []).join(", ") });
  if (d.poste_terrain?.trim() && normalizeName(d.poste_terrain) !== normalizeName(e.poste_principal)) out.push({ champ: "poste", dispos: d.poste_terrain.trim(), employe: e.poste_principal ?? "" });
  if (d.est_chef_equipe_terrain != null && !!d.est_chef_equipe_terrain !== !!e.est_chef_equipe_terrain) out.push({ champ: "chef", dispos: d.est_chef_equipe_terrain ? "Oui" : "Non", employe: e.est_chef_equipe_terrain ? "Oui" : "Non" });
  return out;
}

/** CA proposé pour une opportunité : net HT du devis le plus récent non supprimé, sinon rien. */
export function caPropose(devis: { cree_le: string; net_ht: number | null; supprime_le?: string | null }[]): number | null {
  const d = devis.filter((x) => !x.supprime_le && x.net_ht != null && Number(x.net_ht) > 0).sort((a, b) => b.cree_le.localeCompare(a.cree_le))[0];
  return d ? Math.round(Number(d.net_ht) * 100) / 100 : null;
}
