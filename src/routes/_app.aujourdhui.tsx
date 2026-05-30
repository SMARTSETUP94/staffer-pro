import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Alias historique : /aujourdhui → / (home cap-aware via post-login-routing).
 * Conservé pour les bookmarks externes et anciens liens (notifications, emails).
 */
export const Route = createFileRoute("/_app/aujourdhui")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
