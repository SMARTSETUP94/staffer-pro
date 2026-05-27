import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * v0.49 (L4a) — Page mobile fusionnée dans `/aujourdhui` (page d'accueil
 * unique capability-driven, plus de dualité mobile/desktop).
 * Stub redirect conservé pour ne pas casser les bookmarks.
 * Sera supprimé en L4c.
 */
export const Route = createFileRoute("/mobile/aujourdhui")({
  beforeLoad: () => {
    throw redirect({ to: "/aujourdhui", replace: true });
  },
});
