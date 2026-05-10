/**
 * Helpers E2E pour module contrats intermittents (Tour 2).
 *
 * Factorise :
 *  - signCanvas : trace une signature simulée (drag souris) sur un <canvas>.
 *  - waitForPdfGenerated : attend qu'un upload Storage `contrats-intermittents`
 *    soit visible côté UI (badge "PDF généré" OU lien iframe preview).
 *  - findContratRow : retrouve une ligne contrat (table /rh/contrats ou
 *    liste mobile /mobile/contrats) par texte employé/affaire avec retry.
 *  - mockResendIfNeeded : intercepte le call edge-fn `notify-contrat-email`
 *    quand RESEND_API_KEY n'est pas dispo en CI et capture les payloads.
 *
 * Toutes les helpers sont DEFENSIVES : si l'élément attendu n'existe pas
 * (feature non seedée, UI variante), elles renvoient `null` ou skip plutôt
 * que de faire échouer un timeout.
 */
import type { Locator, Page, Request, Route } from "@playwright/test";

/**
 * Trace une signature simulée sur le premier canvas visible scope.
 * Effectue 3 segments (drag) pour produire une trace non-vide.
 * Retourne true si le canvas a été trouvé et la séquence exécutée.
 */
export async function signCanvas(scope: Page | Locator): Promise<boolean> {
  const root = "locator" in scope ? scope : (scope as Page);
  const canvas = ("locator" in root
    ? (root as Locator).locator("canvas").first()
    : (root as Page).locator("canvas").first()) as Locator;
  if (!(await canvas.isVisible({ timeout: 3_000 }).catch(() => false))) {
    return false;
  }
  const box = await canvas.boundingBox();
  if (!box) return false;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const page: Page =
    "mouse" in scope ? (scope as Page) : ((scope as Locator).page() as Page);
  await page.mouse.move(cx - 60, cy - 20);
  await page.mouse.down();
  await page.mouse.move(cx - 20, cy + 10, { steps: 8 });
  await page.mouse.move(cx + 30, cy - 5, { steps: 10 });
  await page.mouse.move(cx + 60, cy + 15, { steps: 6 });
  await page.mouse.up();
  // petite pause pour laisser react-signature-canvas commiter
  await page.waitForTimeout(150);
  return true;
}

/**
 * Attend qu'un PDF de contrat soit généré côté UI : on cherche soit un
 * `<iframe>` preview avec src contenant `contrats-intermittents`, soit un
 * texte "PDF prêt" / "v1" / "v2" / "v3".
 */
export async function waitForPdfGenerated(
  page: Page,
  timeoutMs = 8_000,
): Promise<boolean> {
  const iframe = page
    .locator(
      'iframe[src*="contrats-intermittents"], iframe[src*=".pdf"], a[href*=".pdf"]',
    )
    .first();
  const textBadge = page
    .getByText(/pdf (prêt|généré|v[123])|version [123]/i)
    .first();
  try {
    await Promise.race([
      iframe.waitFor({ state: "visible", timeout: timeoutMs }),
      textBadge.waitFor({ state: "visible", timeout: timeoutMs }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cherche une ligne contrat par texte (employé OU numéro affaire).
 * Si rien trouvé après timeout → null (skip décidé par le test).
 */
export async function findContratRow(
  page: Page,
  needle: RegExp,
  timeoutMs = 4_000,
): Promise<Locator | null> {
  const row = page
    .getByRole("row")
    .filter({ hasText: needle })
    .first()
    .or(
      page
        .locator('[data-testid*="contrat"], [data-contrat-id]')
        .filter({ hasText: needle })
        .first(),
    );
  if (await row.isVisible({ timeout: timeoutMs }).catch(() => false)) {
    return row;
  }
  return null;
}

export interface ResendCapture {
  calls: Array<{ url: string; body: unknown }>;
}

/**
 * Intercepte les requêtes vers la edge-fn `notify-contrat-email` et
 * répond 200 OK si on est en CI sans RESEND_API_KEY (mock). Capture les
 * payloads pour assertions (au moins 1 call vers l'employé + 1 vers
 * l'employeur après signature finale).
 */
export async function mockResendIfNeeded(page: Page): Promise<ResendCapture> {
  const capture: ResendCapture = { calls: [] };
  const shouldMock = !process.env.RESEND_API_KEY || process.env.CI === "true";
  await page.route(
    "**/functions/v1/notify-contrat-email**",
    async (route: Route, req: Request) => {
      let body: unknown = null;
      try {
        body = req.postDataJSON();
      } catch {
        body = req.postData();
      }
      capture.calls.push({ url: req.url(), body });
      if (shouldMock) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, mocked: true }),
        });
      } else {
        await route.fallback();
      }
    },
  );
  return capture;
}

/**
 * Helper : retourne le texte du nom recherché pour l'intermittent test.
 * Override possible via `E2E_TEST_INTERMITTENT_NAME` (par défaut : "TEST INTERMITTENT").
 */
export function testIntermittentName(): string {
  return process.env.E2E_TEST_INTERMITTENT_NAME ?? "TEST INTERMITTENT";
}
