import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { AffaireDocument } from "@/hooks/use-affaire-documents";
import { formatBytes } from "@/hooks/use-affaire-documents";

interface Props {
  documents: AffaireDocument[];
  startIndex: number;
  getSignedUrl: (storagePath: string) => Promise<string | null>;
  onClose: () => void;
  onUpdate: (
    id: string,
    patch: { description?: string | null; prise_le?: string | null },
  ) => Promise<{ ok: boolean; error?: string }>;
  onDelete: (doc: AffaireDocument) => Promise<{ ok: boolean; error?: string }>;
  canEdit: boolean;
  canDelete: boolean;
}

export function PhotoLightbox({
  documents,
  startIndex,
  getSignedUrl,
  onClose,
  onUpdate,
  onDelete,
  canEdit,
  canDelete,
}: Props) {
  const [idx, setIdx] = useState(startIndex);
  const [url, setUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [caption, setCaption] = useState("");
  const [priseLe, setPriseLe] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doc = documents[idx];
  const isImage = doc?.mime_type.startsWith("image/");

  useEffect(() => {
    if (!doc) return;
    setCaption(doc.description ?? "");
    setPriseLe(doc.prise_le ?? "");
    setLoadingUrl(true);
    let cancelled = false;
    void getSignedUrl(doc.storage_path).then((u) => {
      if (!cancelled) {
        setUrl(u);
        setLoadingUrl(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [doc, getSignedUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && idx > 0) setIdx(idx - 1);
      if (e.key === "ArrowRight" && idx < documents.length - 1) setIdx(idx + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, documents.length, onClose]);

  if (!doc) return null;

  const handleSave = async () => {
    setSaving(true);
    const res = await onUpdate(doc.id, {
      description: caption.trim() || null,
      prise_le: priseLe || null,
    });
    setSaving(false);
    if (!res.ok) toast.error(res.error ?? "Erreur enregistrement");
    else toast.success("Mis à jour");
  };

  const handleDelete = async () => {
    if (!confirm("Supprimer ce document ?")) return;
    setDeleting(true);
    const res = await onDelete(doc);
    setDeleting(false);
    if (!res.ok) {
      toast.error(res.error ?? "Erreur suppression");
      return;
    }
    toast.success("Supprimé");
    if (documents.length <= 1) onClose();
    else if (idx >= documents.length - 1) setIdx(idx - 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card/80 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{doc.filename}</p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(doc.taille_bytes)} · {idx + 1} / {documents.length}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {url && (
            <Button asChild variant="ghost" size="icon" className="rounded-full">
              <a href={url} target="_blank" rel="noopener noreferrer" download={doc.filename}>
                <Download className="h-4 w-4" />
              </a>
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-full text-destructive hover:bg-destructive/10"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-6">
        {idx > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIdx(idx - 1)}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-card/80 backdrop-blur"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
        )}
        {idx < documents.length - 1 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIdx(idx + 1)}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-card/80 backdrop-blur"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        )}

        {loadingUrl ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : !url ? (
          <p className="text-sm text-muted-foreground">Aperçu indisponible</p>
        ) : isImage ? (
          <img
            src={url}
            alt={doc.description ?? doc.filename}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">Aperçu PDF indisponible</p>
            <Button asChild className="rounded-xl">
              <a href={url} target="_blank" rel="noopener noreferrer">
                Ouvrir dans un nouvel onglet
              </a>
            </Button>
          </div>
        )}
      </div>

      {/* Footer édition */}
      {canEdit && (
        <div className="border-t border-border bg-card/80 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Légende
              </label>
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Ajouter une description…"
                className="rounded-xl"
              />
            </div>
            <div className="sm:w-44">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Prise le
              </label>
              <Input
                type="date"
                value={priseLe}
                onChange={(e) => setPriseLe(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <Button onClick={handleSave} disabled={saving} className="rounded-xl">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
