import { describe, expect, it, vi } from "vitest";
import { createTanStackMcpHandler } from "@lovable.dev/mcp-js/stacks/tanstack";
import { defineMcp, defineTool } from "@lovable.dev/mcp-js";
import { checkMcpRateLimit, type ConsumeMcpQuota } from "../rate-limit";
import { readFileSync } from "node:fs";

function request(id = 1, token = "test-user-a") {
  return new Request("http://localhost:8080/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "mon_profil", arguments: { limit: 25, q: "private" } } }) });
}
// Deterministic model of the shared atomic RPC, including its refusal audit.
function quotaFixture() {
  let now = 0;
  const windows = new Map<string, number[]>();
  const audit: unknown[] = [];
  const consume: ConsumeMcpQuota = async (token, tool, args) => {
    const user = token.split(":")[0];
    const times = (windows.get(user) ?? []).filter(t => t > now - 60_000);
    if (times.length >= 60) {
      audit.push({ user_id: user, tool, arguments: args, nb_lignes: 0, statut: "rate_limited" });
      return { applicable: true, allowed: false, retry_after_seconds: Math.max(1, Math.ceil((times[0] + 60_000 - now) / 1000)) };
    }
    windows.set(user, [...times, now]);
    return { applicable: true, allowed: true, retry_after_seconds: 0 };
  };
  return { consume, audit, advance: (ms: number) => { now += ms; } };
}

describe("MCP per-user sliding-window quota", () => {
  it("allows 60 requests, refuses the 61st with HTTP 429, JSON-RPC id, Retry-After and rate_limited audit before dispatch", async () => {
    const quota = quotaFixture();
    const read = vi.fn(() => ({ content: [{ type: "text" as const, text: "{}" }] }));
    const server = defineMcp({ name: "quota-test", title: "Quota", version: "1", tools: [defineTool({ name: "mon_profil", description: "Lire", inputSchema: {}, handler: read })] });
    const dispatch = vi.fn(createTanStackMcpHandler(server));
    for (let i = 1; i <= 60; i++) expect(await checkMcpRateLimit(request(i), quota.consume)).toBeUndefined();
    const req = request(61);
    const limited = await checkMcpRateLimit(req, quota.consume);
    const response = limited ?? await dispatch({ request: req });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 61, error: { code: -32029, message: "limite atteinte, réessayez dans 60 s", data: { retry_after_seconds: 60 } } });
    expect(dispatch).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(quota.audit).toEqual([{ user_id: "test-user-a", tool: "mon_profil", arguments: { limit: 25 }, nb_lignes: 0, statut: "rate_limited" }]);
  });
  it("uses a rolling 60 seconds, not calendar minutes, and rejected requests do not extend the window", async () => {
    const q = quotaFixture();
    for (let i = 0; i < 30; i++) await checkMcpRateLimit(request(), q.consume);
    q.advance(30_000);
    for (let i = 0; i < 30; i++) await checkMcpRateLimit(request(), q.consume);
    q.advance(29_001);
    expect((await checkMcpRateLimit(request(), q.consume))?.headers.get("Retry-After")).toBe("1");
    q.advance(999);
    for (let i = 0; i < 30; i++) expect(await checkMcpRateLimit(request(), q.consume)).toBeUndefined();
    expect((await checkMcpRateLimit(request(), q.consume))?.headers.get("Retry-After")).toBe("30");
  });
  it("shares the quota across OAuth clients for one user, while isolating other users and parallel requests", async () => {
    const q = quotaFixture();
    const results = await Promise.all(Array.from({ length: 61 }, (_, i) => checkMcpRateLimit(request(i, `same-user:client-${i % 2}`), q.consume)));
    expect(results.filter(r => r?.status === 429)).toHaveLength(1);
    expect(await checkMcpRateLimit(request(1, "other-user:client-1"), q.consume)).toBeUndefined();
  });
  it("does not affect other paths, metadata, preflight or missing OAuth credentials", async () => {
    const consume = vi.fn();
    for (const req of [new Request("http://localhost:8080/", { method: "POST" }), new Request("http://localhost:8080/.well-known/oauth-protected-resource"), new Request("http://localhost:8080/mcp", { method: "OPTIONS" }), new Request("http://localhost:8080/mcp", { method: "POST" })]) expect(await checkMcpRateLimit(req, consume)).toBeUndefined();
    expect(consume).not.toHaveBeenCalled();
  });
  it("fails closed if the atomic quota or refusal audit is unavailable", async () => {
    const r = await checkMcpRateLimit(request(), async () => { throw new Error("database unavailable"); });
    expect(r?.status).toBe(503);
  });
  it("persists the concrete 60/60s rule under a per-user row lock with refusal audit in the same RPC", () => {
    const sql = readFileSync("drizzle/migrations/0026_mcp_sliding_window_rate_limit.sql", "utf8");
    expect(sql).toContain("v_user uuid := auth.uid()");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("t > v_now - interval '60 seconds'");
    expect(sql).toContain("cardinality(v_times) >= 60");
    expect(sql).toContain("INSERT INTO public.mcp_audit_log");
    expect(sql).toContain("'rate_limited'");
  });
});