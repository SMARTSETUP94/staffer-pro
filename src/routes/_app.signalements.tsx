import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * v0.14 — Alias /signalements → /admin/feedback.
 * La page admin canonique vit sous /admin/feedback ; cet alias couvre les
 * éventuels liens directs vers /signalements (anciens emails, partages, etc.).
 */
export const Route = createFileRoute("/_app/signalements")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/feedback" });
  },
});
