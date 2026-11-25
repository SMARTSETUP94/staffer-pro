import type { DevisStatut } from "@/components/devis/editeur/api";

export type ActionStatut = DevisStatut | "envoye" | "revision";

/** Depuis brouillon/à valider, « envoyé » et « signé » enchaînent la finalisation (contrôles compris).
 * Transitions proposées par la liste ; les RPC restent la frontière d'autorisation. */
export function actionsStatutListe(st: DevisStatut, ecrire: boolean, valider: boolean, numeroProgbat: string | null, dateEnvoi: string | null): ActionStatut[] {
  const actions: ActionStatut[] = [];
  if (ecrire && st === "a_valider") actions.push("brouillon");
  if (ecrire && st === "brouillon") actions.push("a_valider");
  if (ecrire && valider && (st === "brouillon" || st === "a_valider")) actions.push("valide", "envoye", "signe");
  if (ecrire && valider && (st === "valide" || st === "transfere")) {
    if (st === "valide" || (numeroProgbat && !dateEnvoi)) actions.push("envoye");
    if (st === "valide") actions.push("transfere");
    actions.push("signe");
  }
  if (ecrire && valider && ["a_valider", "valide", "transfere"].includes(st)) actions.push("refuse");
  if (ecrire && st !== "brouillon") actions.push("revision");
  return actions;
}