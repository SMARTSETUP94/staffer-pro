// v0.35.x — Hard delete plan staffing (admin only).
// CASCADE FK supprime déjà : staffing_plan_object, staffing_plan_step (→ assignment + machine_reservation),
// staffing_plan_snapshot. On nettoie en plus assignations.staffing_plan_id (planning principal).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteStaffingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string; confirmAffaireNumero: string }) =>
    z
      .object({
        planId: z.string().uuid(),
        confirmAffaireNumero: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Vérif admin
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw new Error("Suppression réservée aux administrateurs.");

    // Charger plan + affaire
    const { data: plan, error: pErr } = await supabase
      .from("staffing_plan")
      .select("id, affaire_id, status, affaires:affaire_id(numero, nom)")
      .eq("id", data.planId)
      .single();
    if (pErr || !plan) throw new Error("Plan introuvable");

    const aff = plan.affaires as { numero: string; nom: string } | null;
    const expected = aff?.numero ?? "";
    if (data.confirmAffaireNumero.trim() !== expected) {
      throw new Error(
        `Confirmation invalide. Saisissez exactement le numéro d'affaire : ${expected}`,
      );
    }

    // 1) Détacher les assignations planning principal (staffing_plan_id → null)
    const { error: aErr } = await supabase
      .from("assignations")
      .update({ staffing_plan_id: null })
      .eq("staffing_plan_id", data.planId);
    if (aErr) throw new Error(`Détachement assignations : ${aErr.message}`);

    // 2) Delete plan → CASCADE sur objects/steps/snapshots/assignment/machine_reservation
    const { error: dErr } = await supabase
      .from("staffing_plan")
      .delete()
      .eq("id", data.planId);
    if (dErr) throw new Error(`Suppression : ${dErr.message}`);

    return {
      ok: true,
      affaire_numero: expected,
      affaire_nom: aff?.nom ?? "",
    };
  });
