// v0.35.12 — Annulation rapide d'un plan Express fraîchement créé.
// Conditions cumulatives :
//  - plan en statut 'draft'
//  - created_by = userId courant
//  - créé il y a moins de 10 minutes
// Sinon, l'utilisateur doit passer par la suppression admin (DeletePlanDialog).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TEN_MIN_MS = 10 * 60 * 1000;

export const cancelExpressPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string }) =>
    z.object({ planId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: plan, error } = await supabase
      .from("staffing_plan")
      .select("id, status, created_by, created_at")
      .eq("id", data.planId)
      .single();
    if (error || !plan) throw new Error("Plan introuvable");

    if (plan.status !== "draft") {
      throw new Error(
        "Annulation rapide impossible : ce plan n'est plus en brouillon. Utilisez la suppression complète.",
      );
    }
    if (plan.created_by !== userId) {
      throw new Error("Annulation rapide réservée à l'auteur du plan.");
    }
    const ageMs = Date.now() - new Date(plan.created_at as string).getTime();
    if (ageMs > TEN_MIN_MS) {
      throw new Error(
        "Délai d'annulation rapide dépassé (10 min). Utilisez la suppression complète.",
      );
    }

    // Détacher éventuelles assignations résiduelles
    await supabase
      .from("assignations")
      .update({ staffing_plan_id: null })
      .eq("staffing_plan_id", data.planId);

    const { error: dErr } = await supabase
      .from("staffing_plan")
      .delete()
      .eq("id", data.planId);
    if (dErr) throw new Error(dErr.message);

    return { ok: true };
  });
