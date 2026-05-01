/**
 * v0.34 — E2E mobile employé : saisie hors planning (v0.32.3).
 *
 * Vérifie que l'employé peut :
 * 1. Ouvrir la modale "+ Autre chantier" depuis /mobile/heures
 * 2. Sélectionner une affaire + un métier + des heures
 * 3. Voir la saisie apparaître avec le badge "Hors planning"
 * 4. Supprimer la saisie via Trash (tant que brouillon)
 */
import { test, expect } from "@playwright/test";

test("employé peut ajouter et supprimer une saisie hors planning", async ({ page }) => {
  await page.goto("/mobile/heures");
  await expect(page.getByRole("heading", { name: /Saisie & soumission/i })).toBeVisible();

  // Ouvrir la modale
  await page.getByTestId("btn-add-hors-planning").first().click();
  await expect(page.getByRole("heading", { name: /Saisir des heures hors planning/i })).toBeVisible();

  // Sélectionner une affaire (premier item du combobox)
  await page.getByRole("combobox").first().click();
  await page.getByRole("option").first().click();

  // Sélectionner un métier
  await page.getByTestId("select-metier-hors-planning").click();
  await page.getByRole("option").first().click();

  // Heures déjà à 8 par défaut → submit
  await page.getByTestId("btn-submit-hors-planning").click();

  // Badge visible
  const badge = page.getByTestId("badge-hors-planning").first();
  await expect(badge).toBeVisible({ timeout: 10_000 });

  // Trash visible (brouillon)
  const trash = page.getByTestId("btn-delete-hors-planning").first();
  await expect(trash).toBeVisible();
  await trash.click();
  await page.getByRole("button", { name: /^Supprimer$/ }).click();

  // Le badge doit disparaître
  await expect(badge).toHaveCount(0, { timeout: 10_000 });
});
