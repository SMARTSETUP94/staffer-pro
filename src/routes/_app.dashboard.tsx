import { createFileRoute, redirect } from "@tanstack/react-router";

/** v0.51 (L6-A) — Fusionné dans `/`. Stub redirect pour anciens bookmarks. */
export const Route = createFileRoute("/_app/dashboard")({
  beforeLoad: () => { throw redirect({ to: "/", replace: true }); },
});
