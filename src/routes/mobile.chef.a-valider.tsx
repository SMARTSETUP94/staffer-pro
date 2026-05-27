import { createFileRoute, redirect } from "@tanstack/react-router";
/** v0.50 (L4c) — Fusionnée dans /audit-heures. Stub redirect. */
export const Route = createFileRoute("/mobile/chef/a-valider")({
  beforeLoad: () => { throw redirect({ to: "/audit-heures", replace: true }); },
});
