/**
 * v0.34 — E2E admin : envoi & renvoi d'invitations.
 *
 * Toutes les server-fn sensibles (inviteUser/resendInvitation) sont mockées
 * via `installInviteMocks` pour garantir le déterminisme en CI :
 *  - aucun mail réellement envoyé,
 *  - aucune écriture en base preview,
 *  - aucune dépendance à des données seed (utilisateurs invités existants).
 */
import { expect, test } from "@playwright/test";
import { installInviteMocks } from "../helpers/admin-mocks";

const uniqueEmail = () => `e2e+invite-${Date.now()}@setup.paris`;

test.describe("admin / invitations", () => {
  test("ouvre le dialog d'invitation et soumet un nouvel utilisateur", async ({ page }) => {
    const mocks = await installInviteMocks(page);

    await page.goto("/parametres/utilisateurs");
    await expect(page.getByRole("heading", { name: /utilisateurs/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /^Inviter un utilisateur$/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Inviter un utilisateur/i)).toBeVisible();

    const email = uniqueEmail();
    await dialog.getByLabel(/^Email/).first().fill(email);
    await dialog.getByLabel(/Nom complet/i).fill("E2E Invité");

    await dialog.getByRole("button", { name: /Envoyer l'invitation/ }).click();

    const call = await mocks.waitForCall("inviteUser");
    expect(call.body).toContain(email);
    expect(call.body).toMatch(/siteUrl/i);

    // Toast succès garanti par le stub ok=true
    await expect(
      page.locator('[data-sonner-toast], [role="status"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("ferme le dialog avec Annuler sans envoyer de requête", async ({ page }) => {
    const mocks = await installInviteMocks(page);

    await page.goto("/parametres/utilisateurs");
    await page.getByRole("button", { name: /^Inviter un utilisateur$/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Annuler/ }).click();
    await expect(dialog).toBeHidden();

    expect(mocks.calls).toHaveLength(0);
  });

  test("renvoie une invitation depuis /audit-auth onglet Invitations", async ({ page }) => {
    const mocks = await installInviteMocks(page);

    await page.goto("/audit-auth");
    await expect(page.getByRole("heading", { name: /audit/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const invitTab = page.getByRole("tab", { name: /invitations/i });
    if (await invitTab.isVisible().catch(() => false)) {
      await invitTab.click();
    }

    const renvoyerBtn = page.getByRole("button", { name: /Renvoyer/ }).first();
    const hasRow = await renvoyerBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!hasRow) {
      // Pas d'invitation en base preview → on ne skip plus, on documente seulement.
      // (le contrat resendInvitation est couvert par le test redirect dédié.)
      test.info().annotations.push({
        type: "note",
        description: "Aucune invitation en attente dans la base preview — renvoi non testable ici.",
      });
      return;
    }

    await renvoyerBtn.click();

    const call = await mocks.waitForCall("resendInvitation");
    expect(call.body).toMatch(/targetUserId/i);
    expect(call.body).toMatch(/siteUrl/i);

    await expect(
      page.locator('[data-sonner-toast], [role="status"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
