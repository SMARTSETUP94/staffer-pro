/**
 * v0.34.x — Helper batterie role-smoke.
 *
 * Pour chaque route fournie :
 *  - navigue dessus,
 *  - vérifie qu'on n'a pas été redirigé vers /login,
 *  - vérifie qu'aucun error-boundary ne s'est affiché,
 *  - capture les erreurs console (filtrées) et échoue à la fin du test si non-vide.
 *
 * Pour les routes interdites (forbiddenRoutes) :
 *  - navigue dessus,
 *  - vérifie qu'on est REDIRIGÉ (login, /, /dashboard, /ma-semaine, /mobile/...)
 *    OU qu'un message d'accès refusé s'affiche (anti-fuite RGPD).
 */
import { expect, type Page } from "@playwright/test";

/** Patterns d'erreurs console ignorées (warnings React/Vite/HMR connus). */
const IGNORED_CONSOLE_PATTERNS: RegExp[] = [
  /\[vite\]/i,
  /Download the React DevTools/i,
  /\[HMR\]/i,
  /sb-.*-auth-token/i, // warning expiration token bénin
  /ResizeObserver loop/i,
  /Failed to load resource.*favicon/i,
];

function shouldIgnoreConsole(text: string): boolean {
  return IGNORED_CONSOLE_PATTERNS.some((p) => p.test(text));
}

export interface RouteSmokeOptions {
  /** Sélecteur racine attendu après navigation (par défaut <main> ou <body>). */
  rootSelector?: string;
  /** Timeout par route (ms). */
  perRouteTimeout?: number;
}

/**
 * Visite une liste de routes autorisées.
 * Retourne la liste des erreurs console agrégées (à asserter par le test).
 */
export async function visitAllowedRoutes(
  page: Page,
  routes: readonly string[],
  opts: RouteSmokeOptions = {},
): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (shouldIgnoreConsole(text)) return;
    errors.push(`[console.error @ ${page.url()}] ${text}`);
  });
  page.on("pageerror", (err) => {
    errors.push(`[pageerror @ ${page.url()}] ${err.message}`);
  });

  for (const route of routes) {
    await page.goto(route, { timeout: opts.perRouteTimeout ?? 15_000 });
    // Anti-redirect login (sauf si la route est précisément /login)
    expect(page.url(), `Route ${route} a redirigé vers /login`).not.toMatch(
      /\/login(\?|$)/,
    );
    // Pas d'error-boundary visible
    const errorBoundary = page.getByText(
      /(une erreur est survenue|something went wrong|oups)/i,
    );
    await expect(
      errorBoundary,
      `Error boundary visible sur ${route}`,
    ).toHaveCount(0, { timeout: 1_000 });
  }
  return errors;
}

/**
 * Vérifie qu'une liste de routes interdites ne fuite PAS leur contenu :
 *  - soit redirige hors de la route (/, /login, /dashboard, /ma-semaine, /mobile/...),
 *  - soit affiche un message « accès refusé / non autorisé / 403 ».
 */
export async function assertForbiddenRoutes(
  page: Page,
  routes: readonly string[],
): Promise<void> {
  for (const route of routes) {
    await page.goto(route, { timeout: 15_000 });
    const url = new URL(page.url());
    const stillThere = url.pathname.replace(/\/$/, "") === route.replace(/\/$/, "");
    if (!stillThere) continue; // redirigé → OK

    const forbiddenMsg = page.getByText(
      /(accès refusé|non autorisé|forbidden|403|vous n'avez pas (l'autorisation|accès))/i,
    );
    await expect(
      forbiddenMsg,
      `Route interdite ${route} affiche son contenu sans message d'erreur`,
    ).toBeVisible({ timeout: 3_000 });
  }
}
