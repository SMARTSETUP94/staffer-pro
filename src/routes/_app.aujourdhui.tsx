import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * v0.51 (L6-A) — `/aujourdhui` fusionnée dans `/` (page d'accueil unique
 * capability-driven). Stub redirect conservé pour ne pas casser les
 * bookmarks et anciens liens internes.
 */
export const Route = createFileRoute("/_app/aujourdhui")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
