import { createFileRoute, redirect } from "@tanstack/react-router";
/** v0.50 (L4c) — Pas de /profil dédiée, redirect /aujourdhui. Voir mem://debts/profil-route-manquante. */
export const Route = createFileRoute("/mobile/profil")({
  beforeLoad: () => { throw redirect({ to: "/aujourdhui", replace: true }); },
});
