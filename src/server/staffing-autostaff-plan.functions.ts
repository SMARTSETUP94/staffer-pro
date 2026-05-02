// v0.35.10 #1 — Auto-staffing plan complet : itère autoStaffStep sur TOUS les
// steps d'un plan en respectant l'ordre métier (BE → Num → Bois/Metal/Peint/Tap → Manut)
// pour maximiser la cohérence des disponibilités.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getResourceAvailability } from "@/lib/staffing/resource-availability";
import { rankCandidats, type EmployeStaffing } from "@/lib/staffing/tier-ranking";
import { METIER_ID } from "@/lib/staffing/types";

// Ordre déterministe : amont → aval (cohérent avec algo.ts)
const METIER_ORDER: number[] = [
  METIER_ID.BE,
  METIER_ID.Num,
  METIER_ID.Bois,
  METIER_ID.Metal,
  METIER_ID.Peint,
  METIER_ID.Tap,
  METIER_ID.Manut,
];

interface AutoStaffPlanResult {
  steps_traites: number;
  steps_skipped: number;
  filled_total: number;
  unfilled_total: number;
  details_par_step: Array<{
    step_id: string;
    metier_id: number;
    objet_id: string | null;
    filled: number;
    skipped: number;
  }>;
}

function workingDaysOfStep(start: string, span: number): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  for (let i = 0; i < span; i++) {
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const autoStaffPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string }) =>
    z.object({ planId: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }): Promise<AutoStaffPlanResult> => {
    const { supabase } = context;

    /* 1) Steps du plan */
    const { data: steps, error: stepsErr } = await supabase
      .from("staffing_plan_step")
      .select("id, metier_id, objet_id, start_date, span_days, pers")
      .eq("plan_id", data.planId);
    if (stepsErr) throw new Error(stepsErr.message);
    if (!steps || steps.length === 0) {
      return {
        steps_traites: 0,
        steps_skipped: 0,
        filled_total: 0,
        unfilled_total: 0,
        details_par_step: [],
      };
    }

    // Filtre steps avec date réelle
    const stepsValid = (steps as Array<{
      id: string;
      metier_id: number;
      objet_id: string | null;
      start_date: string;
      span_days: number;
      pers: number;
    }>).filter((s) => s.start_date && s.start_date !== "TBD" && s.span_days > 0);

    // Tri par ordre métier puis par date de début
    stepsValid.sort((a, b) => {
      const orderA = METIER_ORDER.indexOf(a.metier_id);
      const orderB = METIER_ORDER.indexOf(b.metier_id);
      if (orderA !== orderB) return orderA - orderB;
      return a.start_date.localeCompare(b.start_date);
    });

    /* 2) Bornes globales pour chargement employés/dispos */
    const allDates = stepsValid.flatMap((s) => workingDaysOfStep(s.start_date, s.span_days));
    if (allDates.length === 0) {
      return {
        steps_traites: 0,
        steps_skipped: stepsValid.length,
        filled_total: 0,
        unfilled_total: 0,
        details_par_step: [],
      };
    }
    const dateDebutGlobal = allDates.reduce((a, b) => (a < b ? a : b));
    const dateFinGlobal = allDates.reduce((a, b) => (a > b ? a : b));

    /* 3) Employés actifs */
    const { data: emps, error: empErr } = await supabase
      .from("employes")
      .select(
        "id, nom, prenom, metier_principal_id, metiers_secondaires, competences_polyvalentes, niveau_seniorite, type_contrat, actif, non_staffing"
      )
      .eq("actif", true)
      .eq("non_staffing", false);
    if (empErr) throw new Error(empErr.message);
    const employes: EmployeStaffing[] = (emps ?? []).map((e) => ({
      id: e.id as string,
      nom: e.nom as string,
      prenom: e.prenom as string,
      metier_principal_id: e.metier_principal_id as number,
      metiers_secondaires: (e.metiers_secondaires ?? []) as number[],
      competences_polyvalentes: (e.competences_polyvalentes ?? {}) as Record<string, boolean>,
      niveau_seniorite: (e.niveau_seniorite ?? 3) as number,
      type_contrat: (e.type_contrat as "CDI" | "CDD" | "Interim") ?? "CDI",
      actif: true,
      non_staffing: false,
    }));

    /* 4) Dispos externes (autres plans) */
    const avail = await getResourceAvailability(supabase, {
      date_debut: dateDebutGlobal,
      date_fin: dateFinGlobal,
      exclude_plan_id: data.planId,
    });

    /* 5) Assignations existantes sur CE plan */
    const { data: ownAssigns } = await supabase
      .from("staffing_plan_assignment")
      .select("employe_id, date, presence_pct, step_id, staffing_plan_step!inner(plan_id)")
      .gte("date", dateDebutGlobal)
      .lte("date", dateFinGlobal)
      .eq("staffing_plan_step.plan_id", data.planId);

    /** cumul[employe_id|date] = % occupé global */
    const cumul: Record<string, number> = {};
    for (const [empId, occ] of Object.entries(avail.personnes)) {
      for (const [d, p] of Object.entries(occ.par_jour)) {
        cumul[`${empId}|${d}`] = (cumul[`${empId}|${d}`] ?? 0) + p;
      }
    }
    for (const a of (ownAssigns ?? []) as Array<{
      employe_id: string;
      date: string;
      presence_pct: number;
    }>) {
      const k = `${a.employe_id}|${a.date}`;
      cumul[k] = (cumul[k] ?? 0) + (a.presence_pct ?? 100);
    }

    /** Map step_id → totals existants par date */
    const totalByStep: Record<string, Record<string, number>> = {};
    /** Map step_id → set employé déjà placé par date */
    const placedByStep: Record<string, Record<string, Set<string>>> = {};
    for (const a of (ownAssigns ?? []) as Array<{
      step_id: string;
      employe_id: string;
      date: string;
      presence_pct: number;
    }>) {
      totalByStep[a.step_id] ??= {};
      totalByStep[a.step_id][a.date] = (totalByStep[a.step_id][a.date] ?? 0) + (a.presence_pct ?? 100);
      placedByStep[a.step_id] ??= {};
      placedByStep[a.step_id][a.date] ??= new Set();
      placedByStep[a.step_id][a.date].add(a.employe_id);
    }

    /* 6) Itère steps */
    const inserts: Array<{
      step_id: string;
      employe_id: string;
      date: string;
      presence_pct: number;
    }> = [];
    const details: AutoStaffPlanResult["details_par_step"] = [];
    let stepsTraites = 0;
    let stepsSkipped = 0;
    let filledTotal = 0;
    let unfilledTotal = 0;

    for (const step of stepsValid) {
      const days = workingDaysOfStep(step.start_date, step.span_days);
      const target = step.pers * 100;
      let stepFilled = 0;
      let stepSkipped = 0;
      let didSomething = false;

      for (const date of days) {
        let placed = totalByStep[step.id]?.[date] ?? 0;
        if (placed >= target) continue;

        // Construction occupations pour ranking
        const occMap: Record<string, { occupation_pct_moyenne: number; par_jour: Record<string, number> }> = {};
        for (const e of employes) {
          const c = cumul[`${e.id}|${date}`] ?? 0;
          occMap[e.id] = { occupation_pct_moyenne: c, par_jour: { [date]: c } };
        }
        const ranked = rankCandidats(employes, step.metier_id, occMap);

        for (const cand of ranked) {
          if (placed >= target) break;
          const empId = cand.employe.id;
          if (placedByStep[step.id]?.[date]?.has(empId)) continue;
          const dispo = 100 - (cumul[`${empId}|${date}`] ?? 0);
          if (dispo <= 0) continue;
          const pct = Math.min(100, dispo, target - placed);
          if (pct < 10) continue;
          const rounded = Math.round(pct / 10) * 10;
          if (rounded < 10) continue;

          inserts.push({ step_id: step.id, employe_id: empId, date, presence_pct: rounded });
          cumul[`${empId}|${date}`] = (cumul[`${empId}|${date}`] ?? 0) + rounded;
          placed += rounded;
          stepFilled++;
          didSomething = true;
          placedByStep[step.id] ??= {};
          placedByStep[step.id][date] ??= new Set();
          placedByStep[step.id][date].add(empId);
          totalByStep[step.id] ??= {};
          totalByStep[step.id][date] = placed;
        }
        if (placed < target) stepSkipped += Math.ceil((target - placed) / 100);
      }

      if (didSomething) stepsTraites++;
      else stepsSkipped++;
      filledTotal += stepFilled;
      unfilledTotal += stepSkipped;
      details.push({
        step_id: step.id,
        metier_id: step.metier_id,
        objet_id: step.objet_id,
        filled: stepFilled,
        skipped: stepSkipped,
      });
    }

    /* 7) INSERT batch */
    if (inserts.length > 0) {
      const { error: insErr } = await supabase.from("staffing_plan_assignment").insert(inserts);
      if (insErr) throw new Error(insErr.message);
    }

    return {
      steps_traites: stepsTraites,
      steps_skipped: stepsSkipped,
      filled_total: filledTotal,
      unfilled_total: unfilledTotal,
      details_par_step: details,
    };
  });
