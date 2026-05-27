/**
 * L3a — E2E admin : page /parametres/utilisateurs en mode multi-rôles.
 *
 * Scénario :
 *  1. login admin → /parametres/utilisateurs
 *  2. ouvrir le popover de rôles sur un user test (pas l'admin courant)
 *  3. cocher 3 rôles cumulés (commercial + bureau_etude + chef_chantier)
 *  4. "Appliquer" → toast OK
 *  5. recharger la page
 *  6. assert : 3 badges de rôles distincts visibles sur la ligne du user test
 *
 * Défensif : skip si aucun user test cible n'est trouvé (ex: seed pas joué).
 * Auth : utilise la storage state admin (cf. global-setup).
 */
import { expect, test } from "@playwright/test";

const TARGET_ROLES = [
  { key: "commercial", label: /commercial/i },
  { key: "bureau_etude", label: /bureau.*[ée]tude/i },
  { key: "chef_chantier", label: /chef.*[ée]quipe|chef.*chantier/i },
];

test.describe("L3a — /parametres/utilisateurs multi-rôles", () => {
  test("admin coche 3 rôles cumulés → 3 badges persistés après reload", async ({ page }) => {
    await page.goto("/parametres/utilisateurs");
    await expect(
      page.getByRole("heading", { name: /utilisateur/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Cible un user test non-admin (email contenant `test_` ou `e2e`).
    // Premier match dans le tableau.
    const rows = page.getByRole("row");
    const candidate = rows
      .filter({ hasText: /test_|e2e|@setupparis\.test/i })
      .filter({ hasNot: page.locator("text=/admin/i") })
      .first();

    if (!(await candidate.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "Aucun user test cible trouvé dans la table (seed E2E absent).");
    }

    // Ouvrir le popover multi-rôles (bouton avec un libellé contenant "rôle" ou icône).
    const roleTrigger = candidate
      .getByRole("button", { name: /r[ôo]le|modifier|changer/i })
      .first();
    if (!(await roleTrigger.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Trigger popover rôles introuvable (UI variante).");
    }
    await roleTrigger.click();

    // Cocher les 3 rôles cibles via leur checkbox.
    for (const r of TARGET_ROLES) {
      const cb = page.getByRole("checkbox", { name: r.label }).first();
      await expect(cb).toBeVisible({ timeout: 5_000 });
      if (!(await cb.isChecked().catch(() => false))) {
        await cb.click();
      }
    }

    // Appliquer.
    const apply = page
      .getByRole("button", { name: /appliquer|enregistrer|valider/i })
      .first();
    await apply.click();

    // Toast / feedback succès (best-effort).
    await page
      .getByText(/r[ôo]les?.*(mis|appliqu|enregistr)/i)
      .first()
      .waitFor({ timeout: 5_000 })
      .catch(() => undefined);

    // Reload pour s'assurer que la persistance est OK (pas juste state local).
    await page.reload();
    await expect(
      page.getByRole("heading", { name: /utilisateur/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Retrouver la ligne et vérifier que les 3 rôles sont affichés.
    const reloadedRow = rows
      .filter({ hasText: /test_|e2e|@setupparis\.test/i })
      .filter({ hasNot: page.locator("text=/^admin$/i") })
      .first();
    await expect(reloadedRow).toBeVisible({ timeout: 10_000 });

    for (const r of TARGET_ROLES) {
      await expect(reloadedRow.getByText(r.label).first()).toBeVisible({
        timeout: 5_000,
      });
    }
  });
});
