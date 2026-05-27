import { createFileRoute, redirect } from "@tanstack/react-router";

/** v0.50 (L4c) — Fusionnée dans /missions/$id/$phase. Stub redirect. */
export const Route = createFileRoute("/mobile/mission/$affaireId/$phase")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/missions/$affaireId/$phase",
      params: { affaireId: params.affaireId, phase: params.phase },
      replace: true,
    });
  },
});
