import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Liste des commentaires d'un objet, plus récents d'abord. */
export const getObjetCommentaires = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ objetId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("objet_commentaires")
      .select("id, content, author_id, etape_id, created_at")
      .eq("objet_id", data.objetId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(`getObjetCommentaires: ${error.message}`);
    return { commentaires: rows ?? [] };
  });

/** Ajoute un commentaire (l'auteur est l'utilisateur courant). */
export const addObjetCommentaire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      objetId: z.string().uuid(),
      affaireId: z.string().uuid(),
      content: z.string().min(1).max(2000),
      etapeId: z.string().uuid().nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("objet_commentaires")
      .insert({
        objet_id: data.objetId,
        affaire_id: data.affaireId,
        author_id: userId,
        content: data.content,
        etape_id: data.etapeId ?? null,
      })
      .select("id, content, author_id, etape_id, created_at")
      .single();
    if (error) throw new Error(`addObjetCommentaire: ${error.message}`);
    return { commentaire: row };
  });

/** Supprime un commentaire (auteur ou admin via RLS). */
export const deleteObjetCommentaire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("objet_commentaires").delete().eq("id", data.id);
    if (error) throw new Error(`deleteObjetCommentaire: ${error.message}`);
    return { ok: true };
  });
