/**
 * Lot 7.0d — Capabilities RH — ADMIN.
 *
 * Admin a `rh.hub.view` → accès à /rh et /rh/contrats.
 */
import { test, expect } from "@playwright/test";
import { visitAllowedRoutes } from "../helpers/role-smoke";

test.describe("Lot 7.0d — Capabilities RH (succès ADMIN)", () => {
  test("admin accède à /rh et /rh/contrats", async ({ page }) => {
    const errors = await visitAllowedRoutes(page, ["/rh", "/rh/contrats"] as const);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
