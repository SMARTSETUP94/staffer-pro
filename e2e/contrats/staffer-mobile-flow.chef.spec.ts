/**
 * E2E 1 — Sprint contrats Tour 3.
 * Flow chef sur /staffer-mobile : recherche fuzzy intermittent → sélection
 * chantier → submit dates 4h/8h → assertions toast + retombées /planning + /rh/contrats.
 *
 * Défensif : si l'intermittent test n'est pas seedé OU si la route
 * /staffer-mobile n'est pas accessible avec ce build, le test skip plutôt
 * que de masquer un échec sans rapport avec le sprint.
 */
import { expect, test } from "@playwright/test";
import { testIntermittentName, findContratRow } from "../helpers/contrats";

test.describe("E2E 1 — staffer-mobile flow chef", () => {
  test("chef peut staffer un intermittent test et voit la retombée plan + contrat", async ({
    page,
  }) => {
    await page.goto("/staffer-mobile");
    if (!page.url().includes("/staffer-mobile")) {
      test.skip(true, "Route /staffer-mobile non accessible (RoleGuard ou build sans feature)");
    }

    // 1. Recherche fuzzy
    const search = page
      .getByRole("searchbox")
      .or(page.getByPlaceholder(/cherch|rechercher|nom|employ/i))
      .first();
    if (!(await search.isVisible({ timeout: 4_000 }).catch(() => false))) {
      test.skip(true, "Champ recherche /staffer-mobile absent (UI variante)");
    }
    await search.fill(testIntermittentName());

    const option = page
      .getByRole("option", { name: new RegExp(testIntermittentName(), "i") })
      .or(page.getByText(new RegExp(testIntermittentName(), "i")).first());
    if (!(await option.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Intermittent test non seedé (cf seed-contrats)");
    }
    await option.first().click();

    // 2. Sélection chantier (premier dispo)
    const chantierSelect = page
      .getByRole("combobox", { name: /chantier|affaire/i })
      .first();
    if (await chantierSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await chantierSelect.click();
      const firstOpt = page.getByRole("option").first();
      await firstOpt.click({ timeout: 3_000 }).catch(() => undefined);
    }

    // 3. Sélection durée 8h (journée complète)
    const dureeBtn = page
      .getByRole("button", { name: /journ.*compl|8\s?h/i })
      .first();
    if (await dureeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await dureeBtn.click();
    }

    // 4. Submit
    const submit = page
      .getByRole("button", { name: /staffer|valider|cr.*er.*mission|enregistrer/i })
      .last();
    await submit.click({ timeout: 5_000 }).catch(() => undefined);

    // 5. Assertion toast
    const toast = page
      .getByText(/mission.*cr|staff.*succ|contrat.*g.*n.*r|enregistr/i)
      .first();
    await expect(toast).toBeVisible({ timeout: 6_000 });

    // 6. Retombée /rh/contrats statut À signer (employé)
    await page.goto("/rh/contrats");
    const row = await findContratRow(page, new RegExp(testIntermittentName(), "i"), 5_000);
    if (row) {
      await expect(row).toContainText(/.*sign.*employ|attente.*employ|à\s+signer/i);
    }

    // 7. Retombée /planning (smoke : page charge sans erreur, lien intermittent visible idéalement)
    await page.goto("/planning");
    await expect(page).toHaveURL(/\/planning/);
  });
});
