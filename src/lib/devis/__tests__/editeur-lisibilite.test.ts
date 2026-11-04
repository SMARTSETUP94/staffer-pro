import { describe, expect, it } from "vitest";
import { ancrePoste, listeControle, pointsNote, pointsRestants } from "../editeur-lisibilite";

describe("note de Claude en points", () => {
  it("découpe par phrase et compte les points non barrés", () => {
    const p = pointsNote("Transcription du devis (11 997,32 € HT). Cotes du « 10 » à confirmer. Visuels à joindre.");
    expect(p).toEqual(["Transcription du devis (11 997,32 € HT).", "Cotes du « 10 » à confirmer.", "Visuels à joindre."]);
    expect(pointsRestants(p, ["Visuels à joindre."])).toBe(2);
  });
});

describe("liste de contrôle avant validation", () => {
  const base = { contactId: null, client: { adresse: "1 rue", siret: null }, dates: { date_montage: "2027-01-21" }, lignesZero: [{ ligneId: "l1", designation: "LED 2700 K" }], objetsSansPhoto: [{ ligneId: "o1", libelle: "Le 10" }], nbObjets: 1, coutsManquants: 2 };
  it("signale chaque point manquant sans bloquer", () => {
    const r = Object.fromEntries(listeControle(base).map((p) => [p.cle, p]));
    expect(r.contact.ok).toBe(false);
    expect(r.client.detail).toBe("manque SIRET");
    expect(r.dates.detail).toBe("manque début d'événement, démontage");
    expect(r.zero.cible).toEqual({ kind: "ligne", ligneId: "l1" });
    expect(r.photos.ok).toBe(false);
    expect(r.couts.ok).toBe(false);
  });
  it("masque le point coûts sans droit aux coûts", () => {
    expect(listeControle({ ...base, coutsManquants: null }).some((p) => p.cle === "couts")).toBe(false);
  });
});

describe("ancre poste", () => {
  it("est stable et sans accents", () => {
    expect(ancrePoste("Métallerie")).toBe("poste-metallerie");
  });
});

import { niveauPropose, estMasqueeZero } from "../editeur-lisibilite";
describe("ajout rapide et masquage à 0", () => {
  it("premier ajout d'un poste : niveau par défaut", () => expect(niveauPropose(["Confirmé", "Expert"], [])).toBeNull());
  it("poste déjà présent : propose le niveau non utilisé", () => expect(niveauPropose(["Confirmé", "Expert"], ["Confirmé"])).toBe("Expert"));
  it("ligne à 0 h masquée par défaut, visible si ajoutée pendant la session", () => {
    expect(estMasqueeZero(0, true, false)).toBe(true);
    expect(estMasqueeZero(0, true, true)).toBe(false);
    expect(estMasqueeZero(2, true, false)).toBe(false);
    expect(estMasqueeZero(0, false, false)).toBe(false);
  });
});
