import { describe, expect, it } from "vitest";
import data from "./fixtures/progbat-3-devis.json";
import { calculerDevis, calculerRemise, type CalcHeure, type CalcLibre, type CalcLigne } from "../calcul";

// Métiers des postes (grille actuelle) pour les heures par métier.
const METIER: Record<string, number> = { suivi_projet: 8, plans_bem: 8, construction: 1, metallerie: 2, peinture: 3, cnc: 4, laser: 4, tapisserie: 5, montage: 6, logistique: 7 };

type L = { type: string; poste?: string; heures?: number; montant_force?: number; quantite?: number; prix_unitaire_vente?: number; heures_info?: number; poste_info?: string };
function construire(d: (typeof data)[number]) {
  const lignes: CalcLigne[] = [], heures: CalcHeure[] = [], libres: CalcLibre[] = [];
  let n = 0;
  const charger = (ligne_id: string, ls: L[]) => ls.forEach((l) => {
    if (l.type === "heures") heures.push({ ligne_id, heures: l.heures!, taux_vente: 0, montant_force: l.montant_force, par_unite: true, cout_revient: 0, metier_id: METIER[l.poste!] });
    else libres.push({ ligne_id, quantite: l.quantite!, prix_forfait: l.prix_unitaire_vente, coefficient: 1, par_unite: true, heures_info: l.heures_info || null, metier_info_id: l.poste_info ? METIER[l.poste_info] : null });
  });
  for (const ch of d.chapitres) {
    const id = `c${n++}`;
    const opt = ch.type === "option_incluse";
    lignes.push({ id, parent_id: null, type: opt ? "option" : ch.objets.length ? "zone" : "chapitre_pose", quantite: 1, option_incluse: opt });
    for (const ob of ch.objets) { const oid = `o${n++}`; lignes.push({ id: oid, parent_id: id, type: "objet", quantite: ob.quantite }); charger(oid, ob.lignes as L[]); }
    charger(id, ch.lignes as L[]);
  }
  return calculerDevis(lignes, heures, [], libres, 20, { mode: d.attendu.remise ? "montant" : "aucune", valeur: Math.abs(d.attendu.remise) });
}

describe("Devis ProGBat reconstruits à l'euro près", () => {
  for (const d of data) it(d.numero_progbat, () => {
    const r = construire(d);
    expect({ total_ht: r.total_ht, remise: r.remise, net_ht: r.net_ht, tva: r.tva, ttc: r.ttc }).toEqual(d.attendu);
  });
  it("54 h de montage saisies sur une ligne libre comptent dans les heures du métier montage", () => {
    expect(construire(data[1]).heures_metier["6"]).toBe(54);
  });
});

describe("Remise", () => {
  it("par total net souhaité : 19 765,02 → 19 600 donne 165,02", () => expect(calculerRemise(19765.02, { mode: "net_cible", valeur: 19600 })).toBe(165.02));
  it("en pourcentage : 10 % de 1 000 = 100", () => expect(calculerRemise(1000, { mode: "pct", valeur: 10 })).toBe(100));
  it("jamais supérieure au total", () => expect(calculerRemise(500, { mode: "montant", valeur: 900 })).toBe(500));
});

describe("Option", () => {
  it("non incluse par défaut : hors total", () => {
    const r = calculerDevis([{ id: "o", parent_id: null, type: "option", quantite: 1 }], [{ ligne_id: "o", heures: 12, taux_vente: 0, montant_force: 525, par_unite: true }], [], []);
    expect(r.total_ht).toBe(0); expect(r.options_ht).toBe(525);
  });
});
