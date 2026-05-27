import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * v0.49 (L4a) — Dashboard fusionné dans `/aujourdhui` (page d'accueil unique
 * capability-driven). Stub redirect conservé pour ne pas casser les bookmarks
 * ni les nombreux `<Navigate to="/dashboard" />` répartis dans le code.
 * Sera supprimé en L4c (fusion routes complète).
 */
export const Route = createFileRoute("/_app/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/aujourdhui", replace: true });
  },
});
