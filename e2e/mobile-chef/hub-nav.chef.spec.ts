import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";

test.describe("Hub mobile chef — navigation 5 onglets", () => {
  test("chef accède au hub /mobile/chef et navigue entre les onglets", async ({ page }) => {
    await loginAs(page, "chef");
    await page.goto("/mobile/chef");
    await expect(page).toHaveURL(/\/mobile\/chef\/dashboard/);
    await expect(page.getByText(/Aujourd'hui/i).first()).toBeVisible();

    for (const [path, label] of [
      ["/mobile/chef/planning", /Mon planning équipe/i],
      ["/mobile/chef/equipe", /Mon équipe/i],
      ["/mobile/chef/contrats", /Mes contrats déclenchés/i],
    ] as const) {
      await page.goto(path);
      await expect(page.getByText(label).first()).toBeVisible({ timeout: 5_000 });
    }
  });
});
