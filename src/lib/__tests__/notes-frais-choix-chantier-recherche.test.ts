/**
 * Garde-fou : le choix de chantier d'une note de frais doit rester cherchable
 * par mot-clé (n°, nom, client, lieu) via `AffaireCombobox`, et non revenir à
 * une liste déroulante simple où il faut faire défiler 500 chantiers.
 *
 * Si ce test casse : remplacer le sélecteur de chantier par un composant qui
 * filtre sur les mots-clés saisis (AffaireCombobox ou équivalent).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";

const DIALOG = "src/components/notes-frais/NoteFraisDialog.tsx";
const HOOK = "src/hooks/use-etapes-logistiques.ts";

describe("notes de frais — choix de chantier cherchable", () => {
  it("le dialogue utilise le combobox cherchable (AffaireCombobox)", () => {
    const src = fs.readFileSync(DIALOG, "utf8");
    expect(src).toContain("AffaireCombobox");
    // Interdit le retour à une liste <Select> alimentée par affaires.map
    expect(src).not.toMatch(/affaires\.map/);
  });

  it("la liste des chantiers expose client + lieu pour la recherche", () => {
    const src = fs.readFileSync(HOOK, "utf8");
    const fn = src.slice(src.indexOf("useAffairesPourLogistique"));
    const select = fn.slice(0, fn.indexOf(".is("));
    expect(select).toContain("client");
    expect(select).toContain("lieu");
  });
});
