/**
 * Rattache les pièces jointes d'une demande « Formulaire » au chantier de l'étape créée.
 * Tout passe sous les droits de l'utilisateur (RLS) ; une pièce n'est jamais rattachée deux fois.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", png: "image/png" };

export const rattacherFichiersDemande = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ emailId: z.string().uuid(), affaireId: z.string().uuid(), etapes: z.string().max(300) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: email, error } = await supabase.from("emails_entrants").select("id,subject,metadata_ia").eq("id", data.emailId).maybeSingle();
    if (error || !email) throw new Error("Demande introuvable ou accès refusé");
    const chemins = ((email.metadata_ia as { fichiers?: string[] } | null)?.fichiers ?? []).filter((c) => c.startsWith(`${email.id}/`)).slice(0, 5);
    let ajoutes = 0;
    for (const chemin of chemins) {
      const { data: deja } = await supabase.from("affaire_documents").select("id").eq("affaire_id", data.affaireId).eq("source_email_id", email.id).eq("source_attachment_id", chemin).is("deleted_at", null).maybeSingle();
      if (deja) continue;
      const ext = chemin.split(".").pop() ?? "";
      const mime = MIME[ext];
      if (!mime) continue;
      const { data: blob, error: e1 } = await supabase.storage.from("demandes-logistique").download(chemin);
      if (e1 || !blob) throw new Error("Lecture de la pièce jointe impossible");
      const id = crypto.randomUUID();
      const path = `${data.affaireId}/${id}.${ext}`;
      const { error: e2 } = await supabase.storage.from("affaires-photos").upload(path, blob, { contentType: mime, upsert: false });
      if (e2) throw new Error(e2.message);
      const { error: e3 } = await supabase.from("affaire_documents").insert({
        id, affaire_id: data.affaireId, storage_path: path, filename: `demande-logistique-${ajoutes + 1}.${ext}`,
        mime_type: mime, taille_bytes: blob.size, uploaded_by: userId, categorie: "logistique",
        description: `Demande logistique — ${data.etapes}`, source_email_id: email.id, source_attachment_id: chemin,
      });
      if (e3) { await supabase.storage.from("affaires-photos").remove([path]); if (e3.code !== "23505") throw new Error(e3.message); continue; }
      ajoutes++;
    }
    return { ajoutes };
  });
