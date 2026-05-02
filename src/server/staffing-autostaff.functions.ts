// v0.35.9 — Auto-staffing 1 clic : remplit les slots manquants d'un step
// (1 jour ou tous les jours) en prenant les top candidats disponibles.
// Déterministe : utilise rankCandidats (tier-based CDI > CDD > Intérim).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getResourceAvailability } from "@/lib/staffing/resource-availability";
import { rankCandidats, type EmployeStaffing } from "@/lib/staffing/tier-ranking";

interface AutoStaffResult {
  filled: number;
  skipped: number;
  details: Array<{
    date: string;
    employe_id: string;
    nom: string;
    prenom: string;
    tier: 1 | 2 | 3;
    presence_pct: number;
  }>;
}

/** Liste les jours ouvrés couverts par un step. */
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

export const autoStaffStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { stepId: string; planId: string; onlyDate?: string }) =>
    z
      .object({
        stepId: z.string().uuid(),
        planId: z.string().uuid(),
        onlyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }): Promise<AutoStaffResult> => {
    const { supabase } = context;

    /* Step */
    const { data: step, error: stepErr } = await supabase
      .from("staffing_plan_step")
      .select("id, metier_id, start_date, span_days, pers")
      .eq("id", data.stepId)
      .single();
    if (stepErr || !step) throw new Error(stepErr?.message ?? "Step introuvable");

    const allDays = workingDaysOfStep(step.start_date as string, step.span_days as number);
    const days = data.onlyDate ? allDays.filter((d) => d === data.onlyDate) : allDays;
    if (days.length === 0) return { filled: 0, skipped: 0, details: [] };

    const dateDebut = days[0];
    const dateFin = days[days.length - 1];

    /* Employés actifs */
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

    /* Disponibilité externe (autres plans) */
    const avail = await getResourceAvailability(supabase, {
      date_debut: dateDebut,
      date_fin: dateFin,
      exclude_plan_id: data.planId,
    });

    /* Assignations déjà posées sur CE plan (tous steps confondus) → compose le cumul */
    const { data: ownAssigns } = await supabase
      .from("staffing_plan_assignment")
      .select("employe_id, date, presence_pct, step_id, staffing_plan_step!inner(plan_id)")
      .gte("date", dateDebut)
      .lte("date", dateFin)
      .eq("staffing_plan_step.plan_id", data.planId);

    /** cumul[employe_id|date] = % occupé (tous plans + ce plan) */
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

    /** déjà affectés sur CE step pour ne pas doublonner */
    const assignedOnThisStep: Record<string, Set<string>> = {};
    for (const a of (ownAssigns ?? []) as Array<{ employe_id: string; date: string; step_id: string }>) {
      if (a.step_id !== data.stepId) continue;
      assignedOnThisStep[a.date] ??= new Set();
      assignedOnThisStep[a.date].add(a.employe_id);
    }

    /** total presence_pct sur CE step ce jour (pour atteindre pers × 100%) */
    const totalOnStep: Record<string, number> = {};
    for (const a of (ownAssigns ?? []) as Array<{
      employe_id: string;
      date: string;
      step_id: string;
      presence_pct: number;
    }>) {
      if (a.step_id !== data.stepId) continue;
      totalOnStep[a.date] = (totalOnStep[a.date] ?? 0) + (a.presence_pct ?? 100);
    }

    const target = (step.pers as number) * 100;
    const inserts: Array<{
      step_id: string;
      employe_id: string;
      date: string;
      presence_pct: number;
    }> = [];
    const details: AutoStaffResult["details"] = [];
    let skipped = 0;

    for (const date of days) {
      let placed = totalOnStep[date] ?? 0;
      if (placed >= target) continue;

      /* Construit occupations pour rankCandidats sur cette date */
      const occMap: Record<string, { occupation_pct_moyenne: number; par_jour: Record<string, number> }> =
        {};
      for (const e of employes) {
        const c = cumul[`${e.id}|${date}`] ?? 0;
        occMap[e.id] = { occupation_pct_moyenne: c, par_jour: { [date]: c } };
      }
      const ranked = rankCandidats(employes, step.metier_id as number, occMap);

      for (const cand of ranked) {
        if (placed >= target) break;
        const empId = cand.employe.id;
        if (assignedOnThisStep[date]?.has(empId)) continue;
        const dispo = 100 - (cumul[`${empId}|${date}`] ?? 0);
        if (dispo <= 0) continue;
        const pct = Math.min(100, dispo, target - placed);
        if (pct < 10) continue;
        const rounded = Math.round(pct / 10) * 10;
        if (rounded < 10) continue;

        inserts.push({
          step_id: data.stepId,
          employe_id: empId,
          date,
          presence_pct: rounded,
        });
        cumul[`${empId}|${date}`] = (cumul[`${empId}|${date}`] ?? 0) + rounded;
        placed += rounded;
        assignedOnThisStep[date] ??= new Set();
        assignedOnThisStep[date].add(empId);
        details.push({
          date,
          employe_id: empId,
          nom: cand.employe.nom,
          prenom: cand.employe.prenom,
          tier: cand.tier,
          presence_pct: rounded,
        });
      }
      if (placed < target) skipped += Math.ceil((target - placed) / 100);
    }

    if (inserts.length > 0) {
      const { error: insErr } = await supabase.from("staffing_plan_assignment").insert(inserts);
      if (insErr) throw new Error(insErr.message);
    }

    return { filled: inserts.length, skipped, details };
  });
