import type { DevisClient } from './pdf-client';
/** Completude informative : ne refuse jamais un export. */
export function champsPdfManquants(vc: DevisClient): string[] {
  const manque: string[] = [];
  if (!vc.signataire?.nom?.trim() || !vc.signataire.email?.trim()) manque.push('Signataire nommé et email');
  if (!vc.logo_storage_path?.trim()) manque.push('Logo');
  if (!vc.mentions_legales?.iban?.trim()) manque.push('IBAN');
  if (!vc.mentions_legales?.bic?.trim()) manque.push('BIC');
  if (!vc.cgv?.trim()) manque.push('CGV');
  return manque;
}
