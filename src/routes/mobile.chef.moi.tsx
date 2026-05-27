import { createFileRoute, redirect } from "@tanstack/react-router";
/** v0.50 (L4c) — Pas de page /profil dédiée, redirect /aujourdhui. Stub. */
export const Route = createFileRoute("/mobile/chef/moi")({
  beforeLoad: () => { throw redirect({ to: "/aujourdhui", replace: true }); },
});
