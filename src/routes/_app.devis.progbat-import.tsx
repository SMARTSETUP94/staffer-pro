/**
 * v0.23.1 — Route fusionnée. /devis/progbat-import → redirect vers /devis/import.
 * Conservée pour compat des liens existants.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/devis/progbat-import")({
  beforeLoad: () => {
    throw redirect({ to: "/devis/import" });
  },
});
