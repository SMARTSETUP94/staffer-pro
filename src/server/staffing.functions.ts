// v0.35.2 / Sprint 2.1 — Server functions Auto-staffing Fabrication 5XXX
// calculateStaffingPlan: calcule + MERGE avec overrides DB existants + UPSERT (delete+insert) toutes
// les steps. Renvoie les steps avec leurs UUIDs DB.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculatePlan } from "@/lib/staffing/algo";
import { addDays } from "@/lib/staffing/date-utils";
import type { ObjetInput, PlanResult } from "@/lib/staffing/types";

/* ------------------------------------------------------------------ */
/* GET /staffing-plan/:planId/calculate (POST)                         */
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
    step_overrides: Record<string, { manual_shift: number; manual_pers: boolean }>;
  }> => {
    const { supabase } = context;
    const { planId } = data;

    /* 1. Plan */
    const { data: plan, error: planErr } = await supabase
      .from("staffing_plan")
      .select("id, affaire_id, date_debut_fab, date_fin_fab, status")
      .eq("id", planId)
      .single();
    if (planErr || !plan) throw new Error(planErr?.message ?? "Plan introuvable");

    /* 2. Objets liés au plan + détail fabrication_objets */
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

    /* 3. CNC réservé hors ce plan */
    const { data: cncRows, error: cncErr } = await supabase
      .from("machine_reservation")
      .select("date, affaire_id")
      .eq("machine_id", "cnc_principale")
      .neq("affaire_id", plan.affaire_id);
    if (cncErr) throw new Error(cncErr.message);
    const cncReservedDates = new Set<string>((cncRows ?? []).map((r) => r.date as string));

    /* 4. Charger les overrides existants (manual_shift, manual_pers, pers) */
    const { data: existingSteps } = await supabase
      .from("staffing_plan_step")
      .select("id, metier_id, objet_id, manual_shift, manual_pers, pers")
      .eq("plan_id", planId);
    type Override = { manual_shift: number; manual_pers: boolean; pers: number };
    const overrideKey = (metier_id: number, objet_id: string | null) =>
      `${metier_id}|${objet_id ?? "_null_"}`;
    const overridesMap = new Map<string, Override>();
    for (const s of existingSteps ?? []) {
      if (s.manual_shift !== 0 || s.manual_pers === true) {
        overridesMap.set(overrideKey(s.metier_id, s.objet_id), {
          manual_shift: s.manual_shift ?? 0,
          manual_pers: s.manual_pers ?? false,
          pers: s.pers,
        });
      }
    }

    /* 5. Build ObjetInput[] */
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

    /* 6. Calcul algo */
    const result = calculatePlan({
      affaire_id: plan.affaire_id,
      date_fin_fab: plan.date_fin_fab,
      objets: objetsInput,
      cnc_reserved_dates: cncReservedDates,
    });

    /* 7. Appliquer overrides : si manual_pers, recalcule span ; si manual_shift, décale start_date */
    for (const step of result.steps) {
      if (step.start_date === "TBD") continue;
      const ov = overridesMap.get(overrideKey(step.metier_id, step.objet_id));
      if (!ov) continue;
      if (ov.manual_pers && ov.pers > 0 && ov.pers !== step.pers) {
        const totalH = step.pers * step.h_par_jour * step.span_days;
        const newSpan = Math.max(1, Math.ceil(totalH / (ov.pers * step.h_par_jour)));
        // Réancrer fin = ancienne fin -> nouvelle start = ancienne fin - (newSpan-1)
        const oldEnd = addDays(step.start_date, step.span_days - 1);
        step.pers = ov.pers;
        step.span_days = newSpan;
        step.start_date = addDays(oldEnd, -(newSpan - 1));
        step.source = "manual";
      }
      if (ov.manual_shift !== 0) {
        step.start_date = addDays(step.start_date, ov.manual_shift);
        step.source = "manual";
      }
    }

    /* 8. PERSISTENCE IDEMPOTENTE — préserve step IDs existants par clé naturelle
       (metier_id, objet_id) pour ne PAS cascade-delete les staffing_plan_assignment
       lors des recalculs successifs (sliders, shift, reorder, …). */
    await supabase.from("machine_reservation").delete().eq("affaire_id", plan.affaire_id);

    // Lire les steps existants du plan AVANT modification
    const { data: existingSteps } = await supabase
      .from("staffing_plan_step")
      .select("id, metier_id, objet_id")
      .eq("plan_id", planId);

    const existingByKey = new Map<string, string>();
    for (const r of (existingSteps ?? []) as Array<{ id: string; metier_id: number; objet_id: string | null }>) {
      existingByKey.set(`${r.metier_id}|${r.objet_id ?? "_null_"}`, r.id as string);
    }

    if (result.steps.length > 0) {
      const targetSteps = result.steps.filter((s) => s.start_date !== "TBD");
      const usedExistingIds = new Set<string>();

      // 8.a UPDATE in-place les steps qui matchent une clé existante (préserve l'id → assignments survivent)
      for (const s of targetSteps) {
        const key = `${s.metier_id}|${s.objet_id ?? "_null_"}`;
        const existingId = existingByKey.get(key);
        const ov = overridesMap.get(overrideKey(s.metier_id, s.objet_id));
        const payload = {
          start_date: s.start_date,
          span_days: s.span_days,
          pers: s.pers,
          h_par_jour: s.h_par_jour,
          manual_shift: ov?.manual_shift ?? 0,
          manual_pers: ov?.manual_pers ?? false,
          source: s.source,
        };
        if (existingId) {
          usedExistingIds.add(existingId);
          const { error: upErr } = await supabase
            .from("staffing_plan_step")
            .update(payload)
            .eq("id", existingId);
          if (upErr) throw new Error(upErr.message);
          s.id = existingId;
        } else {
          // 8.b INSERT pour les nouvelles combinaisons (metier_id, objet_id) qui n'existaient pas encore
          const { data: inserted, error: insErr } = await supabase
            .from("staffing_plan_step")
            .insert({ plan_id: planId, metier_id: s.metier_id, objet_id: s.objet_id, ...payload })
            .select("id")
            .single();
          if (insErr) throw new Error(insErr.message);
          s.id = inserted.id as string;
          usedExistingIds.add(s.id);
        }
      }

      // 8.c DELETE les steps existants qui ne sont plus dans le plan recalculé (objet retiré, etc.)
      // CASCADE supprimera leurs assignments — c'est le comportement attendu pour un step disparu.
      const toDelete: string[] = [];
      for (const [, id] of existingByKey) {
        if (!usedExistingIds.has(id)) toDelete.push(id);
      }
      if (toDelete.length > 0) {
        await supabase.from("staffing_plan_step").delete().in("id", toDelete);
      }

      if (targetSteps.length > 0) {

        // Réinsérer cnc_reservations en utilisant les nouveaux uuids
        if (result.cnc_reservations.length > 0) {
          const cncToInsert: Array<{
            machine_id: string;
            date: string;
            step_id: string;
            affaire_id: string;
          }> = [];
          for (const r of result.cnc_reservations) {
            const step = result.steps.find((s) => s.id === r.step_id || s.metier_id === 4);
            if (step && step.id) {
              cncToInsert.push({
                machine_id: r.machine_id,
                date: r.date,
                step_id: step.id,
                affaire_id: plan.affaire_id,
              });
            }
          }
          if (cncToInsert.length > 0) {
            await supabase.from("machine_reservation").insert(cncToInsert);
          }
        }
      }
    }

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

    /* step_overrides : map step_db_uuid -> {manual_shift, manual_pers} */
    const stepOverrides: Record<string, { manual_shift: number; manual_pers: boolean }> = {};
    for (const s of result.steps) {
      const ov = overridesMap.get(overrideKey(s.metier_id, s.objet_id));
      stepOverrides[s.id] = {
        manual_shift: ov?.manual_shift ?? 0,
        manual_pers: ov?.manual_pers ?? false,
      };
    }

    return {
      plan,
      objets: objetsOut,
      result,
      cnc_reserved_dates: Array.from(cncReservedDates),
      step_overrides: stepOverrides,
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
    const patch: { display_order?: number; included?: boolean } = {};
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
        manual_shift: z.number().int().min(-30).max(30).optional(),
        manual_pers: z.boolean().optional(),
        pers: z.number().int().min(1).max(12).optional(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: { source: string; manual_shift?: number; manual_pers?: boolean; pers?: number } = {
      source: "manual",
    };
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
