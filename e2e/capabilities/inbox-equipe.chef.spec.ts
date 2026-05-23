/**
 * Lot 7.0c — Capabilities partagées — CHEF.
 *
 * Chef a inbox.view ET affaire.equipe.view → tout OK (cas succès).
 */
import { test, expect } from "@playwright/test";
import { visitAllowedRoutes } from "../helpers/role-smoke";

async function pickFirstAffaireId(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto("/affaires");
  const link = page.locator('a[href*="/affaires/"]').first();
  if (await link.count() === 0) return null;
  const href = await link.getAttribute("href");
  const m = href?.match(/\/affaires\/([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

test.describe("Lot 7.0c — Capabilities partagées (succès CHEF)", () => {
  test("chef accède à /inbox", async ({ page }) => {
    const errors = await visitAllowedRoutes(page, ["/inbox"] as const);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("chef accède à /affaires/$id/equipe", async ({ page }) => {
    const id = await pickFirstAffaireId(page);
    test.skip(!id, "Aucune affaire accessible au chef — test ignoré.");
    await page.goto(`/affaires/${id}/equipe`);
    expect(page.url()).toContain(`/affaires/${id}/equipe`);
  });
});
