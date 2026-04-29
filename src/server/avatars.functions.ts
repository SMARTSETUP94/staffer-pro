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
export const uploadAvatarServer = createServerFn({
  method: "POST",
  response: "data",
})
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
