import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

/**
 * v0.50 (L4c) — Vérifie que toutes les routes /mobile/* legacy redirigent
 * vers la route principale fusionnée. 14 stubs + 2 tests fonctionnels.
 */

const REDIRECTS: Array<[string, string]> = [
  ["/mobile/aujourdhui", "/aujourdhui"],
  ["/mobile/mes-missions", "/mes-missions"],
  ["/mobile/equipe-chantiers", "/mes-chantiers"],
  ["/mobile/absences", "/absences"],
  ["/mobile/chef/a-valider", "/aujourdhui"],
  ["/mobile/chef/affaires/00000000-0000-0000-0000-000000000000", "/affaires/00000000-0000-0000-0000-000000000000"],
  ["/mobile/chef/atelier", "/charge-atelier"],
  ["/mobile/chef/contrats", "/rh/contrats"],
  ["/mobile/chef/dashboard", "/aujourdhui"],
  ["/mobile/chef/equipe", "/employes"],
  ["/mobile/chef/", "/aujourdhui"],
  ["/mobile/chef/moi", "/aujourdhui"],
  ["/mobile/chef/planning", "/planning"],
  ["/mobile/contrats", "/mes-contrats"],
  ["/mobile/heures", "/mes-heures"],
  ["/mobile/profil", "/aujourdhui"],
  ["/mobile/propositions", "/mes-propositions"],
  ["/mobile/swaps", "/mes-swaps"],
];

test.describe("L4c — Redirects /mobile/* → main routes", () => {
  for (const [from, to] of REDIRECTS) {
    test(`redirect ${from} → ${to}`, async ({ page }) => {
      await loginAs(page, "admin");
      await page.goto(from);
      await page.waitForURL((url) => !url.pathname.startsWith("/mobile/"), { timeout: 10000 });
      expect(page.url()).toContain(to);
    });
  }

  test("fonctionnel — /mes-missions accessible employé desktop après redirect", async ({ page }) => {
    await loginAs(page, "employe-desktop");
    await page.goto("/mobile/mes-missions");
    await page.waitForURL("**/mes-missions", { timeout: 10000 });
    await expect(page).toHaveURL(/\/mes-missions$/);
  });

  test("fonctionnel — /mes-chantiers accessible employé desktop après redirect", async ({ page }) => {
    await loginAs(page, "employe-desktop");
    await page.goto("/mobile/equipe-chantiers");
    await page.waitForURL("**/mes-chantiers", { timeout: 10000 });
    await expect(page).toHaveURL(/\/mes-chantiers$/);
  });
});
