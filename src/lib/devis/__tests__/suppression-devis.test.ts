import { describe, expect, it } from "vitest";
import { devisSupprimable } from "@/components/devis/SupprimerDevis";

describe("suppression d'un devis", () => {
  it("autorisée pour un brouillon", () => expect(devisSupprimable("brouillon")).toBe(true));
  it("autorisée pour un devis à valider", () => expect(devisSupprimable("a_valider")).toBe(true));
  it.each(["valide", "transfere", "signe", "refuse"])("refusée pour le statut %s", (s) => expect(devisSupprimable(s)).toBe(false));
});
