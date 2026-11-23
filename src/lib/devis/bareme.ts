// Logique pure du barème devis (Paramètres > Devis — taux) : marges, alertes, modifications en attente.

export const PAIRES_FRAIS = [
  { cle: "frais_horaire", libelle: "Frais horaires" },
  { cle: "repas", libelle: "Repas" },
  { cle: "coursier_22m3", libelle: "Coursier 22 m³" },
  { cle: "semi_remorque", libelle: "Semi-remorque" },
] as const;

export const PARAMS_DEVIS = [
  { cle: "coef_materiaux", libelle: "Coefficient matériaux" },
  { cle: "tva_pct", libelle: "TVA" },
  { cle: "validite_jours", libelle: "Validité du devis" },
  { cle: "heures_par_jour_be", libelle: "Heures par jour bureau d'études" },
  { cle: "seuil_alerte_taux_pct", libelle: "Seuil d'alerte taux modifié" },
] as const;

/** Clés gérées hors de ce tableur (pipeline, planning opportunités). */
export const estParametreHorsBareme = (cle: string) => cle.startsWith("opp_plan_") || cle.startsWith("proba_");

export type Marge = { marge: number | null; pct: number | null; coef: number | null };

/** Marge = vente − coût ; % = marge / vente ; coef = vente / coût. */
export function marge(cout: number | null | undefined, vente: number | null | undefined): Marge {
  if (cout == null || vente == null) return { marge: null, pct: null, coef: null };
  const m = Math.round((vente - cout) * 100) / 100;
  return { marge: m, pct: vente > 0 ? m / vente : null, coef: cout > 0 ? vente / cout : null };
}

const normUnite = (u: string | null | undefined) => (u ?? "").replace(/\s/g, "").toLowerCase();

export type AlerteFrais = { venteSousCout: boolean; uniteIncoherente: boolean };
export function alertesFrais(p: { cout: number | null; vente: number | null; uniteCout: string | null; uniteVente: string | null }): AlerteFrais {
  return {
    venteSousCout: p.cout != null && p.vente != null && p.vente < p.cout,
    uniteIncoherente: !!p.uniteCout && !!p.uniteVente && normUnite(p.uniteCout) !== normUnite(p.uniteVente),
  };
}

/** Nombre ≥ 0, virgule et espaces acceptés. "" → null ; invalide → NaN. */
export function lireNombre(v: string): number | null {
  const s = v.trim().replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (s === "") return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return Number.NaN;
  return Number(s);
}

export type Modif =
  | { type: "taux"; cleLigne: string; libelle: string; poste_id: string; niveau: string; champ: "cout_revient" | "taux_vente" | "par_defaut"; avant: number | boolean | null; apres: number | boolean }
  | { type: "parametre"; cleLigne: string; libelle: string; cle: string; champ: "valeur"; avant: number | null; apres: number; unite: string | null }
  | { type: "poste"; cleLigne: string; libelle: string; poste_id: string; champ: "compte_be" | "actif"; avant: boolean; apres: boolean };

export const idModif = (m: Pick<Modif, "cleLigne" | "champ">) => `${m.cleLigne}|${m.champ}`;

/** Ajoute/remplace une modif ; la retire si on revient à la valeur d'origine. */
export function appliquerModif(liste: Modif[], m: Modif): Modif[] {
  const autres = liste.filter((x) => idModif(x) !== idModif(m));
  return m.apres === m.avant ? autres : [...autres, m];
}

export type ChangementRpc =
  | { type: "taux"; poste_id: string; niveau: string; taux_vente?: number; cout_revient?: number; par_defaut?: boolean }
  | { type: "parametre"; cle: string; valeur: number; unite: string | null };

/** Regroupe les modifs en une version par poste/niveau et par clé de paramètre. */
export function versChangements(liste: Modif[]): { bareme: ChangementRpc[]; postes: { poste_id: string; compte_be?: boolean; actif?: boolean }[] } {
  const taux = new Map<string, Extract<ChangementRpc, { type: "taux" }>>();
  const params: ChangementRpc[] = [];
  const postes = new Map<string, { poste_id: string; compte_be?: boolean; actif?: boolean }>();
  for (const m of liste) {
    if (m.type === "taux") {
      const k = `${m.poste_id}|${m.niveau}`;
      const c = taux.get(k) ?? { type: "taux" as const, poste_id: m.poste_id, niveau: m.niveau };
      if (m.champ === "par_defaut") c.par_defaut = m.apres as boolean; else c[m.champ] = m.apres as number;
      taux.set(k, c);
    } else if (m.type === "parametre") {
      params.push({ type: "parametre", cle: m.cle, valeur: m.apres, unite: m.unite });
    } else {
      const p = postes.get(m.poste_id) ?? { poste_id: m.poste_id };
      p[m.champ] = m.apres;
      postes.set(m.poste_id, p);
    }
  }
  return { bareme: [...taux.values(), ...params], postes: [...postes.values()] };
}

export type ControleDate = { ok: true; passe: boolean } | { ok: false; raison: string };
/** Date d'effet : aujourd'hui ou futur ; passé seulement pour un admin qui confirme. */
export function controlerDateEffet(date: string, aujourdhui: string, estAdmin: boolean, confirme: boolean): ControleDate {
  if (!date) return { ok: false, raison: "La date d'effet est obligatoire." };
  if (date >= aujourdhui) return { ok: true, passe: false };
  if (!estAdmin) return { ok: false, raison: "Date dans le passé : réservée aux admins." };
  if (!confirme) return { ok: false, raison: "Date dans le passé : cochez la confirmation." };
  return { ok: true, passe: true };
}
