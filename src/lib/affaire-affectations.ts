export type AffaireResponsableField = "chef_projet_id" | "dessinateur_id";

/** Lot 1 « mode projet » : le concepteur / dessinateur n'est plus réservé aux 6XXX. */
export function canAssignDessinateur(_numero: string): boolean {
  return true;
}

/** Valeurs vides transmises à la signature : la base conserve alors les rôles déjà saisis. */
export function signatureAffectations(chefProjetId: string | null, dessinateurId: string | null, _code: string) {
  return {
    _chef_projet_id: chefProjetId,
    _dessinateur_id: dessinateurId,
  };
}
