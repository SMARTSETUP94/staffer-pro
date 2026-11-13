/**
 * Relevé direct des boîtes partagées log@ et devis@ (flux séparés, sans smart@).
 * Auth : application Microsoft Entra dédiée (client credentials, lecture seule
 * volontaire — les emails restent dans la boîte de réception, aucun déplacement).
 * Appelé par pg_cron via /api/public/* — header `apikey` = publishable key requis.
 */
import { demandeDeCopie } from "@/lib/logistique/copie-formulaire";
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { loadFeedbackRows, exemplesPourMail } from "@/lib/logistique/ia-feedback";
import { classifySharedEmail, clsToMetadata, type SharedCls } from "@/lib/shared-inbox-classify";
import { resoudreTransfert } from '@/lib/forwarded-email';
import { findImportedEmail, type ImportedEmailIdentity } from '@/lib/inbox-smart-dedupe';

const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_FETCH = 25;

const MAILBOXES = [
  { address: "log@setup.paris", source: "logistique" as const },
  { address: "devis@setup.paris", source: "devis" as const },
];

type Msg = {
  id: string;
  internetMessageId?: string;
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
        const corrections = await loadFeedbackRows(supa);

        for (const box of MAILBOXES) {
          const errors: string[] = [];
          let inserted = 0;
          try {
            const url =
              `${GRAPH}/users/${box.address}/mailFolders/inbox/messages?$top=${MAX_FETCH}` +
              `&$orderby=receivedDateTime desc&$select=id,internetMessageId,conversationId,subject,bodyPreview,body,from,receivedDateTime,hasAttachments`;
            const res = await fetch(url, { headers: auth });
            if (!res.ok) throw new Error(`Graph ${res.status}: ${(await res.text()).slice(0, 300)}`);
            const messages = ((await res.json()) as { value?: Msg[] }).value ?? [];
            const { data: existing, error: lookupError } = await supa
              .from("emails_entrants")
              .select("id,message_id_outlook,internet_message_id,conversation_id,received_at,from_email,subject")
              .in("message_id_outlook", messages.map((m) => m.id));
            if (lookupError) throw lookupError;
            const ids=messages.map(m=>m.internetMessageId).filter((s):s is string=>!!s);
            const stable=ids.length ? await supa.from('emails_entrants').select('id,message_id_outlook,internet_message_id,conversation_id,received_at,from_email,subject').in('internet_message_id',ids) : {data:[],error:null};
            if(stable.error) throw stable.error;
            const known=[...(existing ?? []),...(stable.data ?? [])] as ImportedEmailIdentity[];

            for (const msg of messages) {
              const match=findImportedEmail({...msg,from:msg.from?.emailAddress},known);
              if(match.ambiguous) {errors.push('Identité email ambiguë');continue;}
              const identity={source_boite:box.source,from_email:msg.from?.emailAddress?.address ?? 'unknown@unknown',from_name:msg.from?.emailAddress?.name ?? null,subject:msg.subject ?? null,body_full:msg.body?.content ?? null};
              const correction=resoudreTransfert(identity);
              if(match.row){
                if(box.source==='devis') {
                  const {data:row,error:readErr}=await supa.from('emails_entrants').select('from_email,from_name,subject,body_full,source_boite,transmis_par,metadata_ia').eq('id',match.row.id).single();
                  if(readErr) throw readErr;
                  const patch=resoudreTransfert({...row,source_boite:'devis'});
                  const {error:upErr}=await supa.from('emails_entrants').update({source_boite:'devis',...(patch ?? {}),...(msg.internetMessageId ? {internet_message_id:msg.internetMessageId}: {})}).eq('id',match.row.id);
                  if(upErr) errors.push(upErr.message);
                }
                continue;
              }
              const copieDe = box.source === "logistique" ? demandeDeCopie(msg.subject, msg.body?.content) : null;
              if (copieDe) {
                const { data: dem } = await supa.from("emails_entrants").select("id").eq("id", copieDe).maybeSingle();
                if (dem) continue; // copie mail d'une demande « Formulaire » déjà enregistrée
              }
              let cls: SharedCls;
              let pj: { pieces: import("@/lib/ai/fournisseur.server").Partie[]; noms: string[]; erreurs: string[] } = { pieces: [], noms: [], erreurs: [] };
              if (box.source === "logistique" && msg.hasAttachments) {
                try {
                  const { lirePiecesJointesLogistique } = await import("@/lib/logistique/pieces-jointes-lecture.server");
                  pj = await lirePiecesJointesLogistique(token, box.address, msg.id);
                } catch (e) { pj.erreurs.push((e as Error).message.slice(0, 160)); }
                if (pj.erreurs.length) console.error(`[log@] pièces jointes ${msg.id} : ${pj.erreurs.join(" ; ")}`);
              }
              try {
                cls = await classifySharedEmail(
                  lovableKey,
                  {
                    fromName: correction?.from_name ?? identity.from_name,
                    fromEmail: correction?.from_email ?? identity.from_email,
                    subject: correction?.subject ?? identity.subject,
                    body: msg.body?.content,
                    bodyContentType: msg.body?.contentType,
                    bodyPreview: msg.bodyPreview,
                    receivedAt: msg.receivedDateTime,
                    pieces: pj.pieces,
                  },
                  box.source,
                  box.source === "logistique" ? exemplesPourMail(corrections, correction?.subject ?? identity.subject) : "",
                );
              } catch (e) {
                cls = { categorie: box.source === "devis" ? "opportunite" : "logistique", confiance: 0, resume: `AI failed: ${(e as Error).message}` };
              }
              const { error } = await supa.from("emails_entrants").insert({
                message_id_outlook: msg.id,
                internet_message_id:msg.internetMessageId ?? null,
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
                ...(correction ?? {}),
                metadata_ia: {...clsToMetadata(cls),...(correction?.metadata_ia ?? {}),...(pj.noms.length ? { pj_lues: pj.noms } : {}),...(pj.erreurs.length ? { pj_erreurs: pj.erreurs.slice(0, 3) } : {})},
                statut: "pending_review",
              });
              if (error) {
                errors.push(error.message);
                continue;
              }
              inserted++;
              // Les échéances restent des propositions dans « Demandes logistique » :
              // aucune étape n'est créée sans validation humaine.
            }
            report[box.address] = { fetched: messages.length, inserted, errors: errors.slice(0, 3) };
          } catch (e) {
            report[box.address] = { error: (e as Error).message };
          }
        }
        try {
          const { syncOutlookLogistique } = await import("@/lib/logistique/outlook-sync.server");
          report.outlook = await syncOutlookLogistique(supa);
        } catch (e) {
          report.outlook = { error: (e as Error).message };
        }
        // Relance du classement des pièces jointes : uniquement l'affaire déjà rattachée, auteur déjà inscrit
        // dans la trace (jamais choisi ici), au plus 3 tentatives, 5 demandes par passage. Outlook en lecture seule.
        try {
          const { doitRelancer } = await import("@/lib/pieces-jointes-classement");
          const { classerPiecesJointes } = await import("@/lib/server-fns/classement-pj.server");
          const { data: rows } = await supa.from("emails_entrants").select("id,opportunite_id,classement_pj")
            .eq("source_boite", "devis").not("opportunite_id", "is", null).eq("classement_pj->>etat", "a_reprendre").limit(20);
          const relances = (rows ?? []).filter((r: any) => doitRelancer(r)).slice(0, 5);
          const out: Record<string, string> = {};
          for (const r of relances as any[]) {
            try { out[r.id] = (await classerPiecesJointes(supa, r.id, r.classement_pj.rattache_par, { essais: 1 })).bilan.etat; }
            catch (e) { out[r.id] = `erreur: ${(e as Error).message.slice(0, 120)}`; }
          }
          report.classement_pj = out;
        } catch (e) {
          report.classement_pj = { error: (e as Error).message };
        }
        return Response.json({ ok: true, report });
      },
    },
  },
});
