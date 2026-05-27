import { createFileRoute, redirect } from "@tanstack/react-router";
/** v0.50 (L4c) — Fusionnée dans /mes-contrats. Stub redirect. */
export const Route = createFileRoute("/mobile/contrats")({
  beforeLoad: () => { throw redirect({ to: "/mes-contrats", replace: true }); },
});
