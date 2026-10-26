import { createMiddleware } from "@tanstack/react-start";
import { supabaseForUser } from "./supabase";
import { safeAuditArguments } from "./policy";
import { TOOL_CAPS } from "./config";

export type RateLimitDecision = { applicable: boolean; allowed?: boolean; retry_after_seconds?: number };
export type ConsumeMcpQuota = (token: string, tool: string, args: Record<string, string | number>) => Promise<RateLimitDecision>;

async function consumeQuota(token: string, tool: string, args: Record<string, string | number>): Promise<RateLimitDecision> {
  const db = supabaseForUser({ getToken: () => token });
  // Invalid credentials continue to the SDK's existing OAuth 401 handling.
  const user = await db.auth.getUser(token);
  if (user.error || !user.data.user) return { applicable: false };
  const { data, error } = await db.rpc("consume_mcp_rate_limit", { _tool: tool, _arguments: args });
  if (error || !data || typeof data !== "object" || Array.isArray(data) || typeof data.applicable !== "boolean") {
    throw new Error("Compteur MCP indisponible");
  }
  if (data.applicable && (typeof data.allowed !== "boolean" || typeof data.retry_after_seconds !== "number")) {
    throw new Error("Compteur MCP indisponible");
  }
  return { applicable: data.applicable, allowed: typeof data.allowed === "boolean" ? data.allowed : undefined, retry_after_seconds: typeof data.retry_after_seconds === "number" ? data.retry_after_seconds : undefined };
}

export async function checkMcpRateLimit(request: Request, consume: ConsumeMcpQuota = consumeQuota): Promise<Response | undefined> {
  if (new URL(request.url).pathname !== "/mcp" || request.method !== "POST") return;
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return;
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await request.clone().json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch { /* The SDK retains responsibility for malformed JSON. */ }
  const id = typeof body.id === "string" || typeof body.id === "number" ? body.id : null;
  const params = body.params && typeof body.params === "object" && !Array.isArray(body.params) ? body.params as Record<string, unknown> : {};
  const tool = body.method === "tools/call" && typeof params.name === "string" && Object.hasOwn(TOOL_CAPS, params.name)
    ? params.name : ["initialize", "notifications/initialized", "tools/list", "tools/call", "ping"].includes(String(body.method)) ? String(body.method) : "request";
  const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? safeAuditArguments(params.arguments as Record<string, unknown>) : {};
  try {
    const quota = await consume(token, tool, args);
    if (!quota.applicable || quota.allowed === true) return;
    const retry = Math.max(1, Math.ceil(quota.retry_after_seconds ?? 60));
    return Response.json({ jsonrpc: "2.0", id, error: { code: -32029, message: `limite atteinte, réessayez dans ${retry} s`, data: { retry_after_seconds: retry } } }, {
      status: 429, headers: { "Retry-After": String(retry), "Cache-Control": "no-store" },
    });
  } catch {
    // Never bypass the shared quota or its atomic audit on database failure.
    return Response.json({ jsonrpc: "2.0", id, error: { code: -32603, message: "Compteur MCP indisponible, réessayez ultérieurement" } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export const mcpRateLimitMiddleware = createMiddleware({ type: "request" }).server(async ({ request, next }) => {
  const response = await checkMcpRateLimit(request);
  return response ?? next();
});