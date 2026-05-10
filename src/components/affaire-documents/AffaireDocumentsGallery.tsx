import { useEffect, useState } from "react";
import { useAffaireDocuments } from "@/hooks/use-affaire-documents";
import { useAuth } from "@/lib/auth-context";
import { DocumentThumbnail } from "./DocumentThumbnail";
import { PhotoLightbox } from "./PhotoLightbox";
import { AffaireDocumentUploader } from "./AffaireDocumentUploader";
import { Image as ImageIcon, Loader2 } from "lucide-react";

interface Props {
  affaireId: string;
  variant?: "desktop" | "mobile";
  /** Si false, l'utilisateur ne peut que consulter (ex: chef non assigné, employé) */
  canUpload?: boolean;
}

export function AffaireDocumentsGallery({ affaireId, variant = "desktop", canUpload = true }: Props) {
  const { user, isAdmin } = useAuth();
  const {
    documents,
    loading,
    error,
    getSignedUrl,
    prefetchSignedUrls,
    upload,
    updateDocument,
    deleteDocument,
    stats,
  } = useAffaireDocuments(affaireId);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // v0.44.4 — Préfetch en lot des URLs signées des images dès que la liste change.
  // 1 appel HTTP pour N photos au lieu de N appels.
  useEffect(() => {
    const paths = documents
      .filter((d) => d.mime_type.startsWith("image/"))
      .map((d) => d.storage_path);
    if (paths.length > 0) void prefetchSignedUrls(paths);
  }, [documents, prefetchSignedUrls]);


  const gridClasses =
    variant === "mobile"
      ? "grid grid-cols-3 gap-2"
      : "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";

  return (
    <div className="flex flex-col gap-4">
      {canUpload && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Photos & documents</p>
            <p className="text-xs text-muted-foreground">
              {stats.total} fichier{stats.total > 1 ? "s" : ""} · {stats.photos} photo
              {stats.photos > 1 ? "s" : ""} · {stats.pdfs} PDF
            </p>
          </div>
          <AffaireDocumentUploader onUpload={upload} variant={variant} />
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 py-10 text-center">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Aucun document pour cette affaire</p>
          {canUpload && (
            <p className="text-xs text-muted-foreground">
              {variant === "mobile" ? "Touchez Photo ou Galerie pour ajouter" : "Cliquez sur Uploader pour ajouter"}
            </p>
          )}
        </div>
      ) : (
        <div className={gridClasses}>
          {documents.map((d, i) => (
            <DocumentThumbnail
              key={d.id}
              doc={d}
              getSignedUrl={getSignedUrl}
              onClick={() => setLightboxIdx(i)}
            />
          ))}
        </div>
      )}

      {lightboxIdx !== null && documents[lightboxIdx] && (
        <PhotoLightbox
          documents={documents}
          startIndex={lightboxIdx}
          getSignedUrl={getSignedUrl}
          onClose={() => setLightboxIdx(null)}
          onUpdate={updateDocument}
          onDelete={deleteDocument}
          canEdit={(() => {
            const d = documents[lightboxIdx];
            return !!user && (isAdmin || d.uploaded_by === user.id);
          })()}
          canDelete={(() => {
            const d = documents[lightboxIdx];
            return !!user && (isAdmin || d.uploaded_by === user.id);
          })()}
        />
      )}
    </div>
  );
}
