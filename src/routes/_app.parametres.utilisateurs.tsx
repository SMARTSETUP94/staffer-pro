import { createFileRoute, redirect } from "@tanstack/react-router";

/** v0.50 (L4d) — Route déplacée vers /admin/utilisateurs. Stub redirect 301. */
export const Route = createFileRoute("/_app/parametres/utilisateurs")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/utilisateurs", replace: true });
  },
});
