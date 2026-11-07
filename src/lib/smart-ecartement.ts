export const MOTIF_SMART_NON_RELEVEE = 'boîte smart@ plus relevée';

export type LigneSmart = {
  source_boite: string;
  categorie_ia: string | null;
  statut: string;
  client_id?: string | null;
  contact_id?: string | null;
  opportunite_id?: string | null;
  candidature_id?: string | null;
};

/** Vrai mail smart@ (non prouvé reçu sur devis@) encore en attente et jamais traité → à écarter. */
export function doitEcarterSmart(r: LigneSmart, provenanceDevisConfirmee: boolean): boolean {
  if (provenanceDevisConfirmee) return false;
  if (r.source_boite !== 'smart' || r.categorie_ia !== 'opportunite' || r.statut !== 'pending_review') return false;
  return !r.client_id && !r.contact_id && !r.opportunite_id && !r.candidature_id;
}
