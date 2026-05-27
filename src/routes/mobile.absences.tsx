import { createFileRoute, redirect } from "@tanstack/react-router";
/** v0.50 (L4c) — Fusionnée dans /absences. Stub redirect. */
export const Route = createFileRoute("/mobile/absences")({
  beforeLoad: () => { throw redirect({ to: "/absences", replace: true }); },
});
