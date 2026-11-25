/** Règles pures de cohérence opportunité ↔ devis retenu (lot Suivi des devis). */
export type StatutOpp = "a_faire" | "envoye" | "a_l_etude" | "presque_gagne" | "gagne" | "perdu";
export type DevisRetenu = { statut_redaction: string; date_envoi: string | null } | null;

/** Message de refus pour un passage manuel incohérent, ou null s'il est permis. */
export function refusPassageOpportunite(cible: StatutOpp, devis: DevisRetenu): string | null {
  if (cible === "envoye") {
    if (!devis) return "Aucun devis : rédigez et finalisez un devis, puis marquez-le envoyé.";
    if (["brouillon", "a_valider"].includes(devis.statut_redaction)) return "Le devis est en brouillon : finalisez-le puis utilisez « Marquer envoyé le… ».";
    if (!devis.date_envoi) return "Le devis n'a pas de date d'envoi : utilisez « Marquer envoyé le… ».";
  }
  return null;
}

export const CANAUX_ENVOI = { mail: "Mail", main_propre: "Remis en main propre", progbat: "ProGBat", autre: "Autre" } as const;

/** Date d'envoi ou de signature : jamais dans le futur (format AAAA-MM-JJ). */
export const dateGestePermise = (date: string, aujourdhui: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= aujourdhui;

export const numeroProgbatDefinitifValide = (n: string) => /^D-\d{6}-\d{4}$/.test(n.trim());
