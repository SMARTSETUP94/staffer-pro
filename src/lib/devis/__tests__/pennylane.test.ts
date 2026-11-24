import { describe, expect, it } from "vitest";
import { avecOptionsRetenues, codeTva, construirePennylane, controleTotal, optionsDuDevis, rapprocherClients, type DonneesPennylane } from "../pennylane";
import type { LigneClient } from "../pdf-client";

const L = (p: Partial<LigneClient> & { id: string; type: string }): LigneClient => ({ parent_id: null, ordre: 1, libelle: p.id, quantite: 1, descriptif_client: null, longueur_mm: null, largeur_mm: null, hauteur_mm: null, finition: null, texte: null, montant: 0, sous_total: null, ...p });
const devis = (): DonneesPennylane => ({
  numero: "9524-R1", version: 1, libelle: "Stand", date_devis: "2026-11-20", validite_jours: 30, date_validite: "2026-12-20",
  client: null, client_final: null, contact: null, dates: null, photos: [], total_ht: 1000, tva: 200, tva_pct: 20, ttc: 1200,
  remise_mode: "aucune", remise_valeur: null,
  lignes: [
    L({ id: "z", type: "zone", libelle: "Socle", ordre: 1 }),
    L({ id: "o1", type: "objet", parent_id: "z", montant: 1000, libelle: "Table" }),
    L({ id: "opt1", type: "option", ordre: 2, libelle: "Proposition 1" }),
    L({ id: "a", type: "objet", parent_id: "opt1", montant: 300 }),
    L({ id: "b", type: "objet", parent_id: "opt1", montant: 200.5 }),
    L({ id: "opt2", type: "option", ordre: 3, libelle: "Proposition 2", montant: 400 }),
  ],
});

describe("transfert Pennylane", () => {
  it("prix d'une option = montant propre + objets", () => {
    expect(optionsDuDevis(devis()).map((o) => o.montant)).toEqual([500.5, 400]);
  });
  it("option retenue comprise, non retenue retirée du total", () => {
    const d = avecOptionsRetenues(devis(), new Set(["opt1"]));
    expect(d.total_ht).toBe(1500.5);
    expect(d.lignes.some((l) => l.id === "opt2")).toBe(false);
    expect(d.ttc).toBe(1800.6);
  });
  it("sans option retenue, total HT inchangé", () => {
    expect(avecOptionsRetenues(devis(), new Set()).total_ht).toBe(1000);
  });
  it("remise en % recalculée sur le total avec options", () => {
    const d = avecOptionsRetenues({ ...devis(), remise_mode: "pct", remise_valeur: 10 }, new Set(["opt2"]));
    expect(d.total_ht).toBe(1400);
    expect(d.net_ht).toBe(1260);
  });
  it("charge utile : référence Staffing, TVA FR_200, lignes = total, remise en discount", () => {
    const { payload, attendu } = construirePennylane({ ...devis(), remise_mode: "montant", remise_valeur: 50 }, new Set(["opt1"]), { customerId: 42, reference: "9524-R1" });
    expect(payload.external_reference).toBe("9524-R1");
    expect(payload.customer_id).toBe(42);
    expect(payload.deadline).toBe("2026-12-20");
    expect(payload.invoice_lines.every((l) => l.vat_rate === "FR_200")).toBe(true);
    expect(attendu.somme_lignes).toBe(1500.5);
    expect(payload.discount).toEqual({ type: "absolute", value: "50.00" });
    expect(attendu.net_ht).toBe(1450.5);
    expect(JSON.stringify(payload)).not.toContain("Proposition 2");
  });
  it("taux de TVA inconnu refusé", () => {
    expect(codeTva(20)).toBe("FR_200");
    expect(codeTva(7)).toBeNull();
  });
  it("contrôle du total au centime", () => {
    expect(controleTotal(6563.05, "6563.05").ok).toBe(true);
    expect(controleTotal(6563.05, "6563.04")).toEqual({ ok: false, ecart: -0.01, lu: 6563.04 });
    expect(controleTotal(10, null).ok).toBe(false);
  });
  it("rapprochement : SIRET puis TVA puis nom ; nom seul jamais sûr", () => {
    const pl = [
      { id: "1", name: "ACME", reg_no: "81234567800012", vat_number: null },
      { id: "2", name: "Studio Nord SARL", reg_no: null, vat_number: "FR12345678901" },
      { id: "3", name: "Galerie B", reg_no: null, vat_number: null },
    ];
    const r = rapprocherClients([
      { id: "a", nom: "Acme SAS", siret: "812 345 678 00012", tva_intracom: null, pennylane_id: null },
      { id: "b", nom: "Studio N", siret: null, tva_intracom: "FR 12 345678901", pennylane_id: null },
      { id: "c", nom: "Galerie B.", siret: null, tva_intracom: null, pennylane_id: null },
      { id: "d", nom: "Inconnu", siret: null, tva_intracom: null, pennylane_id: null },
    ], pl);
    expect(r.map((x) => [x.statut, x.candidats[0]?.id])).toEqual([["sur", "1"], ["sur", "2"], ["douteux", "3"], ["aucun", undefined]]);
  });
});
