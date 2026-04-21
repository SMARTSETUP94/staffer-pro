/**
 * Détail structuré d'une erreur jetée par un createServerFn.
 *
 * TanStack Start sérialise les `throw new Response(...)` (middleware d'auth,
 * 401/500…) tels quels côté client, ce qui donne `[object Response]` lors
 * d'un `String(e)` ou `e.message`. Cet utilitaire lit le body de la Response
 * pour fournir un message exploitable et expose le statut HTTP.
 */
export interface ServerFnErrorDetail {
  /** Message court adapté pour un toast. */
  message: string;
  /** Statut HTTP si l'erreur vient d'une Response, sinon null. */
  status: number | null;
  /** Texte du statut HTTP (ex: "Unauthorized"). */
  statusText: string | null;
  /** Body brut récupéré (utile pour la section "Détails"). */
  body: string | null;
  /** Type haut niveau pour l'UI. */
  kind: "http" | "error" | "string" | "unknown";
}

function shortMessageFromBody(body: string, status: number): string {
  const trimmed = body.trim();
  if (!trimmed) return `Erreur serveur (${status})`;
  // Tente de décoder un JSON { message } / { error }
  try {
    const j = JSON.parse(trimmed);
    if (typeof j?.message === "string") return j.message;
    if (typeof j?.error === "string") return j.error;
    if (typeof j?.error?.message === "string") return j.error.message;
  } catch {
    // body non-JSON
  }
  // Garde une ligne lisible pour le toast
  const firstLine = trimmed.split("\n")[0];
  return firstLine.length > 200 ? firstLine.slice(0, 200) + "…" : firstLine;
}

export async function parseServerFnError(e: unknown): Promise<ServerFnErrorDetail> {
  if (e instanceof Response) {
    let body = "";
    try {
      body = await e.text();
    } catch {
      // ignore
    }
    return {
      message: shortMessageFromBody(body, e.status),
      status: e.status,
      statusText: e.statusText || null,
      body: body || null,
      kind: "http",
    };
  }
  if (e instanceof Error) {
    return {
      message: e.message || "Erreur inconnue",
      status: null,
      statusText: null,
      body: e.stack ?? null,
      kind: "error",
    };
  }
  if (typeof e === "string") {
    return { message: e, status: null, statusText: null, body: e, kind: "string" };
  }
  let body: string | null = null;
  try {
    body = JSON.stringify(e, null, 2);
  } catch {
    body = null;
  }
  return {
    message: "Erreur inconnue",
    status: null,
    statusText: null,
    body,
    kind: "unknown",
  };
}

/**
 * Variante "compat" : renvoie un simple string lisible (utilisée par les
 * call-sites historiques qui n'ont pas besoin du détail structuré).
 */
export async function readServerFnError(e: unknown): Promise<string> {
  const d = await parseServerFnError(e);
  if (d.status) return `[${d.status}] ${d.message}`;
  return d.message;
}
