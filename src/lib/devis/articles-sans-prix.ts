/** Saisie groupée des prix d'achat d'articles sans prix — règles pures, miroir de materiaux_sans_prix_enregistrer. */
export type ArticleSansPrix = { id: string; produit: string; famille: string | null; ref: string | null; unite: string | null; prix_achat_net: number | null; fournisseur: string | null };
export type Changement = { id: string; ancien_prix: number | null; prix: number };

export function lirePrix(saisie: string): number | null {
  const t = saisie.replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  if (!/^\d+(\.\d{1,4})?$/.test(t)) return Number.NaN;
  return Number(t);
}

/** Construit le lot : seules les saisies strictement positives partent ; toute saisie invalide est signalée. */
export function construireLot(articles: ArticleSansPrix[], saisies: Record<string, string>) {
  const lot: Changement[] = []; const erreurs: string[] = [];
  for (const a of articles) {
    const v = saisies[a.id];
    if (v == null || !v.trim()) continue;
    const n = lirePrix(v);
    if (n == null) continue;
    if (Number.isNaN(n) || n <= 0) { erreurs.push(`${a.produit} : prix d'achat strictement positif attendu`); continue; }
    lot.push({ id: a.id, ancien_prix: a.prix_achat_net, prix: n });
  }
  if (lot.length > 500) erreurs.push("500 articles maximum par enregistrement");
  return { lot, erreurs };
}
