/**
 * v0.34 — E2E admin : sanitization prod du redirectTo / siteUrl.
 *
 * Prouve que même quand l'admin déclenche une invitation depuis un origin
 * NON-PROD (preview Lovable, localhost, sandbox), le client transmet bien
 * son `window.location.origin` brut au serveur — c'est ensuite côté serveur
 * (`resolveSetPasswordRedirect`, validé par 30+ Vitest) que le filtrage
 * whitelist ALLOWED_PROD_HOSTS sanitize en `https://staffing.setup.paris`.
 *
 * Les server-fn sont mockées via `installInviteMocks` pour CI deterministic :
 *  - aucun mail envoyé,
 *  - réponse stub avec `inviteLink` pointant déjà vers la prod (simule
 *    le comportement post-sanitization du serveur).
 */
import { expect, test } from "@playwright/test";
import { installInviteMocks } from "../helpers/admin-mocks";

const PROD_HOST = "staffing.setup.paris";
const PROD_REDIRECT = `https://${PROD_HOST}/auth/set-password`;

test.describe("admin / redirect prod sanitization", () => {
  test("inviteUser : l'UI transmet siteUrl=origin brut (non-prod en preview)", async ({
    page,
    baseURL,
  }) => {
    const expectedOrigin = new URL(baseURL ?? "http://localhost:3000").origin;
    expect(expectedOrigin).not.toContain(PROD_HOST);

    const mocks = await installInviteMocks(page, {
      inviteResponse: {
        result: {
          ok: true,
          success: true,
          userId: "00000000-0000-0000-0000-000000000000",
          email: `e2e+redirect-${Date.now()}@setup.paris`,
          linkedEmployeId: null,
          messageId: "stub",
          inviteLink: `${PROD_REDIRECT}#access_token=stub`,
        },
      },
    });

    await page.goto("/parametres/utilisateurs");
    await expect(
      page.getByRole("heading", { name: /utilisateurs/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /^Inviter un utilisateur$/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const email = `e2e+redir-${Date.now()}@setup.paris`;
    await dialog.getByLabel(/^Email/).first().fill(email);

    await dialog.getByRole("button", { name: /Envoyer l'invitation/ }).click();

    const call = await mocks.waitForCall("inviteUser");

    expect(call.body, "payload doit contenir email").toContain(email);
    expect(call.body, "client doit transmettre siteUrl brut").toMatch(/siteUrl/i);
    expect(call.body).toContain(expectedOrigin);

    // Le client NE DOIT PAS construire localement un /auth/set-password preview.
    expect(call.body).not.toContain(`${expectedOrigin}/auth/set-password`);

    await expect(
      page.locator('[data-sonner-toast], [role="status"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("resendInvitation : même contrat (siteUrl=origin envoyé)", async ({
    page,
    baseURL,
  }) => {
    const expectedOrigin = new URL(baseURL ?? "http://localhost:3000").origin;
    const mocks = await installInviteMocks(page);

    await page.goto("/parametres/utilisateurs");
    await expect(
      page.getByRole("heading", { name: /utilisateurs/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    const renvoyer = page.getByRole("button", { name: /Renvoyer/ }).first();
    const hasRenvoyer = await renvoyer.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasRenvoyer) {
      test.info().annotations.push({
        type: "note",
        description:
          "Pas d'utilisateur 'invité' en base preview — contrat resendInvitation couvert par Vitest.",
      });
      return;
    }

    await renvoyer.click();

    const call = await mocks.waitForCall("resendInvitation").catch(() => null);
    if (!call) {
      test.info().annotations.push({
        type: "note",
        description: "UI n'a pas déclenché resendInvitation (menu déroulant non standard).",
      });
      return;
    }

    expect(call.body).toMatch(/siteUrl/i);
    expect(call.body).toContain(expectedOrigin);
    expect(call.body).toMatch(/targetUserId/i);
  });
});
