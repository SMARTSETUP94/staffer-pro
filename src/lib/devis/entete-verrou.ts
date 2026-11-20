/** Règles de verrouillage de l'en-tête « Client & interlocuteurs » (miroir des gardes en base). */
export type DroitsEntete = { devis: boolean; fiches: boolean; charge: boolean; message: string | null };

export function droitsEntete(statut: string | null | undefined, peutEcrire: boolean, peutModifierAffaire: boolean): DroitsEntete {
  const st = statut ?? "brouillon";
  const ouvertFiches = st === "brouillon" || st === "a_valider" || st === "valide";
  return {
    devis: peutEcrire && st === "brouillon",
    fiches: peutEcrire && ouvertFiches,
    charge: peutModifierAffaire,
    message: st === "brouillon" ? null
      : ouvertFiches ? "Client facturé, contact et signataire figés : faire une nouvelle version pour les changer."
      : "Devis transféré, signé ou remplacé : lecture seule (sauf chargé d'affaires).",
  };
}

/** Ligne PDF du chargé d'affaires ; null sans chargé d'affaires. */
export function ligneInterlocuteur(i: { nom?: string | null; email?: string | null } | null | undefined): string | null {
  const nom = i?.nom?.trim();
  if (!nom) return null;
  return `Votre interlocuteur Set Up : ${[nom, i?.email?.trim()].filter(Boolean).join(" · ")}`;
}

export type ChoixCharge = { id: string; prenom: string | null; nom: string | null; habituel: boolean };
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** Filtre par recherche puis groupe « Habituels » / « Autres employés ». */
export function grouperCharges(liste: ChoixCharge[], recherche: string) {
  const q = norm(recherche.trim());
  const ok = liste.filter((e) => !q || norm(`${e.prenom ?? ""} ${e.nom ?? ""}`).includes(q) || norm(`${e.nom ?? ""} ${e.prenom ?? ""}`).includes(q));
  return { habituels: ok.filter((e) => e.habituel), autres: ok.filter((e) => !e.habituel) };
}

/** Champs utiles au PDF manquants sur la fiche client. */
export function manquesClient(c: { adresse?: string | null; code_postal?: string | null; ville?: string | null; siret?: string | null; tva_intracom?: string | null } | null, email: string | null | undefined): string[] {
  if (!c) return [];
  return [!c.adresse && "adresse", !(c.code_postal && c.ville) && "code postal / ville", !c.siret && "SIRET", !c.tva_intracom && "TVA", !email && "e-mail"].filter(Boolean) as string[];
}
