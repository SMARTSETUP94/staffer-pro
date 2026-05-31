/**
 * Polling smart@setup.paris : Outlook (via gateway) → Lovable AI (classifier)
 *   → emails_entrants (pending_review) → archive Outlook.
 *
 * Appelé par pg_cron toutes les 5 min via /api/public/* (auth bypass).
 * Sécurité : header `apikey` = SUPABASE_PUBLISHABLE_KEY requis.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const OUTLOOK_GW = "https://connector-gateway.lovable.dev/microsoft_outlook";
const AI_GW = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MAX_FETCH = 25;

type OutlookMessage = {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  hasAttachments?: boolean;
};

type Classification = {
  categorie: "candidature" | "opportunite" | "pub" | "autre";
  confiance: number;
  metier?: string | null;
  poste_devine?: string | null;
  nom?: string | null;
  prenom?: string | null;
  resume?: string | null;
};

async function classifyEmail(lovableKey: string, msg: OutlookMessage): Promise<Classification> {
  const sys =
    "Tu tries des emails entrants pour une société de scénographie événementielle (SETUP Paris). " +
    "Classe chaque email en une des 4 catégories : " +
    "'candidature' (CV, lettre de motivation, demande d'emploi), " +
    "'opportunite' (demande de devis, appel d'offres, projet client), " +
    "'pub' (newsletter, publicité, prospection commerciale sortante reçue, spam), " +
    "'autre' (le reste). " +
    "Si candidature, devine le métier parmi : construction, métallerie, peinture, numérique, tapisserie, machiniste, logistique, suivi_projet. " +
    "Réponds STRICTEMENT en JSON.";

  const userMsg = `Expéditeur: ${msg.from?.emailAddress?.name ?? ""} <${msg.from?.emailAddress?.address ?? ""}>
Sujet: ${msg.subject ?? ""}
Aperçu: ${msg.bodyPreview ?? ""}`;

  const body = {
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userMsg },
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
            categorie: { type: "string", enum: ["candidature", "opportunite", "pub", "autre"] },
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
  };

  const res = await fetch(AI_GW, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Lovable-AIG-SDK": "raw-fetch",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 200)}`);
  }
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = j.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(content) as Classification;
}

async function archiveOutlookMessage(lovableKey: string, connectorKey: string, messageId: string) {
  // Resolve archive folder id (well-known name "archive")
  const res = await fetch(`${OUTLOOK_GW}/me/messages/${messageId}/move`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectorKey,
    },
    body: JSON.stringify({ destinationId: "archive" }),
  });
  return res.ok;
}

async function fetchInbox(lovableKey: string, connectorKey: string): Promise<OutlookMessage[]> {
  const url =
    `${OUTLOOK_GW}/me/mailFolders/inbox/messages` +
    `?$top=${MAX_FETCH}` +
    `&$orderby=receivedDateTime desc` +
    `&$select=id,conversationId,subject,bodyPreview,body,from,receivedDateTime,hasAttachments`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectorKey,
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Outlook gateway ${res.status}: ${txt.slice(0, 200)}`);
  }
  const j = (await res.json()) as { value?: OutlookMessage[] };
  return j.value ?? [];
}

export const Route = createFileRoute("/api/public/hooks/poll-smart-inbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!publishable || apikey !== publishable) {
          return new Response("Unauthorized", { status: 401 });
        }
        const lovableKey = process.env.LOVABLE_API_KEY;
        const connectorKey = process.env.MICROSOFT_OUTLOOK_API_KEY;
        const supaUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!lovableKey || !connectorKey || !supaUrl || !serviceKey) {
          return new Response(
            JSON.stringify({ error: "Missing env (LOVABLE_API_KEY / MICROSOFT_OUTLOOK_API_KEY / SUPABASE_*)" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const supa = createClient(supaUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const startedAt = new Date().toISOString();
        let processed = 0;
        let inserted = 0;
        let archived = 0;
        let errors: string[] = [];

        try {
          const messages = await fetchInbox(lovableKey, connectorKey);

          // Dedupe via UNIQUE(message_id_outlook)
          const ids = messages.map((m) => m.id);
          const { data: existing } = await supa
            .from("emails_entrants")
            .select("message_id_outlook")
            .in("message_id_outlook", ids);
          const existingSet = new Set((existing ?? []).map((r) => r.message_id_outlook));

          const news = messages.filter((m) => !existingSet.has(m.id));

          for (const msg of news) {
            processed++;
            try {
              let cls: Classification;
              try {
                cls = await classifyEmail(lovableKey, msg);
              } catch (e) {
                cls = { categorie: "autre", confiance: 0, resume: `AI failed: ${(e as Error).message}` };
              }

              const { error: insErr } = await supa.from("emails_entrants").insert({
                message_id_outlook: msg.id,
                conversation_id: msg.conversationId ?? null,
                from_email: msg.from?.emailAddress?.address ?? "unknown@unknown",
                from_name: msg.from?.emailAddress?.name ?? null,
                subject: msg.subject ?? null,
                received_at: msg.receivedDateTime ?? new Date().toISOString(),
                body_preview: msg.bodyPreview ?? null,
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
              if (insErr) {
                errors.push(`insert ${msg.id}: ${insErr.message}`);
                continue;
              }
              inserted++;

              // Auto-archive Outlook quel que soit le tri (pubs / autre / etc.)
              // — le tri reste fait côté app via pending_review.
              const ok = await archiveOutlookMessage(lovableKey, connectorKey, msg.id);
              if (ok) {
                archived++;
                await supa
                  .from("emails_entrants")
                  .update({ archived_outlook: true })
                  .eq("message_id_outlook", msg.id);
              }
            } catch (e) {
              errors.push(`msg ${msg.id}: ${(e as Error).message}`);
            }
          }

          await supa
            .from("inbox_smart_settings")
            .update({
              last_poll_at: startedAt,
              last_poll_count: inserted,
              last_poll_error: errors.length > 0 ? errors.slice(0, 5).join(" | ") : null,
            })
            .eq("id", 1);

          return Response.json({
            ok: true,
            startedAt,
            fetched: messages.length,
            processed,
            inserted,
            archived,
            errorsCount: errors.length,
            errors: errors.slice(0, 5),
          });
        } catch (e) {
          const msg = (e as Error).message;
          await supa
            .from("inbox_smart_settings")
            .update({ last_poll_at: startedAt, last_poll_error: msg })
            .eq("id", 1);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
