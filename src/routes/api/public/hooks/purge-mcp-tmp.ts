/**
 * Purge planifiée de la zone temporaire du connecteur Claude (bucket privé mcp-tmp uniquement).
 * Appelée toutes les 15 minutes par la planification gérée ; authentifiée par le secret de planification.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/hooks/purge-mcp-tmp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const refus = await authenticateCronRequest(request);
        if (refus) return refus;
        try {
          const { purgerTempGlobal } = await import("@/lib/mcp/fichier-temp.server");
          return Response.json({ ok: true, ...(await purgerTempGlobal()) });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "erreur" }, { status: 500 });
        }
      },
    },
  },
});
