/**
 * E2E 7 — Anti double-soumission signature.
 * Employé clique 2x rapidement sur "Confirmer signature" → 2e clic ignoré
 * (bouton disabled OU toast "déjà en cours") et un seul état "signé"
 * persiste.
 *
 * Approche : on intercepte la mutation `signer_contrat_employe` pour la
 * ralentir artificiellement (200ms) puis on simule deux clics rapides.
 */
import { expect, test } from "@playwright/test";
import { signCanvas, waitForPdfGenerated } from "../helpers/contrats";

test.describe("E2E 7 — anti double-soumission signature", () => {
  test("2e clic rapide ignoré (bouton disabled ou toast déjà en cours)", async ({
    page,
  }) => {
    // Délai artificiel sur la RPC pour exposer la fenêtre de race
    let rpcCount = 0;
    await page.route("**/rest/v1/rpc/signer_contrat_employe**", async (route) => {
      rpcCount++;
      await new Promise((r) => setTimeout(r, 250));
      await route.fallback();
    });

    await page.goto("/mobile/contrats");
    if (!page.url().includes("/mobile/contrats")) {
      test.skip(true, "Route /mobile/contrats inaccessible");
    }

    const card = page
      .getByRole("button")
      .filter({ hasText: /à\s+signer|signer ici|en attente/i })
      .first();
    if (!(await card.isVisible({ timeout: 4_000 }).catch(() => false))) {
      test.skip(true, "Aucun contrat à signer disponible");
    }
    await card.click();

    expect(await waitForPdfGenerated(page, 6_000)).toBeTruthy();

    const trigger = page.getByRole("button", { name: /signer ici|signer/i }).first();
    if (await trigger.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await trigger.click();
    }
    const dialog = page.getByRole("dialog").first();
    const scope = (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) ? dialog : page;
    await signCanvas(scope);

    const confirm = (scope === page ? page : dialog)
      .getByRole("button", { name: /confirmer|valider|signer.*contrat/i })
      .first();

    // Double clic rapide
    await confirm.click({ timeout: 4_000 });
    await confirm.click({ timeout: 1_500, force: true }).catch(() => undefined);

    // Vérifie soit bouton disabled, soit toast "déjà en cours"
    const disabled = await confirm.isDisabled().catch(() => false);
    const toast = await page
      .getByText(/d.j.*en cours|en cours.*signature|soumission.*en cours/i)
      .first()
      .isVisible({ timeout: 1_500 })
      .catch(() => false);
    expect(disabled || toast).toBeTruthy();

    // Au final, au plus 1 RPC signer_contrat_employe a été initiée (la 2e a été bloquée côté UI)
    await page.waitForTimeout(800);
    expect(rpcCount).toBeLessThanOrEqual(1);
  });
});
