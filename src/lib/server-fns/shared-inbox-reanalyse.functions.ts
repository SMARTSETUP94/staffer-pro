/**
 * Relance admin de l'analyse IA sur les emails devis@ / log@ déjà importés.
 * Relit body_full et met à jour metadata_ia (+ confiance_ia). Ne touche pas
 * à la catégorie ni au statut (préserve les reclassements manuels).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadFeedbackPrompt } from "@/lib/logistique/ia-feedback";
import { classifySharedEmail, clsToMetadata, type SharedSource } from "@/lib/shared-inbox-classify";

export const reanalyseSharedInboxes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ limit: z.number().int().min(1).max(200).default(60) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) throw new Error("Réservé aux administrateurs");
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Configuration IA manquante");

    const { data: rows, error } = await supabase
      .from("emails_entrants")
      .select("id, source_boite, from_email, from_name, subject, body_full, body_content_type, body_preview")
      .in("source_boite", ["devis", "logistique"])
      .order("received_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const exemples = await loadFeedbackPrompt(supabase);
    let updated = 0;
    const errors: string[] = [];
    const list = rows ?? [];
    for (let i = 0; i < list.length; i += 4) {
      await Promise.all(
        list.slice(i, i + 4).map(async (r) => {
          try {
            const cls = await classifySharedEmail(
              key,
              {
                fromName: r.from_name,
                fromEmail: r.from_email,
                subject: r.subject,
                body: r.body_full,
                bodyContentType: r.body_content_type,
                bodyPreview: r.body_preview,
              },
              r.source_boite as SharedSource,
              exemples,
            );
            const { error: upErr } = await supabase
              .from("emails_entrants")
              .update({ metadata_ia: clsToMetadata(cls), confiance_ia: cls.confiance })
              .eq("id", r.id);
            if (upErr) errors.push(upErr.message);
            else updated++;
          } catch (e) {
            errors.push((e as Error).message);
          }
        }),
      );
    }
    return { total: list.length, updated, errors: errors.slice(0, 3) };
  });
