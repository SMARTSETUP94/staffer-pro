import { createFileRoute, redirect } from "@tanstack/react-router";
/** v0.50 (L4c) — Fusionnée dans /affaires/$affaireId. Stub redirect. */
export const Route = createFileRoute("/mobile/chef/affaires/$affaireId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/affaires/$affaireId",
      params: { affaireId: params.affaireId },
      replace: true,
    });
  },
});
