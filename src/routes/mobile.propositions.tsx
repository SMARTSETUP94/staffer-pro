import { createFileRoute, redirect } from "@tanstack/react-router";
/** v0.50 (L4c) — Fusionnée dans /mes-propositions. Stub redirect. */
export const Route = createFileRoute("/mobile/propositions")({
  beforeLoad: () => { throw redirect({ to: "/mes-propositions", replace: true }); },
});
