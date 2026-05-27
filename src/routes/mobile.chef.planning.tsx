import { createFileRoute, redirect } from "@tanstack/react-router";
/** v0.50 (L4c) — Fusionnée dans /planning. Stub redirect. */
export const Route = createFileRoute("/mobile/chef/planning")({
  beforeLoad: () => { throw redirect({ to: "/planning", replace: true }); },
});
