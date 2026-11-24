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

import fixture9524 from "./fixtures/9524-R1-pennylane.json";
describe("Pennylane — 9524-R1 avec O2 retenue (données réelles, lecture seule)", () => {
  const v = fixture9524 as unknown as DonneesPennylane;
  const O2 = "34f64269-4ad1-48ec-9a5a-f1d66837c2ea";
  const { payload, attendu } = construirePennylane(v, new Set([O2]), { customerId: 1, reference: "9524-R1" });
  const somme = (ls: typeof payload.invoice_lines) => Math.round(ls.reduce((s, l) => s + l.quantity * Number(l.raw_currency_unit_price) * 100, 0)) / 100;
  it("total HT = 6 563,05 + 17 295,97 = 23 859,02 € au centime", () => {
    expect(attendu.total_ht).toBe(23859.02);
    expect(attendu.somme_lignes).toBe(23859.02);
    expect(somme(payload.invoice_lines)).toBe(23859.02);
    expect(attendu.controle_lignes).toBe(true);
  });
  it("une section dédiée à O2 dont les lignes totalisent 17 295,97 €", () => {
    const s = payload.invoice_line_sections.filter((x) => x.title.includes("Option : Proposition 2"));
    expect(s).toHaveLength(1);
    expect(somme(payload.invoice_lines.filter((l) => l.section_rank === s[0]!.rank))).toBe(17295.97);
    expect(payload.invoice_line_sections.some((x) => /Proposition [134]/.test(x.title))).toBe(false);
  });
  it("aucune remise, unités traduites, TVA FR_200", () => {
    expect(payload.discount).toBeUndefined();
    expect(payload.invoice_lines.every((l) => l.vat_rate === "FR_200" && ["piece", "forfait"].includes(l.unit))).toBe(true);
  });
  it("sans option retenue : 6 563,05 €", () => {
    expect(construirePennylane(v, new Set(), { customerId: 1, reference: "9524-R1" }).attendu.total_ht).toBe(6563.05);
  });
});
