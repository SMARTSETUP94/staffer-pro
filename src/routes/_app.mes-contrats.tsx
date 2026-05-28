import { createFileRoute } from "@tanstack/react-router";
import { MesContratsList } from "@/components/contrats/MesContratsList";
import { PageHeader } from "@/components/PageHeader";
import { ScopeSelector, ScopeNotImplementedBanner, type UrlScope } from "@/components/scope/ScopeSelector";

export const Route = createFileRoute("/_app/mes-contrats")({
  validateSearch: (s: Record<string, unknown>): { scope: UrlScope } => {
    const r = s.scope;
    return { scope: r === "team" || r === "all" ? r : "mine" };
  },
  head: () => ({ meta: [{ title: "Mes contrats — Setup Paris" }] }),
  component: MesContratsPage,
});

function MesContratsPage() {
  const { scope } = Route.useSearch();
  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <PageHeader title="Mes contrats" description="Vos contrats intermittents : lecture, téléchargement et signature." />
      <ScopeSelector capKey="mes_contrats.view" routeId="/_app/mes-contrats" />
      <ScopeNotImplementedBanner scope={scope} />
      <MesContratsList />
    </div>
  );
}
