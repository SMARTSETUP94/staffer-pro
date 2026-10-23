/**
 * Polling smart@setup.paris : Outlook (via gateway) → Lovable AI (classifier)
 *   → emails_entrants (pending_review). Outlook is strictly read-only.
 *
 * Appelé par pg_cron toutes les 5 min via /api/public/* (auth bypass).
 * Sécurité : header `apikey` = SUPABASE_PUBLISHABLE_KEY requis.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { findImportedEmail, type ImportedEmailIdentity } from "@/lib/inbox-smart-dedupe";

const OUTLOOK_GW = "https://connector-gateway.lovable.dev/microsoft_outlook";
const AI_GW = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MAX_FETCH = 25;

type Recipient = { emailAddress?: { name?: string; address?: string } };

type OutlookMessage = {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: Recipient["emailAddress"];
  toRecipients?: Recipient[];
  ccRecipients?: Recipient[];
  receivedDateTime?: string;
  hasAttachments?: boolean;
};

type SourceBoite = "smart" | "logistique" | "devis";

/**
 * Boîte d'origine : les règles Exchange redirigent log@ et devis@ vers
 * smart@setup.paris en conservant le destinataire initial dans To/Cc.
 */
function detectSourceBoite(msg: OutlookMessage): SourceBoite {
  const addrs = [...(msg.toRecipients ?? []), ...(msg.ccRecipients ?? [])]
    .map((r) => r.emailAddress?.address?.toLowerCase() ?? "");
  if (addrs.some((a) => a === "log@setup.paris")) return "logistique";
  if (addrs.some((a) => a === "devis@setup.paris")) return "devis";
  return "smart";
}

type Classification = {
  categorie: "candidature" | "opportunite" | "pub" | "logistique" | "autre";
  confiance: number;
  metier?: string | null;
  poste_devine?: string | null;
  nom?: string | null;
  prenom?: string | null;
  resume?: string | null;
};

async function classifyEmail(
  lovableKey: string,
  msg: OutlookMessage,
  sourceBoite: SourceBoite,
): Promise<Classification> {
  const sourceHint =
    sourceBoite === "devis"
      ? "Cet email arrive sur devis@setup.paris, la boîte des demandes clients : privilégie 'opportunite' sauf évidence contraire. "
      : sourceBoite === "logistique"
        ? "Cet email arrive sur log@setup.paris, la boîte logistique : privilégie 'logistique' sauf évidence contraire. "
        : "";
  const sys =
    "Tu tries des emails entrants pour une société de scénographie événementielle (SETUP Paris). " +
    sourceHint +
    "Classe chaque email en une des 5 catégories : " +
    "'candidature' (CV, lettre de motivation, demande d'emploi), " +
    "'opportunite' (demande de devis, appel d'offres, projet client), " +
    "'logistique' (information logistique : transport, livraison, enlèvement, accès site, horaires de chargement), " +
    "'pub' (newsletter, publicité, prospection commerciale sortante reçue, spam), " +
    "'autre' (le reste). " +
    "Si candidature, devine le métier parmi : construction, métallerie, peinture, numérique, tapisserie, machiniste, logistique, suivi_projet. " +
    "Réponds STRICTEMENT en JSON.";

  const userMsg = `Expéditeur: ${msg.from?.name ?? ""} <${msg.from?.address ?? ""}>
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
            categorie: {
              type: "string",
              enum: ["candidature", "opportunite", "pub", "logistique", "autre"],
            },
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

async function fetchInbox(lovableKey: string, connectorKey: string): Promise<OutlookMessage[]> {
  let url: string | undefined =
    `${OUTLOOK_GW}/me/mailFolders/inbox/messages` +
    `?$top=${MAX_FETCH}` +
    `&$orderby=receivedDateTime desc` +
    `&$select=id,internetMessageId,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments`;
  const messages: OutlookMessage[] = [];
  // Without moving emails, all pages must be read, not just the newest 25.
  while (url) {
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
  const j = (await res.json()) as { value?: OutlookMessage[]; "@odata.nextLink"?: string };
  messages.push(...(j.value ?? []));
  const next = j["@odata.nextLink"];
  // Graph nextLink points to Graph, but credentials must stay on the gateway.
  if (next) {
    const parsed = new URL(next);
    if (parsed.origin !== "https://graph.microsoft.com" && parsed.origin !== new URL(OUTLOOK_GW).origin) {
      throw new Error("Unexpected Outlook pagination origin");
    }
    url = parsed.origin === "https://graph.microsoft.com"
      ? `${OUTLOOK_GW}${parsed.pathname.replace(/^\/v1\.0/, "")}${parsed.search}`
      : next;
  } else {
    url = undefined;
  }
  }
  return messages;
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
        let errors: string[] = [];

        try {
          const messages = await fetchInbox(lovableKey, connectorKey);

          // Chunked lookups avoid URL-size and Data API row-limit truncation.
          const existing: ImportedEmailIdentity[] = [];
          const identitySelect = "id,message_id_outlook,internet_message_id,conversation_id,received_at,from_email,subject";
          for (let start = 0; start < messages.length; start += 25) {
            const batch = messages.slice(start, start + 25);
            const lookups = [
              supa.from("emails_entrants").select(identitySelect).in("message_id_outlook", batch.map((m) => m.id)),
              supa.from("emails_entrants").select(identitySelect).in("internet_message_id", batch.map((m) => m.internetMessageId?.trim()).filter((id): id is string => !!id)),
              supa.from("emails_entrants").select(identitySelect).is("internet_message_id", null).in("received_at", batch.map((m) => m.receivedDateTime).filter((date): date is string => !!date)),
            ];
            for (const result of await Promise.all(lookups)) {
              if (result.error) throw new Error(`Email dedupe lookup failed: ${result.error.message}`);
              existing.push(...(result.data ?? []) as ImportedEmailIdentity[]);
            }
          }
          const known = [...new Map(existing.map((row) => [row.id, row])).values()];

          for (const msg of messages) {
            const match = findImportedEmail(msg, known);
            if (match.ambiguous) {
              errors.push(`Ambiguous historical email ${msg.id}: import skipped`);
              continue;
            }
            if (match.row) {
              if (!match.row.internet_message_id && msg.internetMessageId?.trim()) {
                const stableId = msg.internetMessageId.trim();
                const { error } = await supa.from("emails_entrants")
                  .update({ internet_message_id: stableId })
                  .eq("id", match.row.id).is("internet_message_id", null);
                if (error) errors.push(`Email identity backfill ${msg.id}: ${error.message}`);
                else match.row.internet_message_id = stableId;
              }
              continue;
            }
            processed++;
            try {
              const sourceBoite = detectSourceBoite(msg);
              let cls: Classification;
              try {
                cls = await classifyEmail(lovableKey, msg, sourceBoite);
              } catch (e) {
                cls = { categorie: "autre", confiance: 0, resume: `AI failed: ${(e as Error).message}` };
              }

              const { error: insErr } = await supa.from("emails_entrants").insert({
                message_id_outlook: msg.id,
                internet_message_id: msg.internetMessageId?.trim() || null,
                conversation_id: msg.conversationId ?? null,
                source_boite: sourceBoite,
                from_email: msg.from?.address ?? "unknown@unknown",
                from_name: msg.from?.name ?? null,
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
              if (insErr) {
                // A concurrent poll may already have inserted either identity.
                if (insErr.code === "23505") continue;
                errors.push(`insert ${msg.id}: ${insErr.message}`);
                continue;
              }
              inserted++;
              known.push({
                id: msg.id,
                message_id_outlook: msg.id,
                internet_message_id: msg.internetMessageId?.trim() || null,
                conversation_id: msg.conversationId ?? null,
                received_at: msg.receivedDateTime ?? startedAt,
                from_email: msg.from?.address ?? "unknown@unknown",
                subject: msg.subject ?? null,
              });
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
