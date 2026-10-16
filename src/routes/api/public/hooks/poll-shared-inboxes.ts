/**
 * Relevé direct des boîtes partagées log@ et devis@ (flux séparés, sans smart@).
 * Auth : application Microsoft Entra dédiée (client credentials, lecture seule
 * volontaire — les emails restent dans la boîte de réception, aucun déplacement).
 * Appelé par pg_cron via /api/public/* — header `apikey` = publishable key requis.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { loadFeedbackPrompt } from "@/lib/logistique/ia-feedback";
import { classifySharedEmail, clsToMetadata, type SharedCls } from "@/lib/shared-inbox-classify";

const GRAPH = "https://graph.microsoft.com/v1.0";
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
        const exemples = await loadFeedbackPrompt(supa);

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
              let cls: SharedCls;
              try {
                cls = await classifySharedEmail(
                  lovableKey,
                  {
                    fromName: msg.from?.emailAddress?.name,
                    fromEmail: msg.from?.emailAddress?.address,
                    subject: msg.subject,
                    body: msg.body?.content,
                    bodyContentType: msg.body?.contentType,
                    bodyPreview: msg.bodyPreview,
                  },
                  box.source,
                  exemples,
                );
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
                metadata_ia: clsToMetadata(cls),
                statut: "pending_review",
              });
              if (error) {
                errors.push(error.message);
                continue;
              }
              inserted++;
              // Échéances de chantier détectées → propositions d'étapes logistiques
              const echeances = (cls.echeances ?? []).filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date ?? ""));
              if (echeances.length > 0) {
                const numeros = [...new Set(echeances.map((e) => e.affaire_numero).filter((n): n is string => !!n))];
                const affaireByNumero = new Map<string, string>();
                if (numeros.length > 0) {
                  const { data: affs } = await supa.from("affaires").select("id, numero").in("numero", numeros);
                  for (const a of affs ?? []) affaireByNumero.set(a.numero, a.id);
                }
                const rows = echeances
                  .filter((e) => e.affaire_numero && affaireByNumero.has(e.affaire_numero))
                  .map((e) => ({
                    affaire_id: affaireByNumero.get(e.affaire_numero!)!,
                    type: e.type ?? "livraison",
                    date_debut: e.date,
                    contenu: e.libelle,
                    statut: "propose",
                    origine: "jalonnement",
                    note: `Détecté dans un email ${box.address} : « ${(msg.subject ?? "").slice(0, 120)} »`,
                  }));
                if (rows.length > 0) {
                  const { error: eErr } = await supa.from("affaire_etapes_logistiques").insert(rows);
                  if (eErr) errors.push(`etapes: ${eErr.message}`);
                }
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
