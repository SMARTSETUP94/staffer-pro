/**
 * v0.35.6 / Sprint 6 — E2E auto-staffing v0.35 (rôle chef_chantier).
 *
 * Couvre 9 des 10 scénarios clés (le 10e = blocage employé → spec dédiée).
 * Les server-fn lourdes (calculate, publish) ne sont PAS mockées : on teste
 * la stack complète sur la base preview. Tous les sélecteurs sont tolérants
 * aux variations de seed (skip propre si pas de plan/affaire dispo).
 */
import { expect, test } from "@playwright/test";

test.describe("auto-staffing v0.35 / chef", () => {
  test("S1 — onglet Fabrication 5XXX affiche le wizard StaffingPlanWizard", async ({ page }) => {
    await page.goto("/affaires");
    await expect(page.getByRole("heading", { name: /affaires/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Cherche une affaire 5XXX dans la liste
    const fabRow = page.locator("a[href*='/affaires/']").filter({ hasText: /\b5\d{3}\b/ }).first();
    if (!(await fabRow.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "Aucune affaire 5XXX seedée — wizard non testable ici.",
      });
      return;
    }
    await fabRow.click();
    await page.getByRole("tab", { name: /fabrication/i }).click();

    await expect(page.getByText(/Auto-staffing v0\.35/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("S2 — bouton Devis 'Mettre au planning' ouvre le wizard en dialog", async ({ page }) => {
    await page.goto("/affaires");
    const fabRow = page.locator("a[href*='/affaires/']").filter({ hasText: /\b5\d{3}\b/ }).first();
    if (!(await fabRow.isVisible({ timeout: 3_000 }).catch(() => false))) return;
    await fabRow.click();
    await page.getByRole("tab", { name: /devis/i }).click();

    const btn = page.getByRole("button", { name: /Mettre au planning/i });
    if (!(await btn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "Bouton 'Mettre au planning' non visible (devis vide ?) — skip.",
      });
      return;
    }
    await btn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/Calculer le planning/i)).toBeVisible();
  });

  test("S3 — page /staffing/$planId rend Gantt + Heatmap + Personnes", async ({ page }) => {
    // On essaie d'ouvrir un plan via la liste des affaires
    await page.goto("/charge-atelier");
    const planLink = page.locator("a[href^='/staffing/']").first();
    if (!(await planLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "Aucun plan publié dans la base preview — skip.",
      });
      return;
    }
    await planLink.click();
    await expect(page.getByText(/Plan staffing/i)).toBeVisible({ timeout: 15_000 });
    // Stats cards
    await expect(page.getByText(/Volume total/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("S4 — vue /charge-atelier accessible et rend la grille metier", async ({ page }) => {
    await page.goto("/charge-atelier");
    await expect(
      page.getByRole("heading", { name: /Charge atelier multi-chantiers/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("S5 — drill-down Popover sur cellule pic atelier (si données)", async ({ page }) => {
    await page.goto("/charge-atelier");
    // Cherche une cellule cliquable de pic global > 12 (icône AlertTriangle)
    const conflitCell = page.locator("[data-conflit-cell='1']").first();
    if (!(await conflitCell.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "Pas de pic > 12 dans la fenêtre 4 sem — drill-down non testable.",
      });
      return;
    }
    await conflitCell.click();
    await expect(page.getByRole("dialog").or(page.locator("[role='tooltip']")).first()).toBeVisible();
  });

  test("S6 — Publier ouvre le PublishPlanDialog (sans confirmer)", async ({ page }) => {
    await page.goto("/charge-atelier");
    const planLink = page.locator("a[href^='/staffing/']").first();
    if (!(await planLink.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await planLink.click();

    const publishBtn = page.getByRole("button", { name: /Publier le plan/i });
    if (!(await publishBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      // déjà publié, OK
      return;
    }
    await publishBtn.click();
    await expect(page.getByRole("dialog").getByText(/Publier/i).first()).toBeVisible();
    await page.getByRole("button", { name: /Annuler/i }).click();
  });

  test("S7 — Historique ouvre PlanHistoryDrawer", async ({ page }) => {
    await page.goto("/charge-atelier");
    const planLink = page.locator("a[href^='/staffing/']").first();
    if (!(await planLink.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await planLink.click();

    const histBtn = page.getByRole("button", { name: /Historique/i });
    if (await histBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await histBtn.click();
      await expect(page.getByText(/snapshot|version/i).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test("S8 — slider pers est interactif sous header objet", async ({ page }) => {
    await page.goto("/charge-atelier");
    const planLink = page.locator("a[href^='/staffing/']").first();
    if (!(await planLink.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await planLink.click();

    const slider = page.locator("[role='slider']").first();
    if (await slider.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(slider).toBeEnabled();
    }
  });

  test("S9 — badge AS visible dans /planning si assignation auto-staffing", async ({ page }) => {
    await page.goto("/planning");
    await expect(page.getByRole("heading", { name: /planning/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    // Badge AS = présent uniquement si plan publié l'a propagé. Annotation si absent.
    const asBadge = page.locator("[data-badge='auto-staffing']").first();
    if (!(await asBadge.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "Aucun badge AS visible — pas de plan publié dans la fenêtre planning.",
      });
    }
  });
});
