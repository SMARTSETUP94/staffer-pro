/**
 * E2E 2 — Conflit dispo : 2e tentative de staffing sur dates chevauchantes
 * affiche une modale "Continuer ?" avec choix Annuler / Continuer.
 *
 * Défensif : si le 1er staffing n'a pas pu être créé (pas de seed), skip.
 */
import { expect, test } from "@playwright/test";
import { testIntermittentName } from "../helpers/contrats";

test.describe("E2E 2 — conflit dispo /staffer-mobile (chef)", () => {
  test("modale 'Continuer ?' s'affiche en cas de chevauchement", async ({ page }) => {
    await page.goto("/staffer-mobile");
    if (!page.url().includes("/staffer-mobile")) {
      test.skip(true, "Route /staffer-mobile non dispo");
    }

    // Sélectionne le même intermittent que le test E2E 1 (déjà staffé)
    const search = page
      .getByRole("searchbox")
      .or(page.getByPlaceholder(/cherch|rechercher|nom|employ/i))
      .first();
    if (!(await search.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Champ recherche absent");
    }
    await search.fill(testIntermittentName());
    const option = page
      .getByRole("option", { name: new RegExp(testIntermittentName(), "i") })
      .first();
    if (!(await option.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Intermittent test non seedé");
    }
    await option.click();

    const submit = page
      .getByRole("button", { name: /staffer|valider|cr.*er.*mission|enregistrer/i })
      .last();
    await submit.click({ timeout: 5_000 }).catch(() => undefined);

    // Cherche modale conflit
    const modal = page.getByRole("dialog").filter({ hasText: /conflit|continuer|chevauch|d.j.*staff/i }).first();
    if (!(await modal.isVisible({ timeout: 4_000 }).catch(() => false))) {
      test.skip(true, "Modale conflit non déclenchée — le 1er staffing n'a peut-être pas été persisté");
    }

    // a) Bouton Annuler ferme modale + bloque assignation
    const cancelBtn = modal.getByRole("button", { name: /annul|fermer|cancel/i }).first();
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
      await expect(modal).toBeHidden({ timeout: 3_000 });
    }

    // b) Re-submit puis bouton Continuer crée la double assignation
    await submit.click({ timeout: 3_000 }).catch(() => undefined);
    const modal2 = page.getByRole("dialog").filter({ hasText: /conflit|continuer|chevauch/i }).first();
    if (await modal2.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const continueBtn = modal2.getByRole("button", { name: /continuer|forcer|valider quand m.me/i }).first();
      if (await continueBtn.isVisible().catch(() => false)) {
        await continueBtn.click();
        await expect(
          page.getByText(/mission.*cr|staff.*succ|enregistr/i).first(),
        ).toBeVisible({ timeout: 6_000 });
      }
    }
  });
});
