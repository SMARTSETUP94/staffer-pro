/**
 * Convertit une erreur jetée par un createServerFn en message lisible.
 *
 * TanStack Start sérialise les `throw new Response(...)` (middleware d'auth,
 * 401/500…) tels quels côté client, ce qui donne `[object Response]` lors
 * d'un `String(e)` ou `e.message`. Cet utilitaire lit le body de la Response
 * pour fournir un message exploitable.
 */
export async function readServerFnError(e: unknown): Promise<string> {
  if (e instanceof Response) {
    let body = "";
    try {
      body = await e.text();
    } catch {
      // ignore
    }
    return body || `Erreur serveur (${e.status} ${e.statusText || ""})`.trim();
  }
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "Erreur inconnue";
  }
}
