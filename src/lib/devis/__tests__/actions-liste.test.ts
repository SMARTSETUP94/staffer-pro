import { describe, expect, it } from "vitest";
import { actionsStatutListe } from "../actions-liste";

describe("Actions rapides de la liste des devis", () => {
  it("ne propose aucune transition à un lecteur", () => {
    expect(actionsStatutListe("valide", false, false, null, null)).toEqual([]);
  });
  it("réserve la finalisation au validateur", () => {
    expect(actionsStatutListe("brouillon", true, false, null, null)).toEqual(["a_valider"]);
    expect(actionsStatutListe("brouillon", true, true, null, null)).toEqual(["a_valider", "valide"]);
  });
  it("propose transfert et signature seulement après finalisation", () => {
    expect(actionsStatutListe("valide", true, true, null, null)).toEqual(["envoye", "transfere", "signe", "refuse", "revision"]);
  });
  it("ne renvoie pas une version signée ou remplacée en brouillon", () => {
    expect(actionsStatutListe("signe", true, true, null, null)).toEqual(["revision"]);
    expect(actionsStatutListe("remplace", true, true, null, null)).toEqual(["revision"]);
  });
  it("garde l'envoi distinct du transfert déjà envoyé", () => {
    expect(actionsStatutListe("transfere", true, true, "D-202611-0012", "2026-11-25")).toEqual(["signe", "refuse", "revision"]);
  });
});