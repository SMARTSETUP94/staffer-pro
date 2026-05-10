import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { compressImageIfPossible } from "@/lib/image-compression";

export interface AffaireDocument {
  id: string;
  affaire_id: string;
  objet_id: string | null;
  storage_path: string;
  filename: string;
  mime_type: string;
  taille_bytes: number;
  description: string | null;
  prise_le: string | null;
  uploaded_by: string;
  uploaded_at: string;
}

interface SignedUrlEntry {
  url: string;
  expiresAt: number;
}

const SIGN_TTL_SEC = 60 * 60; // 1h
const SIGN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh si <5min restant

const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB après compression

export interface UploadProgress {
  file: string;
  status: "compressing" | "uploading" | "done" | "error";
  message?: string;
}

export interface UseAffaireDocumentsOptions {
  /** Filtre côté requête : ne renvoie que les documents liés à cet objet */
  objetId?: string | null;
}

export function useAffaireDocuments(
  affaireId: string | null | undefined,
  options: UseAffaireDocumentsOptions = {},
) {
  const { objetId } = options;
  const [documents, setDocuments] = useState<AffaireDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, SignedUrlEntry>>({});

  const reload = useCallback(async () => {
    if (!affaireId) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let q = supabase
      .from("affaire_documents")
      .select("*")
      .eq("affaire_id", affaireId)
      .is("deleted_at", null);
    if (objetId !== undefined) {
      q = objetId === null ? q.is("objet_id", null) : q.eq("objet_id", objetId);
    }
    const { data, error: err } = await q.order("uploaded_at", { ascending: false });
    if (err) {
      setError(err.message);
      setDocuments([]);
    } else {
      setDocuments(data as AffaireDocument[]);
    }
    setLoading(false);
  }, [affaireId, objetId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const getSignedUrl = useCallback(
    async (storagePath: string): Promise<string | null> => {
      const now = Date.now();
      const cached = signedUrls[storagePath];
      if (cached && cached.expiresAt - now > SIGN_REFRESH_MARGIN_MS) {
        return cached.url;
      }
      const { data, error: err } = await supabase.storage
        .from("affaires-photos")
        .createSignedUrl(storagePath, SIGN_TTL_SEC);
      if (err || !data) return null;
      setSignedUrls((prev) => ({
        ...prev,
        [storagePath]: { url: data.signedUrl, expiresAt: now + SIGN_TTL_SEC * 1000 },
      }));
      return data.signedUrl;
    },
    [signedUrls],
  );

  const upload = useCallback(
    async (
      file: File,
      onProgress?: (p: UploadProgress) => void,
      uploadObjetId?: string | null,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!affaireId) return { ok: false, error: "Pas d'affaire" };

      // Validation MIME
      if (!ACCEPTED_MIME.has(file.type)) {
        return { ok: false, error: `Type non supporté : ${file.type || "inconnu"}` };
      }

      onProgress?.({ file: file.name, status: "compressing" });
      const compressed = await compressImageIfPossible(file);

      if (compressed.compressedSize > MAX_BYTES) {
        return {
          ok: false,
          error: `Fichier trop volumineux (${formatMB(compressed.compressedSize)} > 10 MB)`,
        };
      }

      // Récup user pour uploaded_by
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return { ok: false, error: "Non authentifié" };

      // Génère un id côté client pour construire le path AVANT insert
      const documentId = crypto.randomUUID();
      const storagePath = `${affaireId}/${documentId}.${compressed.extension}`;

      onProgress?.({ file: file.name, status: "uploading" });

      // 1. Upload storage
      const { error: upErr } = await supabase.storage
        .from("affaires-photos")
        .upload(storagePath, compressed.blob, {
          contentType: compressed.mimeType,
          upsert: false,
        });
      if (upErr) {
        onProgress?.({ file: file.name, status: "error", message: upErr.message });
        return { ok: false, error: upErr.message };
      }

      // 2. Insert row
      const linkedObjetId = uploadObjetId !== undefined ? uploadObjetId : objetId ?? null;
      const { error: insErr } = await supabase.from("affaire_documents").insert({
        id: documentId,
        affaire_id: affaireId,
        objet_id: linkedObjetId,
        storage_path: storagePath,
        filename: file.name,
        mime_type: compressed.mimeType,
        taille_bytes: compressed.compressedSize,
        uploaded_by: userId,
      });

      if (insErr) {
        // Rollback storage
        await supabase.storage.from("affaires-photos").remove([storagePath]);
        onProgress?.({ file: file.name, status: "error", message: insErr.message });
        return { ok: false, error: insErr.message };
      }

      onProgress?.({ file: file.name, status: "done" });
      await reload();
      return { ok: true };
    },
    [affaireId, objetId, reload],
  );

  const updateDocument = useCallback(
    async (id: string, patch: { description?: string | null; prise_le?: string | null }) => {
      const { error: err } = await supabase
        .from("affaire_documents")
        .update(patch)
        .eq("id", id);
      if (err) return { ok: false, error: err.message };
      await reload();
      return { ok: true };
    },
    [reload],
  );

  const deleteDocument = useCallback(
    async (doc: AffaireDocument) => {
      // Soft delete
      const { error: err } = await supabase
        .from("affaire_documents")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", doc.id);
      if (err) return { ok: false, error: err.message };
      // Best effort : suppression objet storage (admin/auteur)
      await supabase.storage.from("affaires-photos").remove([doc.storage_path]);
      await reload();
      return { ok: true };
    },
    [reload],
  );

  const stats = useMemo(() => {
    const photos = documents.filter((d) => d.mime_type.startsWith("image/"));
    const pdfs = documents.filter((d) => d.mime_type === "application/pdf");
    return { total: documents.length, photos: photos.length, pdfs: pdfs.length };
  }, [documents]);

  return {
    documents,
    loading,
    error,
    reload,
    getSignedUrl,
    upload,
    updateDocument,
    deleteDocument,
    stats,
  };
}

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
