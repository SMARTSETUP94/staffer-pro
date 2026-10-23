import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDocumentAffaireCode, validateEmailDocument } from "@/lib/affaire-document-rules";

export const saveEmailDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ emailId: z.string().uuid(), attachmentId: z.string().min(1), affaireId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed, error: capError } = await supabase.rpc("user_has_cap", { _cap: "demandes_clients.view" });
    const { data: canFile } = await supabase.rpc("user_has_cap", { _cap: "section.affaires" });
    if (capError || !allowed || !canFile) throw new Error("Classement des documents non autorisé");
    const { data: email, error: emailError } = await supabase.from("emails_entrants").select("id,subject,source_boite").eq("id", data.emailId).eq("source_boite", "devis").maybeSingle();
    if (emailError || !email) throw new Error("Demande client introuvable ou accès refusé");
    const { data: affaire, error: affaireError } = await supabase.from("affaires").select("id,numero").eq("id", data.affaireId).maybeSingle();
    if (affaireError || !affaire || !isDocumentAffaireCode(affaire.numero)) throw new Error("Affaire introuvable ou accès refusé");
    const { data: existing, error: existingError } = await supabase.from("affaire_documents").select("id").eq("affaire_id", data.affaireId).eq("source_email_id", data.emailId).eq("source_attachment_id", data.attachmentId).is("deleted_at", null).maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return { id: existing.id, alreadySaved: true, numero: affaire.numero };
    const { resolveMessage, getToken } = await import("@/lib/server-fns/shared-inbox-attachments.functions");
    const base = await resolveMessage(supabase, data.emailId);
    const token = await getToken();
    const response = await fetch(`${base}/attachments/${encodeURIComponent(data.attachmentId)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Lecture de la pièce jointe impossible (${response.status})`);
    const attachment = await response.json() as { name?: string; contentType?: string; contentBytes?: string; size?: number };
    if (!attachment.contentBytes) throw new Error("Cette pièce jointe est un lien ou un email joint, pas un fichier.");
    const mime = attachment.contentType ?? "application/octet-stream";
    validateEmailDocument(mime, attachment.size ?? Math.floor(attachment.contentBytes.length * 3 / 4));
    const bytes = Uint8Array.from(atob(attachment.contentBytes), (c) => c.charCodeAt(0));
    validateEmailDocument(mime, bytes.byteLength);
    const id = crypto.randomUUID();
    const filename = attachment.name ?? "piece-jointe";
    const ext = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "bin";
    const path = `${affaire.id}/${id}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("affaires-photos").upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    const { error: insertError } = await supabase.from("affaire_documents").insert({ id, affaire_id: affaire.id, storage_path: path, filename, mime_type: mime, taille_bytes: bytes.byteLength, uploaded_by: userId, description: `Email : ${email.subject ?? "Sans objet"}`, source_email_id: email.id, source_attachment_id: data.attachmentId });
    if (insertError) {
      // An unreferenced upload remains private; remove it when storage policy allows cleanup.
      await supabase.storage.from("affaires-photos").remove([path]);
      if (insertError.code === "23505") {
        const { data: saved } = await supabase.from("affaire_documents").select("id").eq("affaire_id", affaire.id).eq("source_email_id", email.id).eq("source_attachment_id", data.attachmentId).is("deleted_at", null).maybeSingle();
        if (saved) return { id: saved.id, alreadySaved: true, numero: affaire.numero };
      }
      throw new Error(insertError.message);
    }
    return { id, alreadySaved: false, numero: affaire.numero };
  });