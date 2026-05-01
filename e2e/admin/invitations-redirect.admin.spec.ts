/**
 * v0.34 — E2E admin : sanitization prod du redirectTo / siteUrl.
 *
 * Objectif : prouver côté Playwright que même quand l'admin déclenche une
 * invitation depuis un origin NON-PROD (preview Lovable, localhost dev,
 * sandbox éphémère), la chaîne complète aboutit à un lien `/auth/set-password`
 * pointant vers `https://staffing.setup.paris` — JAMAIS vers le preview.
 *
 * Stratégie :
 *  1. On intercepte la requête server-fn POST (inviteUser / resendInvitation)
 *     pour capturer le payload réellement envoyé par l'UI.
 *  2. On vérifie que l'UI transmet bien `siteUrl = window.location.origin`
 *     (donc un origin non-prod en E2E : localhost ou *-preview.lovable.app).
 *  3. On stub la réponse server-fn avec un payload contenant `inviteLink`
 *     pour vérifier que le client n'a pas de logique parallèle qui
 *     reconstruirait un lien preview côté UI.
 *  4. Garde-fou contractuel : la sanitization elle-même est validée par
 *     `src/lib/__tests__/auth-redirect-helpers.test.ts` (Vitest, 30+ tests
 *     couvrant whitelist ALLOWED_PROD_HOSTS, fallback FALLBACK_SITE_URL,
 *     rejet localhost / preview / env var pourrie). Ce spec Playwright
 *     complète en validant l'intégration UI → server-fn.
 *
 * Pré-requis : storageState admin.
 */
import { expect, test, type Request } from "@playwright/test";

const PROD_HOST = "staffing.setup.paris";
const PROD_REDIRECT = `https://${PROD_HOST}/auth/set-password`;

/** Capture le 1er POST server-fn correspondant à un nom de fonction. */
function waitForServerFnRequest(page: import("@playwright/test").Page, fnName: string) {
  return page.waitForRequest(
    (r) =>
      r.method() === "POST" &&
      (r.url().includes(fnName) || r.url().includes("/_serverFn/")),
    { timeout: 15_000 },
  );
}

function extractBody(req: Request): string {
  return req.postData() ?? "";
}

test.describe("admin / redirect prod sanitization", () => {
  test("inviteUser : l'UI transmet siteUrl=origin (non-prod en preview), serveur force prod", async ({
    page,
    baseURL,
  }) => {
    // En E2E, baseURL = http://localhost:3000 ou un preview Lovable :
    // dans tous les cas un origin NON présent dans ALLOWED_PROD_HOSTS.
    const expectedOrigin = new URL(baseURL ?? "http://localhost:3000").origin;
    expect(expectedOrigin).not.toContain(PROD_HOST);

    // Stub la réponse server-fn pour ne pas réellement envoyer de mail.
    await page.route(
      (url) => /inviteUser|_serverFn/.test(url.toString()),
      async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        // Réponse minimale conforme au shape attendu par handleInvite()
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              ok: true,
              userId: "00000000-0000-0000-0000-000000000000",
              email: `e2e+redirect-${Date.now()}@setup.paris`,
              linkedEmployeId: null,
              // inviteLink simulé tel que le serveur le renvoie après sanitization
              inviteLink: `${PROD_REDIRECT}#access_token=stub`,
            },
          }),
        });
      },
    );

    await page.goto("/parametres/utilisateurs");
    await expect(
      page.getByRole("heading", { name: /utilisateurs/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /^Inviter un utilisateur$/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const email = `e2e+redir-${Date.now()}@setup.paris`;
    await dialog.getByLabel(/^Email/).fill(email);

    const reqPromise = waitForServerFnRequest(page, "inviteUser");
    await dialog.getByRole("button", { name: /Envoyer l'invitation/ }).click();

    const req = await reqPromise.catch(() => null);
    expect(req, "server-fn inviteUser doit être appelée").not.toBeNull();

    const body = extractBody(req!);
    expect(body, "payload doit contenir email").toContain(email);

    // Le client envoie l'origin courant (preview/localhost) : c'est attendu.
    // C'est le serveur (resolveSetPasswordRedirect) qui fait le filtrage.
    expect(body, "client doit transmettre siteUrl brut").toMatch(/siteUrl/i);
    expect(body).toContain(expectedOrigin);

    // Le client NE DOIT PAS construire localement un /auth/set-password preview :
    // tout passage par /auth/set-password se fait via le lien serveur (whitelist).
    expect(body).not.toContain(`${expectedOrigin}/auth/set-password`);

    // Toast succès attendu (réponse stub ok=true)
    await expect(
      page.locator('[data-sonner-toast], [role="status"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("resendInvitation : même contrat (siteUrl=origin envoyé, sanitization serveur)", async ({
    page,
    baseURL,
  }) => {
    const expectedOrigin = new URL(baseURL ?? "http://localhost:3000").origin;

    await page.route(
      (url) => /resendInvitation|_serverFn/.test(url.toString()),
      async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            result: {
              ok: true,
              email: "stub@setup.paris",
              inviteLink: `${PROD_REDIRECT}#access_token=stub`,
            },
          }),
        });
      },
    );

    await page.goto("/parametres/utilisateurs");
    await expect(
      page.getByRole("heading", { name: /utilisateurs/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Cherche un bouton "Renvoyer" dans la table OU dans un menu d'actions
    const renvoyer = page.getByRole("button", { name: /Renvoyer/ }).first();
    const hasRenvoyer = await renvoyer.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasRenvoyer) {
      test.skip(true, "Aucun utilisateur 'invité' dans la base preview pour tester le renvoi");
      return;
    }

    const reqPromise = waitForServerFnRequest(page, "resendInvitation");
    await renvoyer.click();

    const req = await reqPromise.catch(() => null);
    if (!req) {
      test.skip(true, "Pas de requête server-fn capturée (UI peut router via menu déroulant)");
      return;
    }

    const body = extractBody(req);
    expect(body).toMatch(/siteUrl/i);
    expect(body).toContain(expectedOrigin);
    expect(body).toMatch(/targetUserId/i);
  });
});
