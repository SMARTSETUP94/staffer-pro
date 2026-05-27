/**
 * L4b — Sidebar unique capability-driven : rôle admin.
 *
 * Admin a toutes les caps → toutes les sections visibles.
 * "Aujourd'hui" toujours visible.
 */
import { test, expect } from "@playwright/test";

test("Admin voit toutes les sections + Aujourd'hui", async ({ page }) => {
  await page.goto("/aujourdhui");
  await expect(page.getByRole("link", { name: /Aujourd'hui/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^Devis$/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Chantiers/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Utilisateurs/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Feature flags/i }).first()).toBeVisible();
});

test("Drawer s'ouvre sur viewport mobile (admin)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/aujourdhui");
  // Sidebar shadcn collapse en offcanvas sur mobile → trigger visible
  const trigger = page.getByRole("button", { name: /toggle sidebar|menu/i }).first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole("link", { name: /^Devis$/i }).first()).toBeVisible();
});
