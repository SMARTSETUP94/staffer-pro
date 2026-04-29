import { supabase } from "@/integrations/supabase/client";

export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 Mo
export const AVATAR_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 an
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export type UploadAvatarResult = {
  path: string;
  signedUrl: string;
  expiresInSeconds: number;
};

export type UploadAvatarError = {
  code: "auth" | "size" | "type" | "upload" | "sign";
  message: string;
};

/**
 * Téléverse un avatar dans le bucket privé `avatars` et retourne une URL signée
 * longue durée (1 an). Le chemin est scopé sous `${user.id}/...` (RLS storage).
 *
 * @param file Fichier image (jpeg/png/webp/gif), ≤ 5 Mo
 * @param userId UUID de l'utilisateur authentifié
 */
export async function uploadAvatar(
  file: File,
  userId: string
): Promise<{ data: UploadAvatarResult; error: null } | { data: null; error: UploadAvatarError }> {
  if (!userId) {
    return { data: null, error: { code: "auth", message: "Utilisateur non authentifié." } };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { data: null, error: { code: "size", message: "Image > 5 Mo." } };
  }
  if (file.type && !ALLOWED_MIME.includes(file.type)) {
    return {
      data: null,
      error: { code: "type", message: "Format non supporté (JPEG, PNG, WEBP, GIF)." },
    };
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/avatar-${Date.now()}.${ext || "jpg"}`;

  const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (upErr) {
    return { data: null, error: { code: "upload", message: upErr.message } };
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    return {
      data: null,
      error: { code: "sign", message: signErr?.message ?? "Génération URL signée échouée." },
    };
  }

  return {
    data: { path, signedUrl: signed.signedUrl, expiresInSeconds: AVATAR_SIGNED_URL_TTL_SECONDS },
    error: null,
  };
}

/**
 * Régénère une URL signée pour un chemin avatar existant (utile si l'URL stockée
 * est expirée). Ne fait pas d'upload.
 */
export async function refreshAvatarSignedUrl(path: string) {
  return supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS);
}
