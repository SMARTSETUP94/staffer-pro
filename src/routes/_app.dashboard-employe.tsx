import { createFileRoute, Navigate } from "@tanstack/react-router";

/**
 * v0.26.0 — Route fusionnée dans /dashboard universel (presets par rôle).
 * Conservée comme redirect pour ne pas casser les anciens liens.
 */
export const Route = createFileRoute("/_app/dashboard-employe")({
  component: () => <Navigate to="/dashboard" replace />,
});
