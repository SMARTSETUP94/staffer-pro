/**
 * L4b — Sidebar unique capability-driven : rôle employé desktop.
 * Employé ne voit que Mon poste (Aujourd'hui, Ma semaine, Mes heures).
 * Pas de Devis, pas d'Admin, pas d'Équipes.
 */
import { test, expect } from "@playwright/test";

test("Employé desktop : sections restreintes", async ({ page }) => {
  await page.goto("/aujourdhui");
  await expect(page.getByRole("link", { name: /Aujourd'hui/i }).first()).toBeVisible();
  // Vérif anti-fuite : sections non autorisées invisibles
  await expect(page.getByRole("link", { name: /^Devis$/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Feature flags/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Fabrication atelier/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Utilisateurs/i })).toHaveCount(0);
});
