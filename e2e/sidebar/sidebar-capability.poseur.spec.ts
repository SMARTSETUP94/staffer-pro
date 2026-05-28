/**
 * L5-B clôture — Sidebar capability-driven : rôle poseur (mobile).
 * Poseur voit Aujourd'hui + Mes missions pose + Mes équipes chantiers
 * + Mes heures + Mes contrats. Pas Pilotage/Production/Admin.
 *
 * Bonus : tente de naviguer depuis "Aujourd'hui" vers une carte mission pose
 * (/missions/$id/$phase). Si aucune mission seedée → on log et on ne
 * fait pas échouer (la sidebar reste la garantie minimale).
 */
import { test, expect } from "@playwright/test";

test("Poseur voit Mon poste complet, pas Pilotage/Production/Admin", async ({ page }) => {
  await page.goto("/");
  // Sur mobile, ouvrir le drawer si replié.
  const trigger = page.getByRole("button", { name: /toggle sidebar|menu/i }).first();
  if (await trigger.isVisible().catch(() => false)) {
    await trigger.click();
  }

  await expect(page.getByRole("link", { name: /Aujourd'hui/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Mes missions pose/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Mes équipes chantiers/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Mes heures/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Mes contrats/i }).first()).toBeVisible();

  // Anti-fuite : Pilotage / Production / Admin
  await expect(page.getByRole("link", { name: /Planning fab/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Pipeline opportunités/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Devis$/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Fabrication atelier/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Chantiers/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Feature flags/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Utilisateurs/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Hub RH/i })).toHaveCount(0);
});

test("Poseur : navigation depuis Aujourd'hui vers carte mission pose (best-effort)", async ({ page }) => {
  await page.goto("/");
  // Cherche un lien vers /missions/<id>/<phase>. Pattern poseur — carte de mission.
  const missionLink = page.locator('a[href^="/missions/"]').first();
  const found = await missionLink.isVisible().catch(() => false);
  if (!found) {
    test.info().annotations.push({
      type: "skip-reason",
      description: "Aucune mission seedée pour le poseur — vérifier seed E2E (dette tracée).",
    });
    return;
  }
  await missionLink.click();
  await expect(page).toHaveURL(/\/missions\/[^/]+\/[^/]+/);
});
