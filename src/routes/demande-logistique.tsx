import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DemandeLogistiqueForm } from "@/components/logistique/DemandeLogistiqueForm";

export const Route = createFileRoute("/demande-logistique")({
  validateSearch: z.object({ jeton: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Demande logistique — SET UP" },
      { name: "description", content: "Envoyez une demande de livraison, d'appro ou de montage à la logistique SET UP." },
      { property: "og:title", content: "Demande logistique — SET UP" },
      { property: "og:description", content: "Formulaire de demande logistique pour les équipes SET UP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const { jeton } = Route.useSearch();
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Demande logistique</h1>
        <p className="text-sm text-muted-foreground">La logistique valide chaque demande avant de l'ajouter au planning.</p>
      </header>
      {jeton && /^[0-9a-f]{48}$/.test(jeton)
        ? <DemandeLogistiqueForm jeton={jeton} />
        : <p className="rounded-md border p-4 text-sm">Lien incomplet : utilisez le lien fourni par la logistique.</p>}
    </main>
  );
}
