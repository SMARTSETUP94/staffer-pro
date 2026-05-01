/**
 * v0.34 — Helpers Playwright pour mocker les server-functions admin.
 *
 * Objectif : rendre les specs déterministes en CI en :
 *  1. interceptant TOUTES les requêtes server-fn TanStack (`**\/_serverFn/**`),
 *  2. routant par inspection du `postData` (le nom de la fn apparaît
 *     dans l'URL OU dans le payload selon la version du runtime),
 *  3. capturant chaque appel matché dans un tableau pour assertions,
 *  4. fulfillant avec une réponse stub conforme au contrat,
 *  5. laissant `route.fallback()` pour tout le reste (auth, listing users…).
 *
 * Cette approche évite les deux flakiness classiques :
 *  - matcher trop large `/inviteUser|_serverFn/` qui capturait aussi les
 *    requêtes de chargement (listUsers etc.) et bloquait la page,
 *  - dépendance à la donnée seed (test "renvoyer" qui skip si pas d'invité).
 */
import type { Page, Request, Route } from "@playwright/test";

export type ServerFnName = "inviteUser" | "resendInvitation";

export interface CapturedCall {
  fn: ServerFnName;
  url: string;
  body: string;
  payload: unknown;
}

export interface InviteMockOptions {
  /** Réponse à renvoyer pour inviteUser. Defaults to ok=true. */
  inviteResponse?: unknown;
  /** Réponse à renvoyer pour resendInvitation. Defaults to ok=true. */
  resendResponse?: unknown;
  /** Forcer une erreur HTTP pour tester les codes d'erreur UI. */
  inviteStatus?: number;
  resendStatus?: number;
}

const PROD_REDIRECT = "https://staffing.setup.paris/auth/set-password";

const DEFAULT_INVITE_RESPONSE = {
  result: {
    ok: true,
    success: true,
    userId: "00000000-0000-0000-0000-000000000001",
    email: "stub@setup.paris",
    linkedEmployeId: null,
    messageId: "stub-message-id",
    inviteLink: `${PROD_REDIRECT}#access_token=stub-token`,
  },
};

const DEFAULT_RESEND_RESPONSE = {
  result: {
    success: true,
    email: "stub@setup.paris",
    inviteLink: `${PROD_REDIRECT}#access_token=stub-token`,
  },
};

/**
 * Détermine quelle server-fn est appelée d'après l'URL ET le payload.
 * Robuste aux 2 conventions TanStack (nom dans l'URL ou dans le body).
 */
function detectFn(url: string, body: string): ServerFnName | null {
  const haystack = `${url}\n${body}`;
  if (/inviteUser/.test(haystack)) return "inviteUser";
  if (/resendInvitation/.test(haystack)) return "resendInvitation";
  return null;
}

/**
 * Active le mock sur la page et renvoie un objet permettant :
 *  - `calls` : liste des appels capturés (live, mutée par les routes),
 *  - `waitForCall(fn)` : promesse résolue dès qu'un appel ciblé est capturé,
 *  - `dispose()` : retire les routes (optionnel, auto-cleanup en fin de test).
 */
export async function installInviteMocks(page: Page, opts: InviteMockOptions = {}) {
  const calls: CapturedCall[] = [];
  const waiters = new Map<ServerFnName, Array<(c: CapturedCall) => void>>();

  const handler = async (route: Route, request: Request) => {
    if (request.method() !== "POST") return route.fallback();
    const url = request.url();
    const body = request.postData() ?? "";
    const fn = detectFn(url, body);
    if (!fn) return route.fallback();

    let payload: unknown = null;
    try {
      payload = body ? JSON.parse(body) : null;
    } catch {
      // Certains transports envoient FormData ou wrappent — on garde body brut.
    }

    const call: CapturedCall = { fn, url, body, payload };
    calls.push(call);
    const queue = waiters.get(fn);
    if (queue) {
      for (const resolve of queue) resolve(call);
      waiters.delete(fn);
    }

    if (fn === "inviteUser") {
      return route.fulfill({
        status: opts.inviteStatus ?? 200,
        contentType: "application/json",
        body: JSON.stringify(opts.inviteResponse ?? DEFAULT_INVITE_RESPONSE),
      });
    }
    return route.fulfill({
      status: opts.resendStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(opts.resendResponse ?? DEFAULT_RESEND_RESPONSE),
    });
  };

  // Pattern large : intercepte tous les POST server-fn ; on filtre dans le handler.
  await page.route("**/_serverFn/**", handler);
  // Fallback pour les versions de TanStack qui exposent une URL différente :
  // on intercepte aussi tout endpoint mentionnant les noms cibles dans l'URL.
  await page.route(/inviteUser|resendInvitation/, handler);

  return {
    calls,
    waitForCall(fn: ServerFnName, timeoutMs = 10_000): Promise<CapturedCall> {
      const existing = calls.find((c) => c.fn === fn);
      if (existing) return Promise.resolve(existing);
      return new Promise<CapturedCall>((resolve, reject) => {
        const queue = waiters.get(fn) ?? [];
        queue.push(resolve);
        waiters.set(fn, queue);
        setTimeout(
          () => reject(new Error(`Timeout waiting for server-fn ${fn} (${timeoutMs}ms)`)),
          timeoutMs,
        );
      });
    },
    async dispose() {
      await page.unroute("**/_serverFn/**", handler).catch(() => {});
      await page.unroute(/inviteUser|resendInvitation/, handler).catch(() => {});
    },
  };
}
