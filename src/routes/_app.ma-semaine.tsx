import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * v0.27.5 — Route dédiée employé "Ma semaine".
 * Alias sémantique propre vers /dashboard (qui applique le preset employé
 * + garde-fou v0.27.4 restreint aux widgets autorisés à ce rôle effectif).
 *
 * Pourquoi un alias plutôt qu'une page séparée :
 *  - le dashboard universel filtre déjà les widgets via getAllowedWidgetsForRole(effectiveRole)
 *  - éviter une 2ᵉ implémentation à maintenir / tester
 *  - garantir aucune fuite RGPD : les widgets commerciaux ne traversent jamais le DOM employé
 */
export const Route = createFileRoute("/_app/ma-semaine")({
  head: () => ({
    meta: [{ title: "Ma semaine — Setup Paris" }],
  }),
  component: () => <Navigate to="/dashboard" replace />,
});
