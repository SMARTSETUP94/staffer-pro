import { createFileRoute, redirect } from "@tanstack/react-router";
/** v0.50 (L4c) — Fusionnée dans /charge-atelier. Stub redirect. */
export const Route = createFileRoute("/mobile/chef/atelier")({
  beforeLoad: () => { throw redirect({ to: "/charge-atelier", replace: true }); },
});
