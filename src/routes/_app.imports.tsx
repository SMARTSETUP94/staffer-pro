import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * v0.13 — Route canonique /imports.
 * Redirige vers le 1er onglet (Employés). La barre `ImportsTabsNav` permet
 * ensuite de basculer entre Employés / Devis / Historique.
 */
export const Route = createFileRoute("/_app/imports")({
  beforeLoad: () => {
    throw redirect({ to: "/employes/import" });
  },
});
