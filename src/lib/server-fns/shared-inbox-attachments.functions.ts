/**
 * Pièces jointes des emails devis@ / log@ : lues à la demande depuis Microsoft
 * Graph (rien n'est stocké). L'accès à l'email est vérifié via RLS (client
 * de l'utilisateur) avant tout appel à Graph.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH = "https://graph.microsoft.com/v1.0";
const BOX: Record<string, string> = { logistique: "log@setup.paris", devis: "devis@setup.paris" };
const MAX_BYTES = 15 * 1024 * 1024;

async function getToken(): Promise<string> {
  const tenant = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const secret = process.env.MS_GRAPH_CLIENT_SECRET;
  if (!tenant || !clientId || !secret) throw new Error("Identifiants Microsoft manquants");
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: secret,
      scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Token Microsoft ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function resolveMessage(supabase: any, emailId: string) {
  const { data, error } = await supabase
    .from("emails_entrants").select("message_id_outlook, source_boite").eq("id", emailId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Email introuvable ou accès refusé");
  const box = BOX[data.source_boite as string];
  if (!box) throw new Error("Boîte non prise en charge");
  return `${GRAPH}/users/${encodeURIComponent(box)}/messages/${encodeURIComponent(data.message_id_outlook)}`;
}

export type EmailAttachment = { id: string; name: string; contentType: string; size: number; isInline: boolean };

export const listEmailAttachments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ emailId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<EmailAttachment[]> => {
    const base = await resolveMessage(context.supabase, data.emailId);
    const token = await getToken();
    const res = await fetch(`${base}/attachments?$select=id,name,contentType,size,isInline`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Microsoft ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { value: Array<Record<string, unknown>> };
    return json.value
      .filter((a) => a["@odata.type"] !== "#microsoft.graph.itemAttachment" || true)
      .map((a) => ({
        id: String(a.id), name: String(a.name ?? "pièce jointe"),
        contentType: String(a.contentType ?? "application/octet-stream"),
        size: Number(a.size ?? 0), isInline: !!a.isInline,
      }));
  });

export const getEmailAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ emailId: z.string().uuid(), attachmentId: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    const base = await resolveMessage(context.supabase, data.emailId);
    const token = await getToken();
    const res = await fetch(`${base}/attachments/${encodeURIComponent(data.attachmentId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Microsoft ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const a = (await res.json()) as { name?: string; contentType?: string; size?: number; contentBytes?: string };
    if (!a.contentBytes) throw new Error("Cette pièce jointe ne peut pas être téléchargée (email joint ou lien).");
    if ((a.size ?? 0) > MAX_BYTES) throw new Error("Pièce jointe trop volumineuse (> 15 Mo)");
    return { name: a.name ?? "piece-jointe", contentType: a.contentType ?? "application/octet-stream", base64: a.contentBytes };
  });
