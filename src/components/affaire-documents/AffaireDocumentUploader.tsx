import { useRef, useState } from "react";
import { Camera, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { UploadProgress } from "@/hooks/use-affaire-documents";

interface Props {
  onUpload: (
    file: File,
    onProgress?: (p: UploadProgress) => void,
  ) => Promise<{ ok: boolean; error?: string }>;
  disabled?: boolean;
  variant?: "desktop" | "mobile";
}

export function AffaireDocumentUploader({ onUpload, disabled, variant = "desktop" }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progressList, setProgressList] = useState<UploadProgress[]>([]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setProgressList([]);

    let okCount = 0;
    let errCount = 0;

    for (const file of Array.from(files)) {
      const res = await onUpload(file, (p) => {
        setProgressList((prev) => {
          const idx = prev.findIndex((x) => x.file === p.file);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = p;
            return next;
          }
          return [...prev, p];
        });
      });
      if (res.ok) okCount++;
      else {
        errCount++;
        toast.error(`${file.name} : ${res.error ?? "erreur upload"}`);
      }
    }

    if (okCount > 0) {
      toast.success(`${okCount} fichier${okCount > 1 ? "s" : ""} uploadé${okCount > 1 ? "s" : ""}`);
    }

    setUploading(false);
    // Garde la liste 2s puis vide
    setTimeout(() => setProgressList([]), 2000);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  if (variant === "mobile") {
    return (
      <div className="flex flex-col gap-2">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="lg"
            disabled={disabled || uploading}
            onClick={() => cameraInputRef.current?.click()}
            className="h-14 rounded-2xl"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            <span className="ml-2 text-sm font-semibold">Photo</span>
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
            className="h-14 rounded-2xl"
          >
            <Upload className="h-5 w-5" />
            <span className="ml-2 text-sm font-semibold">Galerie</span>
          </Button>
        </div>
        {progressList.length > 0 && <ProgressList items={progressList} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        disabled={disabled || uploading}
        onClick={() => fileInputRef.current?.click()}
        className="rounded-xl"
      >
        {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
        Uploader des fichiers
      </Button>
      {progressList.length > 0 && <ProgressList items={progressList} />}
    </div>
  );
}

function ProgressList({ items }: { items: UploadProgress[] }) {
  return (
    <ul className="space-y-1 rounded-lg border border-border bg-card p-2 text-xs">
      {items.map((p) => (
        <li key={p.file} className="flex items-center justify-between gap-2">
          <span className="truncate">{p.file}</span>
          <span className={statusColor(p.status)}>{statusLabel(p)}</span>
        </li>
      ))}
    </ul>
  );
}

function statusLabel(p: UploadProgress): string {
  if (p.status === "compressing") return "Compression…";
  if (p.status === "uploading") return "Upload…";
  if (p.status === "done") return "✓";
  return "✗";
}
function statusColor(s: UploadProgress["status"]): string {
  if (s === "done") return "text-green-600";
  if (s === "error") return "text-destructive";
  return "text-muted-foreground";
}
