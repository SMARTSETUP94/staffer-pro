import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";

/**
 * Layout route pour /export/*
 *
 * Sert d'enveloppe à toutes les pages sous /export :
 *  - /export            → _app.export.index.tsx (Export planning Excel)
 *  - /export/demandes-devis → _app.export.demandes-devis.tsx (Demandes transport)
 *
 * Sans <Outlet />, les child routes sont silencieusement masquées par le rendu
 * du parent (régression observée en v0.19 où /export/demandes-devis affichait
 * encore l'écran Export planning).
 */
export const Route = createFileRoute("/_app/export")({
  beforeLoad: () => requireCapability("section.admin"),
  component: ExportLayout,
});

function ExportLayout() {
  return <Outlet />;
}
