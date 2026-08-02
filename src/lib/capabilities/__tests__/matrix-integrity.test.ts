/**
 * L2 — Tests d'intégrité du catalogue capabilities.
 *
 * Vérifie que la définition figée (`catalog.ts`) reste cohérente :
 * - bon nombre total (79 caps)
 * - clés uniques
 * - chaque clé est une clé pointée valide
 * - labels non vides
 */
import { describe, it, expect } from "vitest";
import {
  ALL_CAPABILITY_KEYS,
  CAPABILITY_CATALOG,
} from "../catalog";

describe("CAPABILITY_CATALOG integrity", () => {
  it("contient exactement 79 capabilities", () => {
    expect(ALL_CAPABILITY_KEYS.length).toBe(79);
  });

  it("toutes les clés sont uniques", () => {
    const set = new Set(ALL_CAPABILITY_KEYS);
    expect(set.size).toBe(ALL_CAPABILITY_KEYS.length);
  });

  // Les clés suivent un espace de noms pointé (`section.x`, `objet.view`,
  // `opportunites.read.all`), pas systématiquement le nom du groupe UI.
  it("chaque clé est une clé pointée valide", () => {
    for (const caps of Object.values(CAPABILITY_CATALOG)) {
      for (const cap of caps) {
        expect(cap.key).toMatch(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/);
      }
    }
  });

  it("chaque capability a un libellé non vide", () => {
    for (const caps of Object.values(CAPABILITY_CATALOG)) {
      for (const cap of caps) {
        expect(cap.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("contient les capacités minimales attendues par rôle", () => {
    // Smoke-check : les caps que tout rôle doit pouvoir référencer
    const expected = [
      "section.inbox",
      "section.ma_semaine",
      "inbox.heures_saisir",
      "section.admin",
    ];
    for (const key of expected) {
      expect(ALL_CAPABILITY_KEYS).toContain(key);
    }
  });
});
