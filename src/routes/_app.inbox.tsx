import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * v0.49 (L4a) — Page fusionnée dans `/aujourdhui` (capability-driven).
 * Stub redirect conservé pour ne pas casser les bookmarks.
 * Sera supprimé en L4c (fusion routes complète).
 */
export const Route = createFileRoute("/_app/inbox")({
  beforeLoad: () => {
    throw redirect({ to: "/aujourdhui", replace: true });
  },
});
