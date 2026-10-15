/**
 * Relevé direct des boîtes partagées log@ et devis@ (flux séparés, sans smart@).
 * Auth : application Microsoft Entra dédiée (client credentials, permission
 * application Mail.ReadWrite, restreinte via ApplicationAccessPolicy).
 * Appelé par pg_cron via /api/public/* — header `apikey` = publishable key requis.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const AI_GW = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MAX_FETCH = 25;

const MAILBOXES = [
  { address: "log@setup.paris", source: "logistique" as const },
  { address: "devis@setup.paris", source: "devis" as const },
];

type Msg = {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  hasAttachments?: boolean;
};

type Cls = {
  categorie: "candidature" | "opportunite" | "pub" | "logistique" | "autre";
  confiance: number;
  metier?: string | null;
  poste_devine?: string | null;
  nom?: string | null;
  prenom?: string | null;
  resume?: string | null;
};

async function getToken(): Promise<string> {
  const tenant = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const secret = process.env.MS_GRAPH_CLIENT_SECRET;
  if (!tenant || !clientId || !secret) throw new Error("Identifiants Microsoft manquants");
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Token Microsoft ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function classify(key: string, msg: Msg, source: "logistique" | "devis"): Promise<Cls> {
  const hint =
    source === "devis"
      ? "Cet email arrive sur devis@setup.paris, la boîte des demandes clients : privilégie 'opportunite' sauf évidence contraire. "
      : "Cet email arrive sur log@setup.paris, la boîte logistique : privilégie 'logistique' sauf évidence contraire. ";
  const sys =
    "Tu tries des emails entrants pour une société de scénographie événementielle (SETUP Paris). " +
    hint +
    "Catégories : 'candidature', 'opportunite' (demande de devis, projet client), 'logistique' (transport, livraison, enlèvement, accès site, horaires), 'pub', 'autre'. " +
    "Si candidature, devine le métier parmi : construction, métallerie, peinture, numérique, tapisserie, machiniste, logistique, suivi_projet. Réponds STRICTEMENT en JSON.";
  const res = await fetch(AI_GW, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "raw-fetch" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: `Expéditeur: ${msg.from?.emailAddress?.name ?? ""} <${msg.from?.emailAddress?.address ?? ""}>\nSujet: ${msg.subject ?? ""}\nAperçu: ${msg.bodyPreview ?? ""}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "email_classification",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              categorie: { type: "string", enum: ["candidature", "opportunite", "pub", "logistique", "autre"] },
              confiance: { type: "number", minimum: 0, maximum: 1 },
              metier: { type: ["string", "null"] },
              poste_devine: { type: ["string", "null"] },
              nom: { type: ["string", "null"] },
              prenom: { type: ["string", "null"] },
              resume: { type: ["string", "null"] },
            },
            required: ["categorie", "confiance", "metier", "poste_devine", "nom", "prenom", "resume"],
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as Cls;
}

export const Route = createFileRoute("/api/public/hooks/poll-shared-inboxes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!publishable || request.headers.get("apikey") !== publishable) {
          return new Response("Unauthorized", { status: 401 });
        }
        const lovableKey = process.env.LOVABLE_API_KEY;
        const supaUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!lovableKey || !supaUrl || !serviceKey) {
          return Response.json({ ok: false, error: "Missing env" }, { status: 500 });
        }
        const supa = createClient(supaUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
        const report: Record<string, unknown> = {};
        let token: string;
        try {
          token = await getToken();
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
        const auth = { Authorization: `Bearer ${token}` };

        for (const box of MAILBOXES) {
          const errors: string[] = [];
          let inserted = 0;
          try {
            const url =
              `${GRAPH}/users/${box.address}/mailFolders/inbox/messages?$top=${MAX_FETCH}` +
              `&$orderby=receivedDateTime desc&$select=id,conversationId,subject,bodyPreview,body,from,receivedDateTime,hasAttachments`;
            const res = await fetch(url, { headers: auth });
            if (!res.ok) throw new Error(`Graph ${res.status}: ${(await res.text()).slice(0, 300)}`);
            const messages = ((await res.json()) as { value?: Msg[] }).value ?? [];
            const { data: existing } = await supa
              .from("emails_entrants")
              .select("message_id_outlook")
              .in("message_id_outlook", messages.map((m) => m.id));
            const seen = new Set((existing ?? []).map((r) => r.message_id_outlook));

            for (const msg of messages.filter((m) => !seen.has(m.id))) {
              let cls: Cls;
              try {
                cls = await classify(lovableKey, msg, box.source);
              } catch (e) {
                cls = { categorie: box.source === "devis" ? "opportunite" : "logistique", confiance: 0, resume: `AI failed: ${(e as Error).message}` };
              }
              const { error } = await supa.from("emails_entrants").insert({
                message_id_outlook: msg.id,
                conversation_id: msg.conversationId ?? null,
                source_boite: box.source,
                from_email: msg.from?.emailAddress?.address ?? "unknown@unknown",
                from_name: msg.from?.emailAddress?.name ?? null,
                subject: msg.subject ?? null,
                received_at: msg.receivedDateTime ?? new Date().toISOString(),
                body_preview: msg.bodyPreview ?? null,
                body_full: msg.body?.content ?? null,
                body_content_type: msg.body?.contentType ?? null,
                has_attachments: !!msg.hasAttachments,
                categorie_ia: cls.categorie,
                confiance_ia: cls.confiance,
                metadata_ia: {
                  metier: cls.metier ?? null,
                  poste_devine: cls.poste_devine ?? null,
                  nom: cls.nom ?? null,
                  prenom: cls.prenom ?? null,
                  resume: cls.resume ?? null,
                },
                statut: "pending_review",
              });
              if (error) {
                errors.push(error.message);
                continue;
              }
              inserted++;
              const mv = await fetch(`${GRAPH}/users/${box.address}/messages/${msg.id}/move`, {
                method: "POST",
                headers: { ...auth, "Content-Type": "application/json" },
                body: JSON.stringify({ destinationId: "archive" }),
              });
              if (mv.ok) {
                const moved = (await mv.json()) as { id?: string };
                await supa.from("emails_entrants").update({ archived_outlook: true }).eq("message_id_outlook", msg.id);
                void moved;
              }
            }
            report[box.address] = { fetched: messages.length, inserted, errors: errors.slice(0, 3) };
          } catch (e) {
            report[box.address] = { error: (e as Error).message };
          }
        }
        return Response.json({ ok: true, report });
      },
    },
  },
});
