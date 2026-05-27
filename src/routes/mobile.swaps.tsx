import { createFileRoute, redirect } from "@tanstack/react-router";
/** v0.50 (L4c) — Fusionnée dans /mes-swaps. Stub redirect. */
export const Route = createFileRoute("/mobile/swaps")({
  beforeLoad: () => { throw redirect({ to: "/mes-swaps", replace: true }); },
});
