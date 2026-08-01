import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 Mo
const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 an
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Téléverse un avatar côté serveur (RLS storage scopée à l'utilisateur via le
 * client Supabase auth-injecté du middleware) et retourne l'URL signée 1 an.
 *
 * Usage côté client :
 *   const fd = new FormData();
 *   fd.append("file", file);
 *   const fn = useServerFn(uploadAvatarServer);
 *   const { signedUrl, path } = await fn({ data: fd });
 */
export const uploadAvatarServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) {
      throw new Error("FormData attendu (champ 'file').");
    }
    const file = input.get("file");
    if (!(file instanceof File)) {
      throw new Error("Champ 'file' manquant ou invalide.");
    }
    if (file.size === 0) {
      throw new Error("Fichier vide.");
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new Error("Image > 5 Mo.");
    }
    if (file.type && !ALLOWED_MIME.includes(file.type)) {
      throw new Error("Format non supporté (JPEG, PNG, WEBP, GIF).");
    }
    return { file };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { file } = data;

    const ext = (file.name.split(".").pop() || "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userId}/avatar-${Date.now()}.${ext}`;

    const buffer = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, buffer, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });
    if (upErr) {
      throw new Error(`Upload échoué : ${upErr.message}`);
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS);

    if (signErr || !signed?.signedUrl) {
      throw new Error(
        `Génération URL signée échouée : ${signErr?.message ?? "inconnue"}`
      );
    }

    return {
      path,
      signedUrl: signed.signedUrl,
      expiresInSeconds: AVATAR_SIGNED_URL_TTL_SECONDS,
    };
  });

/**
 * Régénère en masse les URLs signées de tous les avatars existants.
 * Réservé aux admins. Utilise `avatar_path` comme source de vérité ;
 * met à jour `avatar_url` avec une nouvelle URL signée 1 an.
 *
 * Retourne le nombre de profils traités, mis à jour, et en erreur.
 * Idempotent — peut être déclenché manuellement ou via cron annuel.
 */
export const regenerateAllAvatarUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Garde-fou admin (vérifié côté DB pour éviter toute confiance client).
    const { data: isAdminRow, error: roleErr } = await supabase
      .rpc("is_admin");
    if (roleErr) {
      throw new Error(`Vérification rôle échouée : ${roleErr.message}`);
    }
    if (!isAdminRow) {
      throw new Error("Accès refusé : admin requis.");
    }

    const { data: profiles, error: listErr } = await supabase
      .from("profiles")
      .select("id, avatar_path")
      .not("avatar_path", "is", null);

    if (listErr) {
      throw new Error(`Lecture profils échouée : ${listErr.message}`);
    }

    let updated = 0;
    const errors: Array<{ id: string; reason: string }> = [];

    for (const profile of profiles ?? []) {
      const path = profile.avatar_path;
      if (!path) continue;

      const { data: signed, error: signErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS);

      if (signErr || !signed?.signedUrl) {
        errors.push({
          id: profile.id,
          reason: signErr?.message ?? "URL signée vide",
        });
        continue;
      }

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: signed.signedUrl })
        .eq("id", profile.id);

      if (updErr) {
        errors.push({ id: profile.id, reason: updErr.message });
        continue;
      }

      updated += 1;
    }

    return {
      processed: profiles?.length ?? 0,
      updated,
      errored: errors.length,
      errors,
      triggeredBy: userId,
    };
  });
