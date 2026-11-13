import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ajouterImagesAuDevis } from "@/lib/server-fns/images-devis.functions";
import { visibleClientParDefaut } from "@/lib/devis/images-ia";
import { devisKey } from "./api";
import { toast } from "sonner";
import { FolderOpen, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { estImageAjoutable } from "@/lib/devis/documents-affaire";

type Doc = { id: string; filename: string; nom_lisible: string | null; mime_type: string; storage_path: string; taille_bytes: number; uploaded_at: string; document_parent_id: string | null; categorie: string | null };

/** Choix d'une image de la boîte de documents de l'affaire : copiée dans le devis (le PDF client ne dépend pas de la boîte). */
export function DocumentsAffairePicker({ affaireId, devisId, ligneId }: { affaireId: string; devisId: string; ligneId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [derives, setDerives] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const docs = useQuery({
    queryKey: ["documents-affaire-devis", affaireId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("affaire_documents").select("id,filename,nom_lisible,mime_type,storage_path,taille_bytes,uploaded_at,document_parent_id,categorie")
        .eq("affaire_id", affaireId).is("deleted_at", null).order("uploaded_at", { ascending: false }).limit(400);
      if (error) throw error;
      const list = ((data ?? []) as Doc[]).filter((d) => d.categorie !== "devis_setup");
      const imgs = list.filter((d) => estImageAjoutable(d.mime_type));
      const { data: s } = imgs.length ? await supabase.storage.from("affaires-photos").createSignedUrls(imgs.map((d) => d.storage_path), 600) : { data: [] };
      const urls = Object.fromEntries((s ?? []).map((x, i) => [imgs[i].id, x.signedUrl]));
      return { list, urls };
    },
  });
  // Copie faite par le serveur ; si l'ajout échoue, il retire lui-même la copie (aucune image orpheline, aucun droit de suppression côté app).
  const choisir = async (d: Doc) => {
    setBusy(d.id);
    try {
      const [r] = await ajouterImagesAuDevis({ data: { devisId, items: [{ ligneId, documentId: d.id, legende: d.nom_lisible ?? d.filename.replace(/\.[a-z0-9]+$/i, ""), visibleClient: visibleClientParDefaut(d.categorie) }] } });
      if (!r.ok) throw new Error(r.erreur ?? "Ajout refusé");
      await qc.invalidateQueries({ queryKey: devisKey(devisId) });
      toast.success("Image ajoutée à l'objet");
      setOpen(false);
    } catch (e) { toast.error("Ajout impossible", { description: (e as Error).message }); }
    setBusy(null);
  };
  const liste = (docs.data?.list ?? []).filter((d) => derives || !d.document_parent_id);
  const nbDerives = (docs.data?.list ?? []).filter((d) => d.document_parent_id).length;
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
          {nbDerives > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={derives} onChange={(e) => setDerives(e.target.checked)} />Afficher les pages et images extraites des PDF ({nbDerives})</label>}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {docs.isLoading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Chargement…</p>}
            {docs.error && <p className="text-sm text-destructive">Lecture des documents impossible.</p>}
            {docs.data && docs.data.list.length === 0 && <p className="text-sm text-muted-foreground">Aucun document dans cette affaire.</p>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {liste.map((d) => {
                const ok = estImageAjoutable(d.mime_type);
                return (
                  <div key={d.id} className="rounded border p-1 text-xs space-y-1">
                    {ok ? <img src={docs.data.urls[d.id] ?? undefined} alt={d.filename} className="h-24 w-full rounded object-cover" />
                      : <div className="flex h-24 items-center justify-center rounded bg-muted text-muted-foreground">{d.mime_type === "application/pdf" ? "PDF" : "Fichier"}</div>}
                    <p className="truncate" title={d.filename}>{d.nom_lisible ?? d.filename}</p>
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
