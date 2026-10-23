import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileText, FolderOpen, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requireCapability } from "@/lib/capability-guard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/hooks/use-affaire-documents";
import { documentSearchMatches } from "@/lib/affaire-document-rules";

export const Route = createFileRoute("/_app/documents-affaires")({
  beforeLoad: () => requireCapability("section.affaires"),
  head: () => ({ meta: [
    { title: "Documents par affaire — Setup Paris" },
    { name: "description", content: "Pièces jointes et documents classés par chantier et opportunité Setup Paris." },
    { property: "og:title", content: "Documents par affaire — Setup Paris" },
    { property: "og:description", content: "Retrouvez les fichiers de chaque chantier et opportunité." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: DocumentsAffaires,
});

type DocumentRow = { id: string; filename: string; description: string | null; taille_bytes: number; uploaded_at: string; affaire_id: string; affaire: { numero: string; nom: string; client: string | null } | null };
function DocumentsAffaires() {
  const [search, setSearch] = useState("");
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["documents-affaires"],
    queryFn: async () => {
      const { data, error } = await supabase.from("affaire_documents").select("id,filename,description,taille_bytes,uploaded_at,affaire_id,affaire:affaires!affaire_documents_affaire_id_fkey(numero,nom,client)").is("deleted_at", null).order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as DocumentRow[];
    },
  });
  const groups = useMemo(() => {
    const map = new Map<string, { affaire: NonNullable<DocumentRow["affaire"]>; files: DocumentRow[] }>();
    for (const doc of data) {
      if (!doc.affaire || !documentSearchMatches([doc.filename, doc.description, doc.affaire.numero, doc.affaire.nom, doc.affaire.client], search)) continue;
      const group = map.get(doc.affaire_id) ?? { affaire: doc.affaire, files: [] };
      group.files.push(doc); map.set(doc.affaire_id, group);
    }
    return [...map.entries()].sort((a, b) => b[1].affaire.numero.localeCompare(a[1].affaire.numero));
  }, [data, search]);
  return <div className="space-y-6 p-4 sm:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-bold">Documents par affaire</h1><p className="mt-1 text-sm text-muted-foreground">{data.length} documents · {groups.length} affaires</p></div><Button asChild variant="outline"><Link to="/liste-chantiers"><FolderOpen className="mr-2 h-4 w-4" />Liste des chantiers</Link></Button></div>
    <Input aria-label="Rechercher les documents" placeholder="N° d'affaire, client, chantier ou fichier…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-lg" />
    {error ? <p className="text-destructive">Documents indisponibles : {error.message}</p> : isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : groups.length === 0 ? <p className="py-8 text-muted-foreground">Aucun document trouvé.</p> : groups.map(([id, group]) => <section key={id} className="border-t border-border pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><Link to="/affaires/$affaireId/documents" params={{ affaireId: id }} className="font-semibold text-primary hover:underline">{group.affaire.numero} — {group.affaire.nom}</Link><span className="text-sm text-muted-foreground">{group.affaire.client} · {group.files.length} fichier{group.files.length > 1 ? "s" : ""}</span></div>
      <ul className="divide-y divide-border">{group.files.map((doc) => <li key={doc.id}><Link to="/affaires/$affaireId/documents" params={{ affaireId: id }} search={{ document: doc.id }} className="flex items-center gap-3 py-3 hover:bg-muted/30"><FileText className="h-5 w-5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{doc.filename}</span><span className="block truncate text-xs text-muted-foreground">{doc.description}</span></span><span className="shrink-0 text-right text-xs text-muted-foreground">{formatBytes(doc.taille_bytes)}<br />{new Date(doc.uploaded_at).toLocaleDateString("fr-FR")}</span></Link></li>)}</ul>
    </section>)}
  </div>;
}