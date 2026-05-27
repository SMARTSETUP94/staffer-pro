import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * v0.50 (L4c) — Route fusionnée dans /mes-missions principale.
 * Stub redirect 301 conservé pour les bookmarks. Sera supprimé en L4d.
 */
export const Route = createFileRoute("/mobile/mes-missions")({
  beforeLoad: () => {
    throw redirect({ to: "/mes-missions", replace: true });
  },
});
