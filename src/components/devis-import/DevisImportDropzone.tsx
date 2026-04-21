import { useRef } from "react";
import { Loader2, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  filename: string | null;
  parsing: boolean;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onFile: (file: File) => void;
  onManualCreate: () => void;
}

export function DevisImportDropzone({
  filename,
  parsing,
  dragOver,
  setDragOver,
  onFile,
  onManualCreate,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40",
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {parsing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {filename ?? "Glisser le fichier .xlsx, .xls ou .csv (ou cliquer pour sélectionner)"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Colonnes attendues : N° • Désignation • Qté • Unité • PU HT • Total • TVA • Temps prévu
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">ou</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="flex justify-center">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          onClick={(e) => {
            e.stopPropagation();
            onManualCreate();
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Créer un devis manuellement
        </Button>
      </div>
    </div>
  );
}
