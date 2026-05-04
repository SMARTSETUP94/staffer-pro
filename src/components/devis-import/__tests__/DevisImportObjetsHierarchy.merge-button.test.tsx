/**
 * @vitest-environment happy-dom
 *
 * v0.39.1 — Tests d'accessibilité du bouton « Fusionner » dans la modale
 * d'import devis. Vérifie que le bouton est :
 *  - toujours rendu (pas d'apparition/disparition surprise au clic),
 *  - DÉSACTIVÉ (`disabled`) quand <2 objets sont sélectionnés dans la Section,
 *  - ACTIVÉ quand ≥2 objets de la même Section sont cochés,
 *  - porteur d'un `aria-label` explicite décrivant l'action et l'état.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { emptyHeures, computeFlagsFromMetiers } from "@/lib/devis-parser/compute-flags";
import { DevisImportObjetsHierarchy } from "../DevisImportObjetsHierarchy";
import type { EditableObjet } from "../objets-hierarchy-helpers";

function makeObjet(over: Partial<EditableObjet> = {}): EditableObjet {
  return {
    selected: true,
    numero: "1.1",
    sectionNumero: "1",
    sectionNom: "Section A",
    sectionQuantite: 1,
    nom: "Objet",
    description: null,
    quantite: 1,
    heures: emptyHeures(),
    budgetMateriaux: 0,
    typeFinition: "aucune",
    flags: computeFlagsFromMetiers(emptyHeures()),
    confidence: "high",
    warnings: [],
    postes: [],
    ...over,
  };
}

function renderHierarchy(objets: EditableObjet[]) {
  return render(
    <DevisImportObjetsHierarchy
      objets={objets}
      setObjets={() => {}}
      integrityChecks={[]}
    />,
  );
}

describe("DevisImportObjetsHierarchy — bouton Fusionner (a11y)", () => {
  beforeEach(() => {
    // section "1" rendue dépliée par défaut via état initial du composant
  });
  afterEach(() => cleanup());

  it("rend le bouton DÉSACTIVÉ quand aucun objet n'est sélectionné", () => {
    renderHierarchy([
      makeObjet({ numero: "1.1", selected: false }),
      makeObjet({ numero: "1.2", selected: false }),
    ]);
    const btn = screen.getByTestId("btn-merge-section-1");
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
    // libellé visible neutre (pas de compteur trompeur)
    expect(btn).toHaveTextContent(/^Fusionner$/);
    // aria-label explicite invitant à la sélection
    expect(btn).toHaveAccessibleName(/sélectionne au moins 2 objets/i);
  });

  it("rend le bouton DÉSACTIVÉ quand un seul objet est sélectionné", () => {
    renderHierarchy([
      makeObjet({ numero: "1.1", selected: true }),
      makeObjet({ numero: "1.2", selected: false }),
    ]);
    const btn = screen.getByTestId("btn-merge-section-1");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleName(/au moins 2 objets/i);
  });

  it("rend le bouton ACTIVÉ avec compteur quand ≥2 objets sont sélectionnés", () => {
    renderHierarchy([
      makeObjet({ numero: "1.1", selected: true }),
      makeObjet({ numero: "1.2", selected: true }),
      makeObjet({ numero: "1.3", selected: false }),
    ]);
    const btn = screen.getByTestId("btn-merge-section-1");
    expect(btn).toBeEnabled();
    // libellé visible enrichi du nombre
    expect(btn).toHaveTextContent("Fusionner (2)");
    // aria-label décrit précisément l'action
    expect(btn).toHaveAccessibleName(/Fusionner 2 objets sélectionnés de la section 1/i);
  });

  it("isole les sélections par Section : 2 cochés cross-section ⇒ chaque bouton DÉSACTIVÉ", () => {
    renderHierarchy([
      makeObjet({ numero: "1.1", sectionNumero: "1", sectionNom: "A", selected: true }),
      makeObjet({ numero: "2.1", sectionNumero: "2", sectionNom: "B", selected: true }),
    ]);
    const btnSec1 = screen.getByTestId("btn-merge-section-1");
    const btnSec2 = screen.getByTestId("btn-merge-section-2");
    expect(btnSec1).toBeDisabled();
    expect(btnSec2).toBeDisabled();
  });

  it("active uniquement le bouton de la Section où ≥2 objets sont cochés", () => {
    renderHierarchy([
      makeObjet({ numero: "1.1", sectionNumero: "1", sectionNom: "A", selected: true }),
      makeObjet({ numero: "1.2", sectionNumero: "1", sectionNom: "A", selected: true }),
      makeObjet({ numero: "2.1", sectionNumero: "2", sectionNom: "B", selected: true }),
    ]);
    expect(screen.getByTestId("btn-merge-section-1")).toBeEnabled();
    expect(screen.getByTestId("btn-merge-section-2")).toBeDisabled();
  });

  it("le bouton désactivé n'a pas d'icône-only piégeuse : le texte 'Fusionner' reste lisible", () => {
    renderHierarchy([makeObjet({ numero: "1.1", selected: false })]);
    const btn = screen.getByTestId("btn-merge-section-1");
    // visible name = texte accessible (jamais vide)
    expect(btn).toHaveAccessibleName();
    expect(btn.textContent?.trim()).toBe("Fusionner");
  });
});
