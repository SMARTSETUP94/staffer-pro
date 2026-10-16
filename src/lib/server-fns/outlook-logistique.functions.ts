import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Envoie les étapes logistiques modifiées vers l'agenda Outlook partagé. */
export const syncOutlookLogistiqueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncOutlookLogistique } = await import("@/lib/logistique/outlook-sync.server");
    try {
      return { ok: true as const, ...(await syncOutlookLogistique(supabaseAdmin)) };
    } catch (e) {
      console.error("Sync Outlook", e);
      return { ok: false as const, error: (e as Error).message, created: 0, updated: 0, deleted: 0, errors: [] as string[] };
    }
  });
