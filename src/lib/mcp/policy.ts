import { ToolError, type CreateAppContextInput } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";
import { MAX_RESPONSE_BYTES, TOOL_CAPS, type ToolName } from "./config";

export type McpAppContext = { db: ReturnType<typeof supabaseForUser>; userId: string; clientId: string; caps: Set<string>; canWrite?: boolean };
export async function createAppContext({ auth }: CreateAppContextInput): Promise<McpAppContext> {
  const userId = auth.getUserId(), clientId = auth.getClientId();
  if (!userId || !clientId || !auth.getToken()) throw new ToolError("Connexion OAuth requise");
  const db = supabaseForUser(auth);
  const [cap, flag, connection, user] = await Promise.all([
    db.rpc("user_has_cap", { _cap: "api.mcp" }),
    db.rpc("is_feature_flag_enabled", { _flag_key: "mcp_v1" }),
    db.from("mcp_connections").select("revoked_at").eq("user_id", userId).eq("client_id", clientId).maybeSingle(),
    db.auth.getUser(auth.getToken()),
  ]);
  if (cap.error || flag.error || connection.error || user.error || user.data.user?.id !== userId || cap.data !== true || flag.data !== true || !connection.data || connection.data.revoked_at) throw new ToolError("Accès MCP refusé ou connexion révoquée");
  const roles = await db.from("user_roles").select("role").eq("user_id", userId);
  if (roles.error) throw new ToolError("Droits indisponibles");
  const caps = await db.from("role_capabilities").select("capability").in("role", (roles.data ?? []).map(r => r.role)).eq("granted", true);
  if (caps.error) throw new ToolError("Droits indisponibles");
  const writeFlag = await db.rpc("is_feature_flag_enabled", { _flag_key: "mcp_v2_write" });
  const effectiveCaps = new Set((caps.data ?? []).map(r => r.capability));
  return { db, userId, clientId, caps: effectiveCaps, canWrite: !writeFlag.error && writeFlag.data === true && effectiveCaps.has("api.mcp.write") };
}
export function safeAuditArguments(args: Record<string, unknown>) {
  const result: Record<string, string | number> = {};
  for (const key of ["limit", "cursor", "du", "au", "montage_du", "montage_au", "fenetre"]) {
    const v = args[key]; if ((typeof v === "string" && v.length <= 40) || typeof v === "number") result[key] = v;
  }
  return result;
}
export function compactResult(value: unknown) {
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new ToolError("Réponse trop volumineuse : réduisez la période ou la limite.");
  return { content: [{ type: "text" as const, text }] };
}
export async function readTool(context: McpAppContext, name: ToolName, args: Record<string, unknown>, read: () => Promise<{ rows: unknown[]; [key: string]: unknown }>) {
  const start = Date.now();
  let status = "ok", count = 0, result;
  try {
    if (!context.caps.has(TOOL_CAPS[name])) { status = "refuse"; throw new ToolError("Droit métier insuffisant"); }
    const data = await read(); count = data.rows.length; result = compactResult(data);
  } catch (error) {
    if (status !== "refuse") status = "erreur";
    result = { ...compactResult({ error: error instanceof ToolError ? error.message : "Lecture indisponible" }), isError: true };
  }
  const audit = await context.db.from("mcp_audit_log").insert({ user_id: context.userId, client_id: context.clientId, tool: name, arguments: safeAuditArguments(args), nb_lignes: count, duree_ms: Date.now() - start, statut: status });
  if (audit.error) throw new ToolError("Journal indisponible : lecture interrompue");
  return result;
}