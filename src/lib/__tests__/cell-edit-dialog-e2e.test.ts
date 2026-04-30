/**
 * Tests E2E (scénario simulé) — v0.27
 *
 * Édition groupée d'une cellule du planning par objet (CellEditDialog) :
 *   1. Cellule de départ : 2 employés affectés sur OBJ-1 (jour J).
 *   2. Modification d'une heure (Alice 7 → 5).
 *   3. Suppression d'un employé (Bob).
 *   4. Ajout d'un nouvel employé (Chloé, 6h).
 *   5. Validation : plan de diff cohérent, projection budget objet OK,
 *      validation sans erreur, pas de doublon employé.
 *   6. Cas d'erreurs : heures hors bornes, doublon employé.
 */

import { describe, it, expect } from "vitest";
import {
  buildCellPlan,
  projectedObjetHeures,
  validateCell,
  validateBudgetObjet,
  employesDisponibles,
  type ExistingRow,
  type NewRow,
} from "../cell-edit-helpers";

const ALICE = "EMP-ALICE";
const BOB = "EMP-BOB";
const CHLOE = "EMP-CHLOE";
const DAVID = "EMP-DAVID";
const METIER_BOIS = 1;

function startingRows(): ExistingRow[] {
  return [
    {
      assignation_id: "ASG-1",
      employe_id: ALICE,
      metier_id: METIER_BOIS,
      heures: 7,
      initialHeures: 7,
    },
    {
      assignation_id: "ASG-2",
      employe_id: BOB,
      metier_id: METIER_BOIS,
      heures: 7,
      initialHeures: 7,
    },
  ];
}

describe("CellEditDialog — édition groupée (E2E)", () => {
  it("Étape 1 : cellule de départ — 2 employés, 14h totales", () => {
    const rows = startingRows();
    expect(rows).toHaveLength(2);
    expect(rows.reduce((s, r) => s + r.heures, 0)).toBe(14);
  });

  it("Étape 2 : modification heures Alice 7 → 5", () => {
    const rows = startingRows();
    rows[0].heures = 5;
    const plan = buildCellPlan(rows, []);
    expect(plan.toUpdate).toEqual([{ assignation_id: "ASG-1", heures: 5 }]);
    expect(plan.toDeleteIds).toEqual([]);
    expect(plan.toInsert).toEqual([]);
  });

  it("Étape 3 : suppression de Bob (toggle toDelete)", () => {
    const rows = startingRows();
    rows[1].toDelete = true;
    const plan = buildCellPlan(rows, []);
    expect(plan.toDeleteIds).toEqual(["ASG-2"]);
    expect(plan.toUpdate).toEqual([]);
  });

  it("Étape 4 : ajout de Chloé (6h)", () => {
    const rows = startingRows();
    const newRows: NewRow[] = [
      { tempId: "new-1", employe_id: CHLOE, metier_id: METIER_BOIS, heures: 6 },
    ];
    const plan = buildCellPlan(rows, newRows);
    expect(plan.toInsert).toEqual([
      { employe_id: CHLOE, metier_id: METIER_BOIS, heures: 6 },
    ]);
  });

  it("Étape 5 : scénario complet — modif + suppr + ajout en bloc", () => {
    const rows = startingRows();
    rows[0].heures = 5; // Alice 7→5
    rows[1].toDelete = true; // Bob supprimé
    const newRows: NewRow[] = [
      { tempId: "new-1", employe_id: CHLOE, metier_id: METIER_BOIS, heures: 6 },
    ];

    const plan = buildCellPlan(rows, newRows);
    expect(plan.toDeleteIds).toEqual(["ASG-2"]);
    expect(plan.toUpdate).toEqual([{ assignation_id: "ASG-1", heures: 5 }]);
    expect(plan.toInsert).toEqual([
      { employe_id: CHLOE, metier_id: METIER_BOIS, heures: 6 },
    ]);

    const validation = validateCell(rows, newRows);
    expect(validation.ok).toBe(true);

    // Avant : 14h sur l'objet (somme cellules) → après 5 (Alice) + 6 (Chloé) = 11h
    const apres = projectedObjetHeures(14, rows, newRows);
    expect(apres).toBe(11);
  });

  it("Projection budget objet — dépassement détecté", () => {
    const rows = startingRows();
    const newRows: NewRow[] = [
      { tempId: "new-1", employe_id: CHLOE, metier_id: METIER_BOIS, heures: 12 },
      { tempId: "new-2", employe_id: DAVID, metier_id: METIER_BOIS, heures: 10 },
    ];
    // Avant 14h sur objet, ajout 22h → 36h
    const apres = projectedObjetHeures(14, rows, newRows);
    expect(apres).toBe(36);
    // Si budget devisé = 30, dépassement = +6h
    const budget = 30;
    expect(apres - budget).toBe(6);
  });

  it("Validation — heures hors bornes refusées", () => {
    const rows = startingRows();
    rows[0].heures = 0; // invalide
    const newRows: NewRow[] = [
      { tempId: "new-1", employe_id: CHLOE, metier_id: METIER_BOIS, heures: 13 }, // invalide
    ];
    const v = validateCell(rows, newRows);
    expect(v.ok).toBe(false);
    expect(v.errors).toHaveLength(2);
  });

  it("Validation — doublon employé refusé (Alice présente + Alice ajoutée)", () => {
    const rows = startingRows();
    const newRows: NewRow[] = [
      { tempId: "new-1", employe_id: ALICE, metier_id: METIER_BOIS, heures: 4 },
    ];
    const v = validateCell(rows, newRows);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes("double"))).toBe(true);
  });

  it("Validation — réutiliser un employé supprimé est autorisé", () => {
    const rows = startingRows();
    rows[1].toDelete = true; // Bob supprimé
    const newRows: NewRow[] = [
      { tempId: "new-1", employe_id: BOB, metier_id: METIER_BOIS, heures: 4 },
    ];
    const v = validateCell(rows, newRows);
    expect(v.ok).toBe(true);
  });

  it("Liste employés disponibles — exclut ceux déjà présents et nouveaux", () => {
    const employes = [
      { id: ALICE },
      { id: BOB },
      { id: CHLOE },
      { id: DAVID },
    ];
    const rows = startingRows();
    const newRows: NewRow[] = [
      { tempId: "new-1", employe_id: CHLOE, metier_id: METIER_BOIS, heures: 6 },
    ];
    const dispo = employesDisponibles(employes, rows, newRows);
    expect(dispo.map((e) => e.id)).toEqual([DAVID]);
  });

  it("Liste employés disponibles — réinclut les employés marqués supprimés", () => {
    const employes = [{ id: ALICE }, { id: BOB }, { id: CHLOE }];
    const rows = startingRows();
    rows[1].toDelete = true; // Bob supprimé → redevient disponible
    const dispo = employesDisponibles(employes, rows, []);
    expect(dispo.map((e) => e.id).sort()).toEqual([BOB, CHLOE].sort());
  });

  it("Plan vide quand aucun changement — save no-op", () => {
    const rows = startingRows();
    const plan = buildCellPlan(rows, []);
    expect(plan.toDeleteIds).toEqual([]);
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toInsert).toEqual([]);
  });
});
