import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";

/**
 * Layout /opportunites — garde la capability pour toute la section
 * (pipeline + fiche) et rend la route enfant via <Outlet />.
 * Sans cet Outlet, la fiche /opportunites/$affaireId changeait l'URL
 * mais la page pipeline restait affichée (fiche jamais rendue).
 */
export const Route = createFileRoute("/_app/opportunites")({
  beforeLoad: () => requireCapability("section.pipeline_opportunites"),
  component: OpportunitesLayout,
});

function OpportunitesLayout() {
  return <Outlet />;
}
