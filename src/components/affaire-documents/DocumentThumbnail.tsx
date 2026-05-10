import { useEffect, useState } from "react";
import { FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import type { AffaireDocument } from "@/hooks/use-affaire-documents";

interface Props {
  doc: AffaireDocument;
  getSignedUrl: (storagePath: string) => Promise<string | null>;
  onClick?: () => void;
  className?: string;
}

export function DocumentThumbnail({ doc, getSignedUrl, onClick, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isImage = doc.mime_type.startsWith("image/");

  useEffect(() => {
    let cancelled = false;
    if (!isImage) {
      setLoading(false);
      return;
    }
    void getSignedUrl(doc.storage_path).then((u) => {
      if (!cancelled) {
        setUrl(u);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [doc.storage_path, isImage, getSignedUrl]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 transition-all hover:border-primary hover:shadow-md",
        className ?? "",
      ].join(" ")}
    >
      {isImage ? (
        loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : url ? (
          <img
            src={url}
            alt={doc.description ?? doc.filename}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        )
      ) : (
        <div className="flex flex-col items-center gap-1 text-muted-foreground">
          <FileText className="h-10 w-10" />
          <span className="px-2 text-center text-[10px] uppercase tracking-wider">PDF</span>
        </div>
      )}
      {doc.description && (
        <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-left text-[11px] font-medium text-white">
          {doc.description}
        </div>
      )}
    </button>
  );
}
