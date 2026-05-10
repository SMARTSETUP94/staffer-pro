/**
 * v0.44.2 — Redirect legacy /mobile/chef/a-valider → /mobile/chef/atelier
 * Conserve les bookmarks existants des chefs après la refonte v0.44.1.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/mobile/chef/a-valider")({
  beforeLoad: () => {
    throw redirect({ to: "/mobile/chef/atelier", replace: true });
  },
  component: () => null,
});
