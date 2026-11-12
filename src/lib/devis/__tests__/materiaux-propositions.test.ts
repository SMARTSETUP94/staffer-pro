import { describe, expect, it } from "vitest";
import { dedoublonnerReprise, erreurValidation, estChoixRequis, payloadValidation, peutProposer, type ValidationForm } from "../materiaux-propositions";

const f = (o: Partial<ValidationForm> = {}): ValidationForm => ({ fournisseur_id: "", nouveau_fournisseur: "", produit: "Médium 19", ref: "", unite: "m2", prix_achat: "12,5", date_tarif: "", mode: "", ...o });

describe("prix proposés au catalogue", () => {
  it("une ligne hors catalogue sans proposition peut être proposée", () => {
    expect(peutProposer({ materiau_id: null }, undefined, false)).toBe(true);
  });
  it("une ligne déjà proposée (même refusée) ne peut pas l'être deux fois", () => {
    expect(peutProposer({ materiau_id: null }, "propose", false)).toBe(false);
    expect(peutProposer({ materiau_id: null }, "refuse", false)).toBe(false);
  });
  it("une ligne venant du catalogue ne se propose pas", () => {
    expect(peutProposer({ materiau_id: "x" }, undefined, false)).toBe(false);
  });
  it("validation refusée sans fournisseur", () => {
    expect(erreurValidation(f(), true, null)).toMatch(/fournisseur/);
  });
  it("validation refusée avec un prix à 0", () => {
    expect(erreurValidation(f({ fournisseur_id: "a", prix_achat: "0" }), true, null)).toMatch(/supérieur à 0/);
  });
  it("validation acceptée avec un nouveau fournisseur et un prix", () => {
    expect(erreurValidation(f({ nouveau_fournisseur: "Bois & Co" }), true, null)).toBeNull();
  });
  it("le nouveau fournisseur l'emporte sur la liste et le choix remplacer est transmis", () => {
    const p = payloadValidation(f({ fournisseur_id: "a", nouveau_fournisseur: "Neuf", mode: "remplacer" }), true);
    expect(p.nouveau_fournisseur).toBe("Neuf");
    expect(p.fournisseur_id).toBeUndefined();
    expect(p.mode).toBe("remplacer");
    expect(p.prix_achat).toBe("12.5");
  });
  it("sans droit aux coûts, aucun prix n'est envoyé", () => {
    expect(payloadValidation(f({ fournisseur_id: "a" }), false).prix_achat).toBeUndefined();
  });
  it("détecte le choix remplacer/ajouter exigé par la base", () => {
    expect(estChoixRequis("CHOIX_REQUIS: une ligne active a déjà ce fournisseur")).toBe(true);
    expect(estChoixRequis("autre")).toBe(false);
  });
  it("la reprise garde le prix le plus récent par fournisseur et désignation, et ignore les déjà proposés", () => {
    const r = dedoublonnerReprise([
      { fournisseur: "Leroy", designation: "Vis 4x40", created_at: "2026-01-01", prix: 1 },
      { fournisseur: "leroy ", designation: "vis  4x40", created_at: "2026-03-01", prix: 2 },
      { fournisseur: "Brico", designation: "Colle", created_at: "2026-02-01", prix: 3 },
    ], new Set(["brico|colle"]));
    expect(r).toHaveLength(1);
    expect(r[0].prix).toBe(2);
  });
});
