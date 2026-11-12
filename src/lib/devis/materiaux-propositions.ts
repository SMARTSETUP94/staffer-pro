// Règles pures du lot « Prix proposés au catalogue » (miroir des contrôles en base).
export type PropositionStatut = "propose" | "valide" | "refuse";

export const STATUT_LABEL: Record<PropositionStatut, string> = {
  propose: "proposé au catalogue",
  valide: "validé au catalogue",
  refuse: "refusé au catalogue",
};

/** Une ligne de devis peut être proposée si elle est hors catalogue et n'a pas déjà de proposition. */
export function peutProposer(m: { materiau_id: string | null }, statut: PropositionStatut | undefined, readOnly: boolean): boolean {
  return !readOnly && m.materiau_id == null && statut === undefined;
}

/** La base exige un choix « remplacer » ou « ajouter » quand une ligne active a le même fournisseur et la même référence. */
export function estChoixRequis(message: string | undefined | null): boolean {
  return !!message && message.includes("CHOIX_REQUIS");
}

export type ValidationForm = {
  fournisseur_id: string; nouveau_fournisseur: string; produit: string; ref: string; unite: string;
  prix_achat: string; date_tarif: string; mode: "" | "remplacer" | "ajouter";
};

/** Contrôle côté écran avant validation ; la base refait les mêmes contrôles. Renvoie l'erreur ou null. */
export function erreurValidation(f: ValidationForm, prixVisible: boolean, prixActuel: number | null): string | null {
  if (!f.fournisseur_id && !f.nouveau_fournisseur.trim()) return "Choisissez un fournisseur ou créez-en un.";
  if (!f.produit.trim()) return "La désignation est obligatoire.";
  const prix = prixVisible ? Number(f.prix_achat.replace(",", ".")) : Number(prixActuel ?? 0);
  if (!(prix > 0)) return "Le prix d'achat doit être supérieur à 0.";
  return null;
}

/** Charge envoyée à materiau_proposition_valider : uniquement les champs renseignés. */
export function payloadValidation(f: ValidationForm, prixVisible: boolean): Record<string, string> {
  const p: Record<string, string> = { produit: f.produit.trim(), ref: f.ref.trim(), unite: f.unite.trim() };
  if (f.nouveau_fournisseur.trim()) p.nouveau_fournisseur = f.nouveau_fournisseur.trim();
  else p.fournisseur_id = f.fournisseur_id;
  if (prixVisible) p.prix_achat = f.prix_achat.replace(",", ".").trim();
  if (f.date_tarif) p.date_tarif = f.date_tarif;
  if (f.mode) p.mode = f.mode;
  return p;
}

/** Clé de dédoublonnage de la reprise : fournisseur et désignation normalisés (miroir simplifié de devis_normalize). */
export function cleReprise(fournisseur: string | null, designation: string): string {
  const n = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${n(fournisseur ?? "")}|${n(designation)}`;
}

/** Garde le plus récent de chaque groupe et ignore les groupes déjà proposés/refusés. */
export function dedoublonnerReprise<T extends { fournisseur: string | null; designation: string; created_at: string }>(
  lignes: T[], dejaProposes: Set<string>,
): T[] {
  const best = new Map<string, T>();
  for (const l of lignes) {
    if (!l.designation.trim()) continue;
    const k = cleReprise(l.fournisseur, l.designation);
    if (dejaProposes.has(k)) continue;
    const cur = best.get(k);
    if (!cur || l.created_at > cur.created_at) best.set(k, l);
  }
  return [...best.values()];
}
