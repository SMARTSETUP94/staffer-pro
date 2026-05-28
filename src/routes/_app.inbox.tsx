import { createFileRoute, redirect } from "@tanstack/react-router";

/** v0.51 (L6-A) — Fusionné dans `/`. */
export const Route = createFileRoute("/_app/inbox")({
  beforeLoad: () => { throw redirect({ to: "/", replace: true }); },
});
