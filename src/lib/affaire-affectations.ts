export type AffaireResponsableField = "chef_projet_id" | "dessinateur_id";

export function canAssignDessinateur(numero: string): boolean {
  return /^6\d{3}$/.test(numero.trim());
}

export function signatureAffectations(chefProjetId: string | null, dessinateurId: string | null, code: string) {
  return {
    _chef_projet_id: chefProjetId,
    _dessinateur_id: canAssignDessinateur(code) ? dessinateurId : null,
  };
}