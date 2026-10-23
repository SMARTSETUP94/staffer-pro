/**
 * Garde-fou : les onglets non déployés de la fiche chantier doivent rester
 * masqués ET inaccessibles par URL directe, sans que le code des pages soit
 * supprimé. Pour redéployer un onglet, on retire son suffixe de
 * `AFFAIRE_HIDDEN_TAB_SUFFIXES` — et ce test est mis à jour en même temps.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AFFAIRE_HIDDEN_TAB_SUFFIXES,
  affaireTabSuffix,
  isAffaireTabHidden,
} from "@/lib/affaire-tabs-visibility";

const HIDDEN = AFFAIRE_HIDDEN_TAB_SUFFIXES as readonly string[];

describe("onglets chantier masqués", () => {
  it("masque exactement les sept onglets non déployés", () => {
    expect([...HIDDEN].sort()).toEqual(
      [
        "casting",
        "devis",
        "equipe",
        "grille",
        "planning-atelier",
        "planning-chantier",
        "staffing",
      ].sort(),
    );
  });

  it("détecte les URL des onglets masqués", () => {
    for (const suffix of HIDDEN) {
      expect(isAffaireTabHidden(`/affaires/abc-123/${suffix}`)).toBe(true);
    }
  });

  it("laisse passer la synthèse et les onglets déployés", () => {
    expect(isAffaireTabHidden("/affaires/abc-123")).toBe(false);
    expect(affaireTabSuffix("/affaires/abc-123")).toBeNull();
    for (const suffix of ["documents", "journal", "logistique", "opportunite", "fabrication"]) {
      expect(isAffaireTabHidden(`/affaires/abc-123/${suffix}`)).toBe(false);
    }
  });

  it("ignore les sous-pages d'objet", () => {
    expect(isAffaireTabHidden("/affaires/abc-123/objets/def-456")).toBe(false);
    expect(affaireTabSuffix("/affaires/abc-123/objets/def-456")).toBe("objets");
  });

  it("la barre d'onglets applique le filtre et redirige l'URL directe", () => {
    const src = readFileSync("src/routes/_app.affaires.$affaireId.tsx", "utf8");
    expect(src).toContain("affaire-tabs-visibility");
    expect(src).toContain("allTabs.filter((t) => !isAffaireTabHidden(t.to))");
    expect(src).toContain("if (isAffaireTabHidden(path))");
  });
});
