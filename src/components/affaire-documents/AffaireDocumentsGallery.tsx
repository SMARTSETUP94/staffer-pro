import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAffaireDocuments } from "@/hooks/use-affaire-documents";
import { useAuth } from "@/lib/auth-context";
import { useCapability } from "@/hooks/use-capability";
import { DocumentThumbnail } from "./DocumentThumbnail";
import { PhotoLightbox } from "./PhotoLightbox";
import { AffaireDocumentUploader } from "./AffaireDocumentUploader";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { FileText, List, Grid2X2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/hooks/use-affaire-documents";
import { documentSearchMatches } from "@/lib/affaire-document-rules";
import { CATEGORIES_BOITE, CATEGORIE_LABEL } from "@/lib/devis/images-ia";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  affaireId: string;
  variant?: "desktop" | "mobile";
  /** Si false, l'utilisateur ne peut que consulter (ex: chef non assigné, employé) */
  canUpload?: boolean;
  initialDocumentId?: string;
}

export function AffaireDocumentsGallery({ affaireId, variant = "desktop", canUpload = true, initialDocumentId }: Props) {
  const { user } = useAuth();
  const isAdmin = useCapability("affaire.documents.delete");
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
    reload,
  } = useAffaireDocuments(affaireId);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");
  const [search, setSearch] = useState("");
  const [openedId, setOpenedId] = useState<string | undefined>();
  useEffect(() => {
    if (!initialDocumentId || openedId === initialDocumentId) return;
    const index = documents.findIndex((d) => d.id === initialDocumentId);
    if (index >= 0) { setLightboxIdx(index); setOpenedId(initialDocumentId); }
  }, [initialDocumentId, openedId, documents]);
  const [cat, setCat] = useState("");
  const [origine, setOrigine] = useState("");
  const [periode, setPeriode] = useState("");
  const [derives, setDerives] = useState(false);
  const [prep, setPrep] = useState<string | null>(null);
  const reloadDocs = reload;
  const copies = new Map<string, number>();
  for (const d of documents) if (d.empreinte_sha256 && !d.document_parent_id) copies.set(d.empreinte_sha256, (copies.get(d.empreinte_sha256) ?? 0) + 1);
  const premiers = new Set<string>();
  const visibleDocuments = documents.filter((d) => {
    if (!documentSearchMatches([d.filename, d.nom_lisible ?? null, d.description], search)) return false;
    if (!derives && d.document_parent_id) return false;
    if (cat && (d.categorie ?? "") !== cat) return false;
    const o = d.document_parent_id ? "extrait" : d.source_email_id ? "email" : "manuel";
    if (origine && o !== origine) return false;
    if (periode && Date.now() - new Date(d.uploaded_at).getTime() > Number(periode) * 86400000) return false;
    // Doublons d'une même affaire (même empreinte) : regroupés sous la première occurrence, rien n'est retiré.
    if (d.empreinte_sha256 && !d.document_parent_id) { if (premiers.has(d.empreinte_sha256)) return false; premiers.add(d.empreinte_sha256); }
    return true;
  });
  const nbDerives = documents.filter((d) => d.document_parent_id).length;
  const changerCategorie = async (id: string, c: string) => {
    const { error: e } = await supabase.rpc("affaire_document_categoriser", { _id: id, _categorie: c || null as never, _nom_lisible: null as never, _source: "humain" });
    if (e) toast.error("Catégorie non enregistrée", { description: e.message }); else void reloadDocs();
  };
  const preparer = async () => {
    setPrep("Préparation…");
    try {
      const { preparerBoite } = await import("@/lib/devis/rendu-pages.client");
      const r = await preparerBoite(affaireId, setPrep);
      if (r.erreurs.length) toast.error("Préparation incomplète", { description: r.erreurs.join(" · ") }); else toast.success("Documents triés, pages et images extraites");
      await reloadDocs();
    } catch (e) { toast.error("Préparation impossible", { description: (e as Error).message }); }
    setPrep(null);
  };

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
            <p className="text-sm font-semibold">Documents de l'affaire</p>
            <p className="text-xs text-muted-foreground">
              {stats.total} fichier{stats.total > 1 ? "s" : ""} · {stats.photos} photo
              {stats.photos > 1 ? "s" : ""} · {stats.pdfs} PDF
            </p>
          </div>
          <AffaireDocumentUploader onUpload={upload} variant={variant} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Rechercher un fichier" placeholder="Rechercher un fichier…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1" />
        <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" title="Liste" aria-label="Vue liste" onClick={() => setView("list")}><List className="h-4 w-4" /></Button>
        <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" title="Galerie" aria-label="Vue galerie" onClick={() => setView("grid")}><Grid2X2 className="h-4 w-4" /></Button>
        <Button asChild variant="outline" size="sm"><Link to="/documents-affaires">Toutes les affaires</Link></Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select aria-label="Catégorie" className="h-8 rounded-md border bg-background px-2" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Toutes catégories</option>
          {Object.entries(CATEGORIE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Origine" className="h-8 rounded-md border bg-background px-2" value={origine} onChange={(e) => setOrigine(e.target.value)}>
          <option value="">Toutes origines</option><option value="email">Email</option><option value="manuel">Ajout manuel</option><option value="extrait">Extrait d'un PDF</option>
        </select>
        <select aria-label="Date" className="h-8 rounded-md border bg-background px-2" value={periode} onChange={(e) => setPeriode(e.target.value)}>
          <option value="">Toutes dates</option><option value="7">7 derniers jours</option><option value="30">30 derniers jours</option><option value="90">3 derniers mois</option>
        </select>
        {nbDerives > 0 && <label className="flex items-center gap-1"><input type="checkbox" checked={derives} onChange={(e) => setDerives(e.target.checked)} />Afficher les pages et images extraites ({nbDerives})</label>}
        {canUpload && <Button size="sm" variant="outline" disabled={prep !== null} onClick={() => void preparer()}>{prep ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />{prep}</> : "Trier et extraire les images"}</Button>}
      </div>

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
      ) : visibleDocuments.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Aucun fichier trouvé.</p> : view === "list" ? (
        <ul className="divide-y divide-border">
          {visibleDocuments.map((d) => <li key={d.id}>
            <Button variant="ghost" onClick={() => setLightboxIdx(documents.findIndex((doc) => doc.id === d.id))} className="h-auto w-full justify-start gap-3 rounded-none px-2 py-3 text-left">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1"><span className="block whitespace-normal break-words font-medium">{d.nom_lisible ?? d.filename}</span>
                {d.nom_lisible && <span className="block truncate text-xs text-muted-foreground">{d.filename}</span>}
                <span className="block truncate text-xs text-muted-foreground">{d.description ?? "Document"}{d.empreinte_sha256 && (copies.get(d.empreinte_sha256) ?? 0) > 1 ? ` · reçu ${copies.get(d.empreinte_sha256)} fois` : ""}{d.extraction?.motif ? ` · ${d.extraction.motif}` : ""}</span></span>
              <span className="shrink-0 text-right text-xs text-muted-foreground">{formatBytes(d.taille_bytes)}<br />{new Date(d.uploaded_at).toLocaleDateString("fr-FR")}</span>
            </Button>
            {!d.document_parent_id && <div className="flex items-center gap-1 px-2 pb-2 text-xs">
              <select aria-label={`Catégorie de ${d.filename}`} className="h-7 rounded border bg-background px-1" value={d.categorie ?? ""} onChange={(e) => void changerCategorie(d.id, e.target.value)}>
                <option value="">Sans catégorie</option>
                {CATEGORIES_BOITE.map((k) => <option key={k} value={k}>{CATEGORIE_LABEL[k]}</option>)}
                {d.categorie && !(CATEGORIES_BOITE as readonly string[]).includes(d.categorie) && <option value={d.categorie} disabled>{CATEGORIE_LABEL[d.categorie] ?? d.categorie}</option>}
              </select>
              {d.categorie_source === "ia" && <span className="text-muted-foreground">proposée par l'IA</span>}
            </div>}
          </li>)}
        </ul>
      ) : (
        <div className={gridClasses}>
          {visibleDocuments.map((d) => (
            <DocumentThumbnail
              key={d.id}
              doc={d}
              getSignedUrl={getSignedUrl}
              onClick={() => setLightboxIdx(documents.findIndex((doc) => doc.id === d.id))}
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
