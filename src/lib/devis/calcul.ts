/**
 * Calcul local du devis — miroir exact de la fonction serveur `devis_calculer_interne`.
 * Sert au recalcul immédiat dans l'éditeur ; le chiffre serveur fait foi après enregistrement.
 */
export type LigneType = "zone" | "objet" | "commentaire" | "chapitre_suivi" | "chapitre_pose" | "chapitre_depose" | "option";

export interface CalcLigne { id: string; parent_id: string | null; type: LigneType; quantite: number; ordre?: number; option_incluse?: boolean }
export interface CalcHeure { ligne_id: string; heures: number; taux_vente: number; cout_revient?: number | null; par_unite: boolean; metier_id?: number | null; montant_force?: number | null }
/** prix_vente_unitaire : renvoyé par le serveur quand l'achat et le coefficient sont masqués (sans droit coûts). */
export interface CalcMateriau { ligne_id: string; quantite: number; prix_achat?: number | null; coefficient: number; prix_vente_unitaire?: number | null }
export interface CalcLibre { ligne_id: string; quantite: number; prix_achat?: number | null; prix_forfait?: number | null; coefficient: number; prix_vente_unitaire?: number | null; par_unite: boolean; heures_info?: number | null; metier_info_id?: number | null }

export interface CalcResult {
  total_ht: number; remise: number; net_ht: number; tva: number; ttc: number; options_ht: number;
  lignes: Record<string, number>; racines: Record<string, number>;
  heures_metier: Record<string, number>;
  cout_total: number | null; marge: number | "non_calculable";
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type RemiseMode = "aucune" | "montant" | "pct" | "net_cible";
export interface Remise { mode: RemiseMode; valeur?: number | null }

/** Remise positive (déduite du total), arrondie au centime, bornée à [0, total]. */
export function calculerRemise(totalHt: number, remise?: Remise | null): number {
  if (!remise || remise.mode === "aucune") return 0;
  const v = Number(remise.valeur ?? 0);
  const brut = remise.mode === "montant" ? Math.abs(v) : remise.mode === "pct" ? totalHt * v / 100 : totalHt - (remise.valeur == null ? totalHt : v);
  return Math.min(totalHt, Math.max(0, r2(brut)));
}

/** Montant d'une ligne d'heures : le montant saisi fait foi, sinon heures × taux. */
export const montantHeure = (h: Pick<CalcHeure, "heures" | "taux_vente" | "montant_force">) =>
  h.montant_force != null ? Number(h.montant_force) : h.heures * h.taux_vente;

/** Prix de vente unitaire d'un matériau : achat × coefficient, ou prix de vente fourni par le serveur. */
export const venteUnitaireMateriau = (x: Pick<CalcMateriau, "prix_achat" | "coefficient" | "prix_vente_unitaire">) =>
  x.prix_achat != null ? x.prix_achat * x.coefficient : Number(x.prix_vente_unitaire ?? 0);
/** Prix de vente unitaire d'une ligne libre : prix de vente direct (forfait), sinon achat × coefficient. */
export const venteUnitaireLibre = (f: Pick<CalcLibre, "prix_forfait" | "prix_achat" | "coefficient" | "prix_vente_unitaire">) =>
  f.prix_forfait != null ? f.prix_forfait : f.prix_achat != null ? f.prix_achat * f.coefficient : Number(f.prix_vente_unitaire ?? 0);

export function calculerDevis(
  lignes: CalcLigne[], heures: CalcHeure[], materiaux: CalcMateriau[], libres: CalcLibre[], tvaPct = 20, remise?: Remise | null,
): CalcResult {
  const byParent = new Map<string | null, CalcLigne[]>();
  for (const l of lignes) {
    const k = l.parent_id ?? null;
    byParent.set(k, [...(byParent.get(k) ?? []), l]);
  }
  const info = new Map<string, { racine: string; option: boolean; q: number }>();
  const walk = (parent: string | null, racine: string | null, option: boolean) => {
    for (const l of byParent.get(parent) ?? []) {
      const rac = racine ?? l.id;
      const opt = option || (l.type === "option" && !l.option_incluse);
      info.set(l.id, { racine: rac, option: opt, q: Number(l.quantite) || 0 });
      walk(l.id, rac, opt);
    }
  };
  walk(null, null, false);

  const montants: Record<string, number> = {};
  const racines: Record<string, number> = {};
  const metiers: Record<string, number> = {};
  let ht = 0, opt = 0, cout = 0, manq = false;

  for (const [id, inf] of info) {
    let vu = 0, vl = 0, cu = 0, cl = 0, m = false;
    for (const h of heures) if (h.ligne_id === id) {
      const v = montantHeure(h), c = h.heures * (h.cout_revient ?? 0);
      if (h.par_unite) { vu += v; cu += c; } else { vl += v; cl += c; }
      if (h.cout_revient == null && h.heures > 0) m = true;
      if (!inf.option) {
        const k = h.metier_id == null ? "aucun" : String(h.metier_id);
        metiers[k] = r2((metiers[k] ?? 0) + h.heures * (h.par_unite ? inf.q : 1));
      }
    }
    for (const x of materiaux) if (x.ligne_id === id) {
      vu += x.quantite * venteUnitaireMateriau(x);
      cu += x.quantite * (x.prix_achat ?? 0);
    }
    for (const f of libres) if (f.ligne_id === id) {
      const v = f.quantite * venteUnitaireLibre(f);
      const c = f.quantite * (f.prix_achat ?? 0);
      if (f.par_unite) { vu += v; cu += c; } else { vl += v; cl += c; }
      if (!inf.option && f.heures_info) {
        const k = f.metier_info_id == null ? "aucun" : String(f.metier_info_id);
        metiers[k] = r2((metiers[k] ?? 0) + f.heures_info * (f.par_unite ? inf.q : 1));
      }
    }
    const vente = r2(vu * inf.q + vl);
    if (vente !== 0) montants[id] = vente;
    racines[inf.racine] = r2((racines[inf.racine] ?? 0) + vente);
    if (inf.option) opt += vente;
    else { ht += vente; cout += cu * inf.q + cl; if (m) manq = true; }
  }
  const total = r2(ht), rem = calculerRemise(total, remise), net = r2(total - rem), tva = r2(net * tvaPct / 100);
  return {
    total_ht: total, remise: rem === 0 ? 0 : -rem, net_ht: net, tva, ttc: r2(net + tva), options_ht: r2(opt),
    lignes: montants, racines, heures_metier: metiers,
    cout_total: manq ? null : r2(cout), marge: manq ? "non_calculable" : r2(net - cout),
  };
}

/** Aide à la conversion : surface ou pièces → panneaux, ml → barres, perte en %. Arrondi au supérieur. */
export function convertirEnUnitesVente(
  mode: "m2" | "pieces" | "ml",
  saisie: { m2?: number; pieces?: { l: number; w: number; n: number }[]; ml?: number },
  format: { longueur_mm?: number | null; largeur_mm?: number | null },
  pertePct = 0,
): number | null {
  const k = 1 + (pertePct || 0) / 100;
  if (mode === "ml") {
    if (!format.longueur_mm || !saisie.ml) return null;
    return Math.ceil((saisie.ml * k) / (format.longueur_mm / 1000) - 1e-9);
  }
  if (!format.longueur_mm || !format.largeur_mm) return null;
  const surfPanneau = (format.longueur_mm * format.largeur_mm) / 1e6;
  const m2 = mode === "m2"
    ? saisie.m2 ?? 0
    : (saisie.pieces ?? []).reduce((s, p) => s + (p.l * p.w * p.n) / 1e6, 0);
  if (!m2) return null;
  return Math.ceil((m2 * k) / surfPanneau - 1e-9);
}

export type UniteFamille = "m2" | "ml" | "piece" | "rouleau" | "autre";

/** Classe l'unité de vente d'un produit du catalogue. */
export function familleUnite(unite: string | null | undefined): UniteFamille {
  const u = (unite ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (/^m(²|2)$/.test(u) || u === "m 2") return "m2";
  if (u === "ml" || u === "m" || u === "metre lineaire") return "ml";
  if (/^(rouleau|bobine)/.test(u)) return "rouleau";
  if (/^(panneau|plaque|barre|tole|feuille|piece)s?$/.test(u)) return "piece";
  return "autre";
}

const fr = (n: number, d = 2) => n.toLocaleString("fr-FR", { maximumFractionDigits: d });

/**
 * Quantité à facturer dans l'unité du produit, avec le détail du calcul.
 * - m² : panneaux arrondis × surface du panneau si le format est connu, sinon m² × (1 + perte).
 * - ml : barres arrondies × longueur de barre si connue, sinon ml × (1 + perte).
 * - panneau/plaque/barre/tôle/feuille/pièce : nombre de pièces ; rouleau : nombre de rouleaux.
 */
export function quantiteDepuisAide(
  unite: string | null | undefined,
  mode: "m2" | "pieces" | "ml",
  saisie: { m2?: number; pieces?: { l: number; w: number; n: number }[]; ml?: number },
  format: { longueur_mm?: number | null; largeur_mm?: number | null },
  pertePct = 0,
): { quantite: number; detail: string } | null {
  const fam = familleUnite(unite);
  const k = 1 + (pertePct || 0) / 100;
  const L = Number(format.longueur_mm) || 0, W = Number(format.largeur_mm) || 0;
  const surfFmt = L && W ? (L * W) / 1e6 : 0;
  const perteTxt = pertePct ? ` (perte ${fr(pertePct)} % incluse)` : "";
  const m2Saisis = mode === "m2" ? Number(saisie.m2) || 0
    : mode === "pieces" ? (saisie.pieces ?? []).reduce((s, p) => s + (p.l * p.w * p.n) / 1e6, 0) : 0;
  const mlSaisis = mode === "ml" ? Number(saisie.ml) || 0
    : mode === "pieces" ? (saisie.pieces ?? []).reduce((s, p) => s + (p.l * p.n) / 1000, 0) : 0;

  if (fam === "m2") {
    let m2 = m2Saisis;
    if (mode === "ml") { if (!W || !mlSaisis) return null; m2 = (mlSaisis * W) / 1000; }
    if (!m2) return null;
    if (surfFmt && L && W && mode !== "ml") {
      const n = Math.ceil((m2 * k) / surfFmt - 1e-9);
      const q = r2(n * surfFmt);
      return { quantite: q, detail: `${n} panneau${n > 1 ? "x" : ""} de ${fr(L / 1000)} × ${fr(W / 1000)} = ${fr(q)} m²${perteTxt}` };
    }
    const q = r2(m2 * k);
    return { quantite: q, detail: `${fr(m2)} m² × ${fr(k, 4)} = ${fr(q)} m²${perteTxt}` };
  }
  if (fam === "ml") {
    if (mode === "m2" || !mlSaisis) return null;
    if (L) {
      const n = Math.ceil((mlSaisis * k) / (L / 1000) - 1e-9);
      const q = r2((n * L) / 1000);
      return { quantite: q, detail: `${n} barre${n > 1 ? "s" : ""} de ${fr(L / 1000)} m = ${fr(q)} ml${perteTxt}` };
    }
    const q = r2(mlSaisis * k);
    return { quantite: q, detail: `${fr(mlSaisis)} ml × ${fr(k, 4)} = ${fr(q)} ml${perteTxt}` };
  }
  // pièces, rouleaux, autres unités comptées à la pièce
  const nom = fam === "rouleau" ? "rouleau" : (unite || "pièce");
  if (mode === "ml") {
    if (!L || !mlSaisis) return null;
    const n = Math.ceil((mlSaisis * k) / (L / 1000) - 1e-9);
    return { quantite: n, detail: `${fr(mlSaisis)} ml ÷ ${fr(L / 1000)} m = ${n} ${nom}${n > 1 ? "s" : ""}${perteTxt}` };
  }
  if (!surfFmt || !m2Saisis) return null;
  const n = Math.ceil((m2Saisis * k) / surfFmt - 1e-9);
  return { quantite: n, detail: `${fr(m2Saisis)} m² ÷ ${fr(L / 1000)} × ${fr(W / 1000)} (${fr(surfFmt)} m²) = ${n} ${nom}${n > 1 ? "s" : ""}${perteTxt}` };
}

/** Écart en % entre le taux saisi et le taux de la grille. */
export function ecartTauxPct(taux: number, grille: number | null | undefined): number | null {
  if (grille == null || grille === 0) return null;
  return r2(((taux - grille) / grille) * 100);
}
