import { createFileRoute, redirect } from "@tanstack/react-router";
/** v0.50 (L4c) — Fusionnée dans /employes. Stub redirect. */
export const Route = createFileRoute("/mobile/chef/equipe")({
  beforeLoad: () => { throw redirect({ to: "/employes", replace: true }); },
});
