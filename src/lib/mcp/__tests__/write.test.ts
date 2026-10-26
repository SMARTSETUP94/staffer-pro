import { describe, it, expect, vi } from "vitest";
import { auth, defineMcp } from "@lovable.dev/mcp-js";
import { createTanStackMcpHandler } from "@lovable.dev/mcp-js/stacks/tanstack";
import creer from "../tools/creer_opportunite";
import { argumentsHash, runWrite, safeDiff, WRITE_CAPS, type WritePreview } from "../write-policy";
import { writeSchemas } from "../write-schemas";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { generateKeyPair, exportJWK, SignJWT } from "jose";

const preview: WritePreview = { payload: { intitule: "Test" }, before: {}, after: { intitule: "Test" }, warnings: [], duplicates: [] };
function context() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const records = new Map<string, { hash: string; expires: number; done: boolean; payload: string }>();
  let businessWrites = 0; let now = 0;
  const rpc = vi.fn(async (name: string, args: Record<string, any>) => {
    if (name === "mcp_assert_write") return { data: "action.create_opportunite", error: null };
    if (name === "mcp_write_preview") { records.set("confirm", { hash: args._arguments_hash, expires: now + 600000, done: false, payload: JSON.stringify(args._payload) }); return { data: { confirmation_id: "confirm" }, error: null }; }
    const r = records.get(args._confirmation_id);
    if (!r || r.hash !== args._arguments_hash || r.payload !== JSON.stringify(args._payload)) return { data: { error: "arguments modifiés", statut: "refused" }, error: null };
    if (now >= r.expires) return { data: { error: "expirée", statut: "refused" }, error: null };
    if (!r.done) { r.done = true; businessWrites++; }
    return { data: { id: "created", statut: "executed" }, error: null };
  });
  return { ctx: { userId: "u", clientId: "c", canWrite: true, caps: new Set(["api.mcp.write", ...Object.values(WRITE_CAPS)]), writeScopes: new Set(Object.values(WRITE_CAPS)), db: { rpc, from: vi.fn(() => ({ insert })) } } as any, rpc, insert, writes: () => businessWrites, expire: () => { now = 600000; } };
}
describe("MCP controlled writes", () => {
  it("tools/list hides writes without api.mcp.write", async () => {
    const c = context(); c.ctx.caps.delete("api.mcp.write");
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const key = { ...await exportJWK(publicKey), kid: "test", alg: "ES256" };
    const token = await new SignJWT({ client_id: "test" }).setProtectedHeader({ alg: "ES256", kid: "test", typ: "JWT" }).setIssuer("https://auth.test").setAudience("authenticated").setSubject("test-user").setExpirationTime("5m").sign(privateKey);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ keys: [key] }));
    try {
      const handler = createTanStackMcpHandler(defineMcp({ name: "test", title: "Test", version: "2", instructions: "test", auth: auth.oauth.issuer({ issuer: "https://auth.test", jwksUri: "https://auth.test/jwks", acceptedAudiences: "authenticated" }), tools: [creer], createAppContext: async () => c.ctx }));
      const r = await handler({ request: new Request("http://localhost:8080/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }) });
      const body = await r.text(); expect(r.status).toBe(200); expect(body).toContain('"tools":[]');
    } finally { fetchMock.mockRestore(); }
  });
  it("preview makes zero business writes", async () => { const c = context(); await runWrite(c.ctx, "creer_opportunite", { intitule: "Test" }, async () => preview); expect(c.writes()).toBe(0); expect(c.rpc).toHaveBeenCalledWith("mcp_write_preview", expect.anything()); expect(c.rpc).not.toHaveBeenCalledWith("mcp_execute_write_locked", expect.anything()); });
  it("confirmation executes once even when retried", async () => { const c = context(); const args = { intitule: "Test" }; await runWrite(c.ctx, "creer_opportunite", args, async () => preview); await runWrite(c.ctx, "creer_opportunite", { ...args, confirmation_id: "confirm" }, async () => preview); await runWrite(c.ctx, "creer_opportunite", { ...args, confirmation_id: "confirm" }, async () => preview); expect(c.writes()).toBe(1); });
  it("confirmation expires at 10 minutes", async () => { const c = context(); await runWrite(c.ctx, "creer_opportunite", { intitule: "Test" }, async () => preview); c.expire(); const r = await runWrite(c.ctx, "creer_opportunite", { intitule: "Test", confirmation_id: "confirm" }, async () => preview); expect(r).toHaveProperty("isError", true); expect(c.writes()).toBe(0); });
  it("changed arguments refuse confirmation", async () => { const c = context(); await runWrite(c.ctx, "creer_opportunite", { intitule: "Test" }, async () => preview); const r = await runWrite(c.ctx, "creer_opportunite", { intitule: "Different", confirmation_id: "confirm" }, async () => preview); expect(r).toHaveProperty("isError", true); expect(c.writes()).toBe(0); });
  it("missing affaire access refuses before preview persistence", async () => { const c = context(); const prepare = vi.fn().mockRejectedValue(new Error("Accès affaire refusé")); await runWrite(c.ctx, "modifier_chantier", {}, prepare); expect(c.rpc).not.toHaveBeenCalledWith("mcp_write_preview", expect.anything()); expect(c.insert).toHaveBeenCalledWith(expect.objectContaining({ statut: "refused" })); });
  it("hash ignores confirmation and object key order, not content", async () => { expect(await argumentsHash({ a: 1, nested: { b: 2, a: 1 } })).toBe(await argumentsHash({ nested: { a: 1, b: 2 }, a: 1, confirmation_id: "x" })); expect(await argumentsHash({ a: 1 })).not.toBe(await argumentsHash({ a: 2 })); });
  it("sensitive diff text never enters audit", () => { expect(safeDiff({}, { contact_site_tel: "private", notes: "private", date_montage: "2026-10-27" })).toEqual({ contact_site_tel: { modifie: true }, notes: { modifie: true }, date_montage: { avant: null, apres: "2026-10-27" } }); });
  it("signature and unlisted fields cannot enter schemas", () => { expect(() => z.object(writeSchemas.mettre_a_jour_opportunite).parse({ affaire_id: "00000000-0000-4000-8000-000000000001", champs: { numero: "6001" } })).toThrow(); expect(() => z.object(writeSchemas.modifier_etape_logistique).parse({ etape_id: "00000000-0000-4000-8000-000000000001", champs: { statut: "annule" } })).toThrow(); });
  const migration = readFileSync("drizzle/migrations/0029_mcp_v2_confirmations.sql", "utf8");
  it("external key uniqueness and serialized lookup prevent duplicate creation", () => { expect(migration).toContain("PRIMARY KEY(tool,key_hash)"); expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(_tool||kh,0))"); expect(migration).toContain("doublon_cle_externe"); });
  it("preview and execution are transactionally audited", () => { expect(migration).toContain("'preview',cid"); expect(migration).toContain("'executed',c.id"); expect(migration).toContain("FOR UPDATE"); });
  it("write SQL contains no physical delete", () => { expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i); expect(readFileSync("drizzle/migrations/0028_mcp_v2_shared_app_paths.sql", "utf8")).not.toMatch(/\bDELETE\s+FROM\b/i); });
});