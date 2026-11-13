import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderOpen, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { estImageAjoutable } from "@/lib/devis/documents-affaire";

type Doc = { id: string; filename: string; mime_type: string; storage_path: string; taille_bytes: number; uploaded_at: string };

/** Choix d'une image de la boîte de documents de l'affaire : copiée dans le devis (le PDF client ne dépend pas de la boîte). */
export function DocumentsAffairePicker({ affaireId, devisId, ligneId, onAjout }: {
  affaireId: string; devisId: string; ligneId: string;
  onAjout: (p: { storage_path: string; mime: string; size_bytes: number; width: number | null; height: number | null; legende: string; source_document_id: string }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const docs = useQuery({
    queryKey: ["documents-affaire-devis", affaireId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("affaire_documents").select("id,filename,mime_type,storage_path,taille_bytes,uploaded_at")
        .eq("affaire_id", affaireId).is("deleted_at", null).order("uploaded_at", { ascending: false }).limit(200);
      if (error) throw error;
      const list = (data ?? []) as Doc[];
      const imgs = list.filter((d) => estImageAjoutable(d.mime_type));
      const { data: s } = imgs.length ? await supabase.storage.from("affaires-photos").createSignedUrls(imgs.map((d) => d.storage_path), 600) : { data: [] };
      const urls = Object.fromEntries((s ?? []).map((x, i) => [imgs[i].id, x.signedUrl]));
      return { list, urls };
    },
  });
  const choisir = async (d: Doc) => {
    setBusy(d.id);
    try {
      const { data: blob, error } = await supabase.storage.from("affaires-photos").download(d.storage_path);
      if (error || !blob) throw new Error("Lecture du document refusée");
      const path = `${devisId}/${ligneId}/${crypto.randomUUID()}-${d.filename.replace(/[^\w.-]+/g, "_")}`;
      const up = await supabase.storage.from("devis-photos").upload(path, blob, { contentType: d.mime_type });
      if (up.error) throw new Error(up.error.message);
      const bmp = await createImageBitmap(blob).catch(() => null);
      await onAjout({ storage_path: path, mime: d.mime_type, size_bytes: blob.size, width: bmp?.width ?? null, height: bmp?.height ?? null, legende: d.filename, source_document_id: d.id });
      toast.success("Image ajoutée à l'objet");
      setOpen(false);
    } catch (e) { toast.error("Ajout impossible", { description: (e as Error).message }); }
    setBusy(null);
  };
  return (
    <>
      <button type="button" className="inline-flex items-center gap-1 text-sm text-primary" onClick={() => setOpen(true)}>
        <FolderOpen className="h-4 w-4" />Documents de l'affaire
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Choisir dans les documents de l'affaire</DialogTitle>
            <DialogDescription>L'image est copiée dans le devis : retirer le document de la boîte ne la supprime pas du devis. Les PDF et autres fichiers ne peuvent pas être ajoutés comme photo.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {docs.isLoading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Chargement…</p>}
            {docs.error && <p className="text-sm text-destructive">Lecture des documents impossible.</p>}
            {docs.data && docs.data.list.length === 0 && <p className="text-sm text-muted-foreground">Aucun document dans cette affaire.</p>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {docs.data?.list.map((d) => {
                const ok = estImageAjoutable(d.mime_type);
                return (
                  <div key={d.id} className="rounded border p-1 text-xs space-y-1">
                    {ok ? <img src={docs.data.urls[d.id] ?? undefined} alt={d.filename} className="h-24 w-full rounded object-cover" />
                      : <div className="flex h-24 items-center justify-center rounded bg-muted text-muted-foreground">{d.mime_type === "application/pdf" ? "PDF" : "Fichier"}</div>}
                    <p className="truncate" title={d.filename}>{d.filename}</p>
                    <Button size="sm" variant="outline" className="w-full" disabled={!ok || busy !== null} onClick={() => void choisir(d)}>
                      {busy === d.id ? "Ajout…" : ok ? "Ajouter" : "Non ajoutable"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
