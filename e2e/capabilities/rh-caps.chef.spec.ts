/**
 * Lot 7.0d — Capabilities RH — CHEF.
 *
 * Chef N'A PAS `rh.hub.view` → /rh/contrats doit être bloqué.
 * `requireCapability` court-circuite la route via redirect(/) avant le loader.
 */
import { test } from "@playwright/test";
import { assertForbiddenRoutes } from "../helpers/role-smoke";

test.describe("Lot 7.0d — Capabilities RH (CHEF interdit)", () => {
  test("chef est bloqué sur /rh/contrats (cap rh.hub.view manquante)", async ({ page }) => {
    await assertForbiddenRoutes(page, ["/rh/contrats"] as const);
  });
});
