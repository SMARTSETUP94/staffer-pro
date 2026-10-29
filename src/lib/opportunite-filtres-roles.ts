/**
 * Filtres « Sans D » / « Sans RP » du pipeline opportunités (oct. 2026).
 * Règles pures, testées — à l'instar du filtre « Sans CA ».
 *
 * - « Sans D » (sans dessinateur/concepteur) : ne concerne que les statuts
 *   À l'étude, Presque gagné et Gagné (un concepteur est attendu dès l'étude).
 * - « Sans RP » (sans responsable projet) : ne concerne que Presque gagné et Gagné.
 * Une opportunité hors de ces statuts n'est jamais remontée par ces filtres.
 */
import type { OpportuniteStatut } from "@/lib/opportunites";
import type { ProjetRole } from "@/lib/labels";

export const STATUTS_SANS_DESSINATEUR: readonly OpportuniteStatut[] = [
  "a_l_etude",
  "presque_gagne",
  "gagne",
];
export const STATUTS_SANS_RESPONSABLE_PROJET: readonly OpportuniteStatut[] = [
  "presque_gagne",
  "gagne",
];

export interface OppRoleFilterRow {
  statut_opportunite: OpportuniteStatut;
  roles_affectes?: string[] | null;
}

/** Vrai si le statut est concerné et que le rôle n'est pas pourvu. */
export function roleManquantPourStatut(
  statut: OpportuniteStatut,
  role: ProjetRole,
  statutsConcernes: readonly OpportuniteStatut[],
  rolesAffectes: readonly string[] | null | undefined,
): boolean {
  if (!statutsConcernes.includes(statut)) return false;
  return !(rolesAffectes ?? []).includes(role);
}

export function matchSansDessinateur(o: OppRoleFilterRow): boolean {
  return roleManquantPourStatut(o.statut_opportunite, "concepteur", STATUTS_SANS_DESSINATEUR, o.roles_affectes);
}

export function matchSansResponsableProjet(o: OppRoleFilterRow): boolean {
  return roleManquantPourStatut(o.statut_opportunite, "responsable_projet", STATUTS_SANS_RESPONSABLE_PROJET, o.roles_affectes);
}
