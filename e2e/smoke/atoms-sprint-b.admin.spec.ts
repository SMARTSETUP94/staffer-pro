/**
 * Sprint B — Smoke E2E atomes (PhaseBadge, HeuresTriplet, RoleSwitcher).
 *
 * Valide :
 *   - la page démo /dev/atoms charge sans erreur
 *   - les 3 cartes atomes sont présentes et rendent leurs sous-éléments
 *   - aucune console.error
 */
import { test, expect } from "@playwright/test";

test.use({ storageState: "playwright/.auth/admin.json" });

test.describe("Atomes Sprint B — smoke", () => {
  test("PhaseBadge — 4 phases × 3 variantes rendues", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await page.goto("/dev/atoms");
    const card = page.getByTestId("atom-phase-badge");
    await expect(card).toBeVisible();
    await expect(card.getByText("Fabrication").first()).toBeVisible();
    await expect(card.getByText("Montage").first()).toBeVisible();
    await expect(card.getByText("Démontage").first()).toBeVisible();
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("HeuresTriplet — modes row/compact/card rendus", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await page.goto("/dev/atoms");
    const card = page.getByTestId("atom-heures-triplet");
    await expect(card).toBeVisible();
    // 120 (row) + 100 + 80 ; 1200 (card total) ; 100 (compact main)
    await expect(card.getByText("120").first()).toBeVisible();
    await expect(card.getByText("1200").first()).toBeVisible();
    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("RoleSwitcher — card monte sans crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await page.goto("/dev/atoms");
    const card = page.getByTestId("atom-role-switcher");
    await expect(card).toBeVisible();
    // RoleSwitcher peut être masqué si ≤1 rôle ; on ne force pas la présence
    // du bouton mais on garantit l'absence d'erreur console.
    expect(errors, errors.join("\n")).toHaveLength(0);
  });
});
