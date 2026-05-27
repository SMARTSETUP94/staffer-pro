import { createFileRoute, redirect } from "@tanstack/react-router";
/** v0.50 (L4c) — Fusionnée dans /mes-heures. Stub redirect. */
export const Route = createFileRoute("/mobile/heures")({
  beforeLoad: () => { throw redirect({ to: "/mes-heures", replace: true }); },
});
