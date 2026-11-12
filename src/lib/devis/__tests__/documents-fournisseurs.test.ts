import { describe, expect, it } from "vitest";
import {
  analyserChemin, candidatMiseAJour, ecartPct, estLigneFrais, peutDeposer, prixProposable, separerLignes,
  trouverFournisseur, typeReel, TAILLE_MAX_DOCUMENT,
} from "../documents-fournisseurs";
import { erreurValidation, payloadValidation, type ValidationForm } from "../materiaux-propositions";

const U = "8f0c6a7e-1b2c-4d5e-8f90-123456789abc";
const H = "a".repeat(64);
const richardson = [
  { ref: "369D7", produit: "PLAQUE FOAMALUX PREMIUM BLANC 15X3050X1560", format_texte: "15X3050X1560", quantite: 20, unite: "U", prix_net_ht: 110.68, est_frais: false },
  { ref: null, produit: "Frais fixes", format_texte: null, quantite: 1, unite: null, prix_net_ht: 1.5, est_frais: false },
  { ref: null, produit: "Livraison", format_texte: null, quantite: 1, unite: null, prix_net_ht: 45, est_frais: true },
];

describe("extraction Richardson : frais écartés", () => {
  it("garde la plaque 369D7 à 110,68 et écarte frais fixes et livraison", () => {
    const { materiaux, ecartees } = separerLignes(richardson);
    expect(materiaux.map((m) => [m.ref, m.prix_net_ht])).toEqual([["369D7", 110.68]]);
    expect(ecartees).toEqual([{ produit: "Frais fixes", montant: 1.5 }, { produit: "Livraison", montant: 45 }]);
  });
  it("reconnaît les frais même sans signal de la lecture", () => {
    expect(estLigneFrais("Frais de port")).toBe(true);
    expect(estLigneFrais("Éco-participation")).toBe(true);
    expect(estLigneFrais("Plaque Dibond 3mm")).toBe(false);
  });
});

describe("rapprochement", () => {
  it("écart Richardson 147,58 → 110,68 = -25 %", () => expect(ecartPct(147.58, 110.68)).toBe(-25));
  it("retrouve le fournisseur Richardson dans « RICHARDSON PLASTIQUES »", () => {
    const f = [{ id: "1", nom: "Richardson" }, { id: "2", nom: "Dispano" }];
    expect(trouverFournisseur("RICHARDSON PLASTIQUES", f)?.id).toBe("1");
    expect(trouverFournisseur("Inconnu SAS", f)).toBeNull();
  });
});

describe("fichier", () => {
  it("type réel par les premiers octets, 10 Mo maximum", () => {
    expect(typeReel(new TextEncoder().encode("%PDF-1.7"))?.ext).toBe("pdf");
    expect(typeReel(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(typeReel(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe("png");
    expect(typeReel(new TextEncoder().encode("<html>"))).toBeNull();
    expect(TAILLE_MAX_DOCUMENT).toBe(10 * 1024 * 1024);
  });
  it("le chemin doit commencer par l'utilisateur connecté", () => {
    expect(analyserChemin(`${U}/${H}.pdf`, U)?.empreinte).toBe(H);
    expect(analyserChemin(`${U.replace("8", "9")}/${H}.pdf`, U)).toBeNull();
    expect(analyserChemin(`${U}/../${H}.pdf`, U)).toBeNull();
  });
});

describe("prix ponctuel", () => {
  it("expiré : absent de la recherche ; encore valide : présent", () => {
    expect(prixProposable({ type_prix: "ponctuel", valide_jusquau: "2026-11-11" }, "2026-11-12")).toBe(false);
    expect(prixProposable({ type_prix: "ponctuel", valide_jusquau: "2026-12-12" }, "2026-11-12")).toBe(true);
    expect(prixProposable({ type_prix: "reference", valide_jusquau: null }, "2026-11-12")).toBe(true);
  });
  it("jamais candidat à la mise à jour des autres devis, même valide", () => {
    expect(candidatMiseAJour({ type_prix: "ponctuel", actif: true })).toBe(false);
    expect(candidatMiseAJour({ type_prix: "reference", actif: true })).toBe(true);
  });
  it("validation ponctuelle : date obligatoire, et jamais de mode remplacer", () => {
    const f: ValidationForm = { fournisseur_id: "x", nouveau_fournisseur: "", produit: "P", ref: "369D7", unite: "U", prix_achat: "110,68", date_tarif: "", mode: "remplacer", type_prix: "ponctuel", valide_jusquau: "" };
    expect(erreurValidation(f, true, null)).toMatch(/valable/);
    const p = payloadValidation({ ...f, valide_jusquau: "2099-12-12" }, true);
    expect(p.type_prix).toBe("ponctuel");
    expect(p.mode).toBeUndefined();
  });
});

describe("droits de dépôt", () => {
  it("admin, ou rédacteur avec accès aux coûts", () => {
    expect(peutDeposer({ admin: true, rediger: false, couts: false })).toBe(true);
    expect(peutDeposer({ admin: false, rediger: true, couts: true })).toBe(true);
    expect(peutDeposer({ admin: false, rediger: true, couts: false })).toBe(false);
    expect(peutDeposer({ admin: false, rediger: false, couts: true })).toBe(false);
  });
});
