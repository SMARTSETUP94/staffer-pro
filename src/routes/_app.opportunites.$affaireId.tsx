import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";

export const Route = createFileRoute("/_app/opportunites/$affaireId")({
  beforeLoad: async ({ params }) => {
    await requireCapability("section.pipeline_opportunites");
    throw redirect({ to: "/affaires/$affaireId/opportunite", params: { affaireId: params.affaireId }, replace: true });
  },
  head: () => ({ meta: [
    { title: "Opportunité — Setup Paris" },
    { name: "description", content: "Suivi commercial dans la fiche chantier Setup Paris." },
    { property: "og:title", content: "Opportunité — Setup Paris" },
    { property: "og:description", content: "Brief, emails et documents réunis par affaire." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});
