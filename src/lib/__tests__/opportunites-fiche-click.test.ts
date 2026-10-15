/**
 * v0.50 — Garde-fou : dans le tableur du pipeline, un clic sur la ligne ouvre la
 * fiche opportunité, SAUF si la cible est un champ éditable encore actif (sinon
 * on ne pourrait plus saisir de valeur). Les champs désactivés (lecture seule)
 * sont considérés comme des zones mortes → le clic ouvre la fiche.
 */
import { describe, it, expect } from "vitest";
import {
  TABLEUR_EDITABLE_SELECTOR,
  isTableurEditableTarget,
} from "@/lib/opportunites-tableur-helpers";

/** Faux Element : `closest` renvoie le contrôle « trouvé » (ou null). */
function fakeEl(hit: { disabled?: boolean } | null) {
  return { closest: (_selector: string) => hit };
}

describe("isTableurEditableTarget — clic ligne tableur vs fiche opportunité", () => {
  it("protège les champs éditables actifs (aucune navigation)", () => {
    expect(isTableurEditableTarget(fakeEl({ disabled: false }))).toBe(true);
  });

  it("laisse passer le clic sur un champ désactivé (lecture seule → ouvre la fiche)", () => {
    expect(isTableurEditableTarget(fakeEl({ disabled: true }))).toBe(false);
  });

  it("laisse passer le clic sur une zone morte de la ligne (aucun contrôle)", () => {
    expect(isTableurEditableTarget(fakeEl(null))).toBe(false);
  });

  it("ne navigue pas quand la cible n'est pas un élément (cible inconnue)", () => {
    expect(isTableurEditableTarget(null)).toBe(true);
    expect(isTableurEditableTarget(undefined)).toBe(true);
    expect(isTableurEditableTarget({})).toBe(true);
    expect(isTableurEditableTarget("text")).toBe(true);
  });

  it("couvre tous les contrôles de saisie du tableur", () => {
    for (const control of ["input", "textarea", "select", "button", "a"]) {
      expect(TABLEUR_EDITABLE_SELECTOR).toContain(control);
    }
  });
});
