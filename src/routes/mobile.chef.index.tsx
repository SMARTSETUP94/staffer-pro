import { createFileRoute, redirect } from "@tanstack/react-router";
/** v0.50 (L4c) — Fusionnée dans /aujourdhui. Stub redirect. */
export const Route = createFileRoute("/mobile/chef/")({
  beforeLoad: () => { throw redirect({ to: "/aujourdhui", replace: true }); },
});
