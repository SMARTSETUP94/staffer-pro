import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
import { createClient } from "@supabase/supabase-js";
import { Route } from "../../routes/api/public/hooks/poll-smart-inbox";

const handler = (Route as unknown as { server: { handlers: { POST: (arg: { request: Request }) => Promise<Response> } } }).server.handlers.POST;

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("poll SMART read-only contract", () => {
  it("only reads Outlook, skips moved duplicates on later pages, and never writes archived_outlook", async () => {
    for (const key of ["LOVABLE_API_KEY", "MICROSOFT_OUTLOOK_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PUBLISHABLE_KEY"]) vi.stubEnv(key, "test-key");
    vi.stubEnv("SUPABASE_URL", "https://example.com");
    const inserts: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    const existing = { id: "row-1", message_id_outlook: "old", internet_message_id: "<stable@example.com>", conversation_id: null, received_at: "2026-10-23T10:00:00Z", from_email: "client@example.com", subject: "Existing" };
    const builder = (table: string) => {
      const chain = {
        select: vi.fn(() => chain), in: vi.fn(() => chain), is: vi.fn(() => chain), eq: vi.fn(() => chain),
        update: vi.fn((value: Record<string, unknown>) => { updates.push(value); return chain; }),
        insert: vi.fn(async (value: Record<string, unknown>) => { inserts.push(value); return { error: null }; }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: table === "emails_entrants" ? [existing] : [], error: null })),
      };
      return chain;
    };
    vi.mocked(createClient).mockReturnValue({ from: builder } as unknown as ReturnType<typeof createClient>);
    const outlookCalls: Array<{ url: string; method: string }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("microsoft_outlook")) {
        outlookCalls.push({ url, method: init?.method ?? "GET" });
        if (url.includes("skiptoken")) return Response.json({ value: [{ id: "moved", internetMessageId: "<stable@example.com>" }] });
        return Response.json({ value: [{ id: "new", internetMessageId: "<new@example.com>" }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skiptoken=page2" });
      }
      return Response.json({ choices: [{ message: { content: JSON.stringify({ categorie: "autre", confiance: 1 }) } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await handler({ request: new Request("http://localhost/api/public/hooks/poll-smart-inbox", { method: "POST", headers: { apikey: "test-key" } }) });
    expect(await response.json()).toMatchObject({ fetched: 2, inserted: 1, errorsCount: 0 });
    expect(outlookCalls).toHaveLength(2);
    expect(outlookCalls.every((call) => call.method === "GET" && !call.url.includes("/move"))).toBe(true);
    expect(outlookCalls[0]?.url).toContain("internetMessageId");
    expect(inserts[0]?.internet_message_id).toBe("<new@example.com>");
    expect([...inserts, ...updates].some((value) => "archived_outlook" in value)).toBe(false);
  });
});