// Logique pure du formulaire « Enregistrer le taux » (Paramètres > Devis — taux).
export type NiveauCourant = { niveau: string; taux_vente: number | null; cout_revient: number | null; par_defaut: boolean | null };

export const NOUVEAU_NIVEAU = "__nouveau__";

/** Nombre ≥ 0, virgule acceptée. "" → null ; invalide → NaN. */
export function parseMontant(v: string): number | null {
  const s = v.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return Number.NaN;
  return Number(s);
}

export function niveauInitial(niveaux: NiveauCourant[]): string {
  return niveaux.find((n) => n.par_defaut)?.niveau ?? niveaux.find((n) => n.niveau === "standard")?.niveau ?? niveaux[0]?.niveau ?? NOUVEAU_NIVEAU;
}

export type TauxSaisie = { choix: string; nouveauNiveau: string; taux: string; cout: string; date: string };
export type TauxEvaluation =
  | { ok: true; niveau: string; taux_vente: number | null; cout_revient: number | null }
  | { ok: false; raison: string; erreur: boolean };

export function evaluerTaux(s: TauxSaisie, niveaux: NiveauCourant[]): TauxEvaluation {
  const nouveau = s.choix === NOUVEAU_NIVEAU;
  const niveau = (nouveau ? s.nouveauNiveau : s.choix).trim();
  if (!niveau) return { ok: false, raison: "Indiquez le nom du nouveau niveau.", erreur: false };
  const courant = niveaux.find((n) => n.niveau === niveau) ?? null;
  if (nouveau && courant) return { ok: false, raison: `Le niveau « ${niveau} » existe déjà : choisissez-le dans la liste.`, erreur: true };
  const t = parseMontant(s.taux);
  const c = parseMontant(s.cout);
  if (Number.isNaN(t)) return { ok: false, raison: "Taux de vente invalide : nombre positif attendu (ex. 45,50).", erreur: true };
  if (Number.isNaN(c)) return { ok: false, raison: "Coût de revient invalide : nombre positif attendu (ex. 32,00).", erreur: true };
  if (!s.date) return { ok: false, raison: "La date d'effet est obligatoire.", erreur: true };
  // Champ vide = on garde la valeur en vigueur (jamais de null qui écraserait).
  const taux_vente = t ?? courant?.taux_vente ?? null;
  const cout_revient = c ?? courant?.cout_revient ?? null;
  if (taux_vente == null && cout_revient == null) return { ok: false, raison: "Saisissez un taux de vente ou un coût de revient.", erreur: false };
  if (courant && taux_vente === (courant.taux_vente ?? null) && cout_revient === (courant.cout_revient ?? null))
    return { ok: false, raison: "Aucun changement par rapport aux valeurs en vigueur.", erreur: false };
  return { ok: true, niveau, taux_vente, cout_revient };
}
