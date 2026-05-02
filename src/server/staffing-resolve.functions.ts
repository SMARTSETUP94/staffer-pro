// v0.35.x — Résolution auto conflit CNC : dry-run d'algo en élargissant la fenêtre
// (livraison repoussée jour par jour, max 60j) et compare avant/après. NE PERSISTE RIEN.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculatePlan } from "@/lib/staffing/algo";
import type { ObjetInput, PlanResult } from "@/lib/staffing/types";

export interface ResolveResult {
  before: PlanResult;
  after: PlanResult | null;
  delta_days: number;
  new_date_fin_fab: string | null;
  resolved: boolean;
  reason?: string;
  date_fin_fab_initial: string;
}

function addIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const resolveCncConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string; maxDeltaDays?: number }) =>
    z
      .object({
        planId: z.string().uuid(),
        maxDeltaDays: z.number().int().min(1).max(120).default(60),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ResolveResult> => {
    const { supabase } = context;
    const { planId, maxDeltaDays } = data;

    const { data: plan, error: pe } = await supabase
      .from("staffing_plan")
      .select("id, affaire_id, date_fin_fab")
      .eq("id", planId)
      .single();
    if (pe || !plan) throw new Error(pe?.message ?? "Plan introuvable");

    const { data: planObjs } = await supabase
      .from("staffing_plan_object")
      .select("objet_id, display_order, included")
      .eq("plan_id", planId)
      .order("display_order", { ascending: true });

    const objetIds = (planObjs ?? []).filter((o) => o.included).map((o) => o.objet_id);
    let fab: Array<Record<string, unknown>> = [];
    if (objetIds.length > 0) {
      const { data: f } = await supabase
        .from("fabrication_objets")
        .select(
          "id, reference, nom, heures_prevues_be, heures_prevues_numerique, heures_prevues_bois, heures_prevues_metal, heures_prevues_peinture, heures_prevues_tapisserie, heures_prevues_manutention",
        )
        .in("id", objetIds);
      fab = f ?? [];
    }
    const fabById = new Map(fab.map((f) => [f.id as string, f] as const));

    const objets: ObjetInput[] = (planObjs ?? [])
      .filter((po) => po.included)
      .map((po) => {
        const f = fabById.get(po.objet_id);
        return {
          objet_id: po.objet_id,
          reference: (f?.reference as string) ?? "?",
          nom: (f?.nom as string) ?? "?",
          heures_be: Number(f?.heures_prevues_be ?? 0),
          heures_numerique: Number(f?.heures_prevues_numerique ?? 0),
          heures_bois: Number(f?.heures_prevues_bois ?? 0),
          heures_metal: Number(f?.heures_prevues_metal ?? 0),
          heures_peinture: Number(f?.heures_prevues_peinture ?? 0),
          heures_tapisserie: Number(f?.heures_prevues_tapisserie ?? 0),
          heures_manutention: Number(f?.heures_prevues_manutention ?? 0),
          display_order: po.display_order as number,
        };
      });

    const { data: cncRows } = await supabase
      .from("machine_reservation")
      .select("date, affaire_id")
      .eq("machine_id", "cnc_principale")
      .neq("affaire_id", plan.affaire_id);
    const cncReserved = new Set<string>((cncRows ?? []).map((r) => r.date as string));

    const baseFin = plan.date_fin_fab as string;
    const before = calculatePlan({
      affaire_id: plan.affaire_id,
      date_fin_fab: baseFin,
      objets,
      cnc_reserved_dates: cncReserved,
    });

    const hasConflict = (r: PlanResult) =>
      r.alerts.some((a) => a.code === "NUM_CONFLIT_INSOLUBLE");

    if (!hasConflict(before)) {
      return {
        before,
        after: null,
        delta_days: 0,
        new_date_fin_fab: null,
        resolved: true,
        reason: "Aucun conflit CNC détecté.",
        date_fin_fab_initial: baseFin,
      };
    }

    // Recule la livraison jour par jour, recalcule, s'arrête au premier sans conflit.
    for (let delta = 1; delta <= maxDeltaDays; delta++) {
      const newFin = addIso(baseFin, delta);
      // Re-clone reserved set (calculatePlan le mute)
      const after = calculatePlan({
        affaire_id: plan.affaire_id,
        date_fin_fab: newFin,
        objets,
        cnc_reserved_dates: new Set(cncReserved),
      });
      if (!hasConflict(after)) {
        return {
          before,
          after,
          delta_days: delta,
          new_date_fin_fab: newFin,
          resolved: true,
          date_fin_fab_initial: baseFin,
        };
      }
    }

    return {
      before,
      after: null,
      delta_days: maxDeltaDays,
      new_date_fin_fab: null,
      resolved: false,
      reason: `Conflit CNC non résolu en repoussant la livraison de ${maxDeltaDays} j. Libérez la CNC ou réduisez la portée Numérique d'un objet.`,
      date_fin_fab_initial: baseFin,
    };
  });
