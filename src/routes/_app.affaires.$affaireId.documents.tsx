import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { AffaireDocumentsGallery } from "@/components/affaire-documents/AffaireDocumentsGallery";

export const Route = createFileRoute("/_app/affaires/$affaireId/documents")({
  beforeLoad: () => requireCapability("section.affaires"),
  validateSearch: (search: Record<string, unknown>) => ({ document: typeof search.document === "string" ? search.document : undefined }),
  head: () => ({ meta: [
    { title: "Documents du chantier — Setup Paris" },
    { name: "description", content: "Photos, plans et pièces jointes enregistrés dans cette affaire Setup Paris." },
    { property: "og:title", content: "Documents du chantier — Setup Paris" },
    { property: "og:description", content: "Consultez les documents et pièces jointes de cette affaire." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: AffaireDocumentsPage,
});

function AffaireDocumentsPage() {
  const { affaireId } = Route.useParams();
  const { document } = Route.useSearch();
  return (
    <div className="py-4">
      <AffaireDocumentsGallery affaireId={affaireId} variant="desktop" initialDocumentId={document} />
    </div>
  );
}
