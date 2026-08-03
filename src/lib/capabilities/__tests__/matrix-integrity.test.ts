/**
 * Tests d'intégrité du catalogue capabilities.
 *
 * Vérifie que la définition figée (`catalog.ts`) reste cohérente :
 * - bon nombre total (142 caps, miroir de la table `public.capabilities`)
 * - clés uniques
 * - chaque clé est une clé pointée valide
 * - labels non vides
 * - AUCUNE divergence avec la base quand celle-ci est joignable (psql)
 */
import { execFileSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { ALL_CAPABILITY_KEYS, CAPABILITY_CATALOG } from "../catalog";

/** Clés présentes en base, ou null si la base n'est pas joignable. */
function dbCapabilityKeys(): string[] | null {
  if (!process.env["PGHOST"]) return null;
  try {
    const out = execFileSync(
      "psql",
      ["-tAc", "select key from public.capabilities order by key"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const keys = out.trim().split("\n").filter(Boolean);
    return keys.length > 0 ? keys : null;
  } catch {
    return null;
  }
}

describe("CAPABILITY_CATALOG integrity", () => {
  it("contient exactement 142 capabilities", () => {
    expect(ALL_CAPABILITY_KEYS.length).toBe(142);
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
        expect(cap.key).toMatch(/^[a-z][a-z0-9_-]*(\.[a-z0-9_]+)+$/);
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
    const expected = [
      "section.inbox",
      "section.ma_semaine",
      "inbox.heures_saisir",
      "section.admin",
      "objet.view",
      "objet.edit",
      "objet.photo.upload",
      "objet.photo.delete",
    ];
    for (const key of expected) {
      expect(ALL_CAPABILITY_KEYS).toContain(key);
    }
  });

  it("ne diverge pas de la table public.capabilities", () => {
    const dbKeys = dbCapabilityKeys();
    if (!dbKeys) return; // base non joignable (CI front pur) → test neutre
    const catalog = [...ALL_CAPABILITY_KEYS].sort();
    expect(catalog).toEqual([...dbKeys].sort());
  });
});
