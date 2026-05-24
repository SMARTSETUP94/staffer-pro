import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "fabrication-photos";
const SIGNED_TTL_SEC = 60 * 60; // 1h

/**
 * Liste les photos d'un objet avec signed URL pour preview + thumb.
 * RLS limite déjà la visibilité côté DB.
 */
export const getObjetPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ objetId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("fabrication_objets_photos")
      .select("id, storage_path, thumb_path, commentaire, width, height, size_bytes, uploaded_by, uploaded_at, etape_id")
      .eq("objet_id", data.objetId)
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(`getObjetPhotos: ${error.message}`);
    if (!rows || rows.length === 0) return { photos: [] };

    const paths = rows.flatMap((r) =>
      [r.storage_path, r.thumb_path].filter((p): p is string => !!p),
    );

    const { data: signed, error: sErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_TTL_SEC);

    if (sErr) throw new Error(`getObjetPhotos signed: ${sErr.message}`);

    const map = new Map<string, string>();
    signed?.forEach((s) => {
      if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
    });

    return {
      photos: rows.map((r) => ({
        ...r,
        signed_url: r.storage_path ? map.get(r.storage_path) ?? null : null,
        thumb_url: r.thumb_path ? map.get(r.thumb_path) ?? null : null,
      })),
    };
  });

/**
 * Enregistre une photo déjà uploadée dans le bucket (le client upload
 * directement via supabase-js + storage policy, puis appelle ce SF
 * pour matérialiser la ligne DB).
 */
export const registerObjetPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      objetId: z.string().uuid(),
      affaireId: z.string().uuid(),
      storagePath: z.string().min(1).max(500),
      thumbPath: z.string().min(1).max(500).nullish(),
      commentaire: z.string().max(500).nullish(),
      width: z.number().int().positive().nullish(),
      height: z.number().int().positive().nullish(),
      sizeBytes: z.number().int().positive().nullish(),
      etapeId: z.string().uuid().nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("fabrication_objets_photos")
      .insert({
        objet_id: data.objetId,
        affaire_id: data.affaireId,
        storage_path: data.storagePath,
        thumb_path: data.thumbPath ?? null,
        commentaire: data.commentaire ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
        size_bytes: data.sizeBytes ?? null,
        etape_id: data.etapeId ?? null,
        uploaded_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`registerObjetPhoto: ${error.message}`);
    return { id: row.id };
  });

/** Soft delete d'une photo. */
export const softDeleteObjetPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("fabrication_objets_photos")
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq("id", data.id);
    if (error) throw new Error(`softDeleteObjetPhoto: ${error.message}`);
    return { ok: true };
  });

/**
 * Génère un chemin de stockage canonique pour un upload :
 * {affaire_id}/{objet_id}/{uuid}-{filename}
 * (le bucket fabrication-photos est privé, RLS via affaire_id en préfixe).
 */
export function buildPhotoStoragePath(args: {
  affaireId: string;
  objetId: string;
  filename: string;
}): string {
  const safe = args.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const uid = crypto.randomUUID();
  return `${args.affaireId}/${args.objetId}/${uid}-${safe}`;
}
