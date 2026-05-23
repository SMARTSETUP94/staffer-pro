/**
 * Lot 7.0c — Capability gating : routes partagées (inbox + équipe affaire) — ADMIN.
 *
 * Routes :
 *  - /inbox                      (cap inbox.view)
 *  - /affaires/$id/equipe        (cap affaire.equipe.view)
 *
 * L'admin a les 2 caps → accès OK.
 * Pour /affaires/$id/equipe on récupère un id réel via la liste /affaires.
 */
import { test, expect } from "@playwright/test";
import { visitAllowedRoutes } from "../helpers/role-smoke";

async function pickFirstAffaireId(page: import("@playwright/test").Page): Promise<string | null> {
  await page.goto("/affaires");
  // Match un lien vers /affaires/<uuid>
  const link = page.locator('a[href*="/affaires/"]').first();
  if (await link.count() === 0) return null;
  const href = await link.getAttribute("href");
  const m = href?.match(/\/affaires\/([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

test.describe("Lot 7.0c — Capabilities partagées (succès ADMIN)", () => {
  test("admin accède à /inbox", async ({ page }) => {
    const errors = await visitAllowedRoutes(page, ["/inbox"] as const);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("admin accède à /affaires/$id/equipe et voit l'onglet Équipe", async ({ page }) => {
    const id = await pickFirstAffaireId(page);
    test.skip(!id, "Aucune affaire seedée — test ignoré.");
    await page.goto(`/affaires/${id}/equipe`);
    expect(page.url()).toContain(`/affaires/${id}/equipe`);
    // Onglet Équipe visible dans la nav de la fiche affaire.
    await expect(
      page.getByRole("tab", { name: /équipe/i }).or(
        page.getByRole("link", { name: /équipe/i }),
      ).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
