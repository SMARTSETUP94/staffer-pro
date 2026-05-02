// v0.35.2 — Server functions Auto-staffing Fabrication 5XXX
// Calcule un plan via algo backward + persiste les modifs (manual_shift, manual_pers, display_order)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculatePlan } from "@/lib/staffing/algo";
import type { ObjetInput, PlanResult } from "@/lib/staffing/types";

/* ------------------------------------------------------------------ */
/* GET /staffing-plan/:planId/calculate                                */
/* ------------------------------------------------------------------ */
export const calculateStaffingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string }) => z.object({ planId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{
    plan: {
      id: string;
      affaire_id: string;
      date_debut_fab: string;
      date_fin_fab: string;
      status: string;
    };
    objets: Array<{
      id: string;
      objet_id: string;
      reference: string;
      nom: string;
      display_order: number;
      included: boolean;
      heures_total: number;
    }>;
    result: PlanResult;
    cnc_reserved_dates: string[];
  }> => {
    const { supabase } = context;
    const { planId } = data;

    // 1. Plan
    const { data: plan, error: planErr } = await supabase
      .from("staffing_plan")
      .select("id, affaire_id, date_debut_fab, date_fin_fab, status")
      .eq("id", planId)
      .single();
    if (planErr || !plan) throw new Error(planErr?.message ?? "Plan introuvable");

    // 2. Objets liés au plan + détail fabrication_objets
    const { data: planObjs, error: poErr } = await supabase
      .from("staffing_plan_object")
      .select("id, objet_id, display_order, included")
      .eq("plan_id", planId)
      .order("display_order", { ascending: true });
    if (poErr) throw new Error(poErr.message);

    const objetIds = (planObjs ?? []).filter((o) => o.included).map((o) => o.objet_id);
    let fabObjets: Array<{
      id: string;
      reference: string;
      nom: string;
      heures_prevues_be: number;
      heures_prevues_numerique: number;
      heures_prevues_bois: number;
      heures_prevues_metal: number;
      heures_prevues_peinture: number;
      heures_prevues_tapisserie: number;
      heures_prevues_manutention: number;
    }> = [];
    if (objetIds.length > 0) {
      const { data: fab, error: fabErr } = await supabase
        .from("fabrication_objets")
        .select(
          "id, reference, nom, heures_prevues_be, heures_prevues_numerique, heures_prevues_bois, heures_prevues_metal, heures_prevues_peinture, heures_prevues_tapisserie, heures_prevues_manutention"
        )
        .in("id", objetIds);
      if (fabErr) throw new Error(fabErr.message);
      fabObjets = fab ?? [];
    }

    // 3. CNC réservé hors ce plan
    const { data: cncRows, error: cncErr } = await supabase
      .from("machine_reservation")
      .select("date, affaire_id")
      .eq("machine_id", "cnc_principale")
      .neq("affaire_id", plan.affaire_id);
    if (cncErr) throw new Error(cncErr.message);
    const cncReservedDates = new Set<string>((cncRows ?? []).map((r) => r.date as string));

    // 4. Build ObjetInput[]
    const fabById = new Map(fabObjets.map((f) => [f.id, f] as const));
    const objetsInput: ObjetInput[] = (planObjs ?? [])
      .filter((po) => po.included)
      .map((po) => {
        const f = fabById.get(po.objet_id);
        return {
          objet_id: po.objet_id,
          reference: f?.reference ?? "?",
          nom: f?.nom ?? "?",
          heures_be: Number(f?.heures_prevues_be ?? 0),
          heures_numerique: Number(f?.heures_prevues_numerique ?? 0),
          heures_bois: Number(f?.heures_prevues_bois ?? 0),
          heures_metal: Number(f?.heures_prevues_metal ?? 0),
          heures_peinture: Number(f?.heures_prevues_peinture ?? 0),
          heures_tapisserie: Number(f?.heures_prevues_tapisserie ?? 0),
          heures_manutention: Number(f?.heures_prevues_manutention ?? 0),
          display_order: po.display_order,
        };
      });

    // 5. Calcul
    const result = calculatePlan({
      affaire_id: plan.affaire_id,
      date_fin_fab: plan.date_fin_fab,
      objets: objetsInput,
      cnc_reserved_dates: cncReservedDates,
    });

    const objetsOut = (planObjs ?? []).map((po) => {
      const f = fabById.get(po.objet_id);
      const h =
        Number(f?.heures_prevues_be ?? 0) +
        Number(f?.heures_prevues_numerique ?? 0) +
        Number(f?.heures_prevues_bois ?? 0) +
        Number(f?.heures_prevues_metal ?? 0) +
        Number(f?.heures_prevues_peinture ?? 0) +
        Number(f?.heures_prevues_tapisserie ?? 0) +
        Number(f?.heures_prevues_manutention ?? 0);
      return {
        id: po.id,
        objet_id: po.objet_id,
        reference: f?.reference ?? "?",
        nom: f?.nom ?? "?",
        display_order: po.display_order,
        included: po.included,
        heures_total: h,
      };
    });

    return {
      plan,
      objets: objetsOut,
      result,
      cnc_reserved_dates: Array.from(cncReservedDates),
    };
  });

/* ------------------------------------------------------------------ */
/* PATCH staffing_plan_object — display_order / included                */
/* ------------------------------------------------------------------ */
export const updatePlanObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; display_order?: number; included?: boolean }) =>
    z
      .object({
        id: z.string().uuid(),
        display_order: z.number().int().optional(),
        included: z.boolean().optional(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.display_order !== undefined) patch.display_order = data.display_order;
    if (data.included !== undefined) patch.included = data.included;
    const { error } = await supabase.from("staffing_plan_object").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* PATCH staffing_plan_step — manual_shift / manual_pers / pers         */
/* ------------------------------------------------------------------ */
export const updatePlanStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; manual_shift?: number; manual_pers?: boolean; pers?: number }) =>
    z
      .object({
        id: z.string().uuid(),
        manual_shift: z.number().int().optional(),
        manual_pers: z.boolean().optional(),
        pers: z.number().int().min(0).max(20).optional(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = { source: "manual" };
    if (data.manual_shift !== undefined) patch.manual_shift = data.manual_shift;
    if (data.manual_pers !== undefined) patch.manual_pers = data.manual_pers;
    if (data.pers !== undefined) patch.pers = data.pers;
    const { error } = await supabase.from("staffing_plan_step").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* GET /charge-atelier — agrégation cross-affaires des plans published   */
/* ------------------------------------------------------------------ */
export const getChargeAtelier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { date_debut: string; date_fin: string }) =>
    z
      .object({
        date_debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        date_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Tous les plans published dans la fenêtre
    const { data: plans, error: pErr } = await supabase
      .from("staffing_plan")
      .select(
        "id, affaire_id, status, date_debut_fab, date_fin_fab, affaires:affaire_id(id, numero, nom)"
      )
      .eq("status", "published")
      .gte("date_fin_fab", data.date_debut)
      .lte("date_debut_fab", data.date_fin);
    if (pErr) throw new Error(pErr.message);
    const planIds = (plans ?? []).map((p) => p.id);
    if (planIds.length === 0) {
      return { plans: [], steps: [], cnc: [] };
    }

    const { data: steps, error: sErr } = await supabase
      .from("staffing_plan_step")
      .select("id, plan_id, metier_id, start_date, span_days, pers")
      .in("plan_id", planIds);
    if (sErr) throw new Error(sErr.message);

    const { data: cnc, error: cErr } = await supabase
      .from("machine_reservation")
      .select("affaire_id, date")
      .eq("machine_id", "cnc_principale")
      .gte("date", data.date_debut)
      .lte("date", data.date_fin);
    if (cErr) throw new Error(cErr.message);

    return { plans: plans ?? [], steps: steps ?? [], cnc: cnc ?? [] };
  });
