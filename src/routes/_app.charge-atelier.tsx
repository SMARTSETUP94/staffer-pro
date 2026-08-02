/**
 * LOT B5 — `/charge-atelier` est supprimée : elle répondait à la même question
 * que `/charge` avec une source différente (plans publiés vs `atelier_planning`).
 * Stub de redirection pour les anciens signets.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/charge-atelier")({
  beforeLoad: () => {
    throw redirect({ to: "/charge", replace: true });
  },
});
