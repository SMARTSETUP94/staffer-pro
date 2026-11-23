import { describe, expect, it } from "vitest";
import { alertesFrais, appliquerModif, controlerDateEffet, estParametreHorsBareme, marge, versChangements, type Modif } from "../bareme";

describe("barème devis", () => {
  it("marge, % et coef calculés depuis coût et vente", () => {
    expect(marge(40, 50)).toEqual({ marge: 10, pct: 0.2, coef: 1.25 });
    expect(marge(null, 50)).toEqual({ marge: null, pct: null, coef: null });
  });
  it("semi-remorque : vente 700 €/h < coût 750 € → deux alertes", () => {
    expect(alertesFrais({ cout: 750, vente: 700, uniteCout: "€", uniteVente: "€/h" })).toEqual({ venteSousCout: true, uniteIncoherente: true });
    expect(alertesFrais({ cout: 5, vente: 6, uniteCout: "€/h", uniteVente: "€ / h" })).toEqual({ venteSousCout: false, uniteIncoherente: false });
  });
  it("revenir à la valeur d'origine retire la modification", () => {
    const m: Modif = { type: "parametre", cleLigne: "p:tva_pct", libelle: "TVA", cle: "tva_pct", champ: "valeur", avant: 20, apres: 21, unite: "%" };
    const l = appliquerModif([], m);
    expect(l).toHaveLength(1);
    expect(appliquerModif(l, { ...m, apres: 20 })).toHaveLength(0);
  });
  it("coût et vente d'un même niveau forment une seule version", () => {
    const base = { type: "taux" as const, cleLigne: "t:p1:standard", libelle: "x", poste_id: "p1", niveau: "standard" };
    const { bareme } = versChangements([{ ...base, champ: "cout_revient", avant: 30, apres: 32 }, { ...base, champ: "taux_vente", avant: 50, apres: 55 }]);
    expect(bareme).toEqual([{ type: "taux", poste_id: "p1", niveau: "standard", cout_revient: 32, taux_vente: 55 }]);
  });
  it("date d'effet passée : refusée sauf admin avec confirmation", () => {
    expect(controlerDateEffet("2026-11-23", "2026-11-23", false, false)).toEqual({ ok: true, passe: false });
    expect(controlerDateEffet("2026-11-22", "2026-11-23", false, true).ok).toBe(false);
    expect(controlerDateEffet("2026-11-22", "2026-11-23", true, false).ok).toBe(false);
    expect(controlerDateEffet("2026-11-22", "2026-11-23", true, true)).toEqual({ ok: true, passe: true });
  });
  it("opp_plan_* et proba_* hors du tableur", () => {
    expect(estParametreHorsBareme("opp_plan_heures_semaine")).toBe(true);
    expect(estParametreHorsBareme("proba_envoye")).toBe(true);
    expect(estParametreHorsBareme("tva_pct")).toBe(false);
  });
});
