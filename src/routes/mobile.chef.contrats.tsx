import { createFileRoute, redirect } from "@tanstack/react-router";
/** v0.50 (L4c) — Fusionnée dans /rh/contrats. Stub redirect. */
export const Route = createFileRoute("/mobile/chef/contrats")({
  beforeLoad: () => { throw redirect({ to: "/rh/contrats", replace: true }); },
});
