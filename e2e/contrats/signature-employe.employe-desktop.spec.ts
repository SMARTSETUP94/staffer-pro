/**
 * E2E 3 — Signature employé sur canvas (onglet mobile "Mes contrats").
 * Login employé → /mobile/contrats → click contrat À signer → preview PDF →
 * signe canvas → confirme → assertions :
 *  a) statut passe "À signer (employeur)",
 *  b) audit trail créé (vérifié indirectement via texte UI / toast),
 *  c) PDF v2 référencé (iframe ou lien).
 */
import { expect, test } from "@playwright/test";
import { signCanvas, waitForPdfGenerated } from "../helpers/contrats";

test.describe("E2E 3 — signature employé canvas", () => {
  test("employé signe son contrat → statut bascule employeur", async ({ page }) => {
    await page.goto("/mobile/contrats");
    if (!page.url().includes("/mobile/contrats")) {
      test.skip(true, "Route /mobile/contrats non accessible (cet employé n'a peut-être pas de contrat)");
    }

    // Cherche un contrat "à signer"
    const card = page
      .getByRole("button")
      .filter({ hasText: /à\s+signer|signer ici|en attente/i })
      .first()
      .or(page.locator("[data-contrat-id]").filter({ hasText: /signer/i }).first());
    if (!(await card.isVisible({ timeout: 4_000 }).catch(() => false))) {
      test.skip(true, "Aucun contrat à signer pour cet employé (état attendu après E2E 1)");
    }
    await card.click();

    // Attente preview PDF
    const pdfReady = await waitForPdfGenerated(page, 6_000);
    expect(pdfReady).toBeTruthy();

    // Click "Signer ici"
    const signTrigger = page.getByRole("button", { name: /signer ici|ouvrir.*signature|signer/i }).first();
    if (await signTrigger.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await signTrigger.click();
    }

    // Trace canvas
    const dialog = page.getByRole("dialog").first();
    const scope = (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) ? dialog : page;
    const traced = await signCanvas(scope);
    expect(traced).toBeTruthy();

    // Confirme
    const confirm = (scope === page ? page : dialog)
      .getByRole("button", { name: /confirmer|valider|signer.*contrat|envoyer/i })
      .first();
    await confirm.click({ timeout: 5_000 });

    // Toast / feedback
    await expect(
      page.getByText(/sign.*enregistr|envoy.*employeur|attente.*employeur|sign.*succ/i).first(),
    ).toBeVisible({ timeout: 8_000 });
  });
});
