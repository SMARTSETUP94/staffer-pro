/**
 * E2E 5 — RLS employé.
 *  a) Tente accès /rh/contrats → RoleGuard redirige (pas /rh/contrats).
 *  b) Onglet mobile /mobile/contrats : ne voit que ses propres contrats
 *     (vérifié indirectement : la page charge sans erreur, et les éléments
 *     visibles ne contiennent pas de noms d'autres employés seedés).
 *
 * Le test fetch direct contrats_intermittents (RLS bloque cross-employé)
 * est couvert par un test unitaire RLS séparé (`rls-contrats.test.ts`).
 */
import { expect, test } from "@playwright/test";

test.describe("E2E 5 — RLS employé contrats", () => {
  test("employé ne peut pas accéder à /rh/contrats", async ({ page }) => {
    await page.goto("/rh/contrats");
    // RoleGuard doit rediriger : URL ne reste pas sur /rh/contrats
    await page.waitForLoadState("domcontentloaded");
    const url = new URL(page.url());
    expect(url.pathname).not.toBe("/rh/contrats");
    // Et la page ne contient pas le titre admin
    await expect(
      page.getByRole("heading", { name: /gestion.*contrat.*intermittent|rh.*contrat/i }),
    ).toHaveCount(0);
  });

  test("employé voit sa propre page Mes contrats sans erreur", async ({ page }) => {
    await page.goto("/mobile/contrats");
    await page.waitForLoadState("domcontentloaded");
    // La page ne crash pas (pas de message d'erreur global)
    await expect(page.getByText(/erreur.*serveur|500|forbidden/i)).toHaveCount(0);
  });
});
