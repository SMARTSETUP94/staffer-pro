import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * v0.49 (L4a) — Dashboard chef mobile fusionné dans `/aujourdhui`.
 * Stub redirect conservé pour ne pas casser les bookmarks et les liens
 * existants vers `/mobile/chef/dashboard`. Sera supprimé en L4c.
 */
export const Route = createFileRoute("/mobile/chef/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/aujourdhui", replace: true });
  },
});
