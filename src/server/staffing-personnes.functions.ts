// v0.35.3 — Server functions Sprint 3 : suggestions personnes + assignations
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getResourceAvailability } from "@/lib/staffing/resource-availability";
import { rankCandidats, type EmployeStaffing } from "@/lib/staffing/tier-ranking";

/* ------------------------------------------------------------------ */
/* GET suggestions de personnes pour un step à une date                */
/* ------------------------------------------------------------------ */
export const getPersonnelSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { stepId: string; date: string; planId: string }) =>
    z
      .object({
        stepId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        planId: z.string().uuid(),
      })
      .parse(d)
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      suggestions: Array<{
        employe: {
          id: string;
          nom: string;
          prenom: string;
          metier_principal_id: number;
          type_contrat: string;
        };
        score: number;
        tier: 1 | 2 | 3;
        dispo_pct: number;
        absent_days_in_step: number;
        absent_today: boolean;
      }>;
      step: { id: string; metier_id: number; objet_id: string | null; start_date: string; span_days: number };
    }> => {
      const { supabase } = context;

      /* Step */
      const { data: step, error: stepErr } = await supabase
        .from("staffing_plan_step")
        .select("id, metier_id, objet_id, start_date, span_days")
        .eq("id", data.stepId)
        .single();
      if (stepErr || !step) throw new Error(stepErr?.message ?? "Step introuvable");

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

      /* Disponibilité sur la fenêtre du step (pour calculer les absences chevauchantes) */
      const stepStart = step.start_date as string;
      const stepSpan = step.span_days as number;
      const stepEnd = (() => {
        const d = new Date(stepStart + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + Math.max(0, stepSpan - 1));
        return d.toISOString().slice(0, 10);
      })();
      const availWindow = await getResourceAvailability(supabase, {
        date_debut: stepStart < data.date ? stepStart : data.date,
        date_fin: stepEnd > data.date ? stepEnd : data.date,
        exclude_plan_id: data.planId,
      });

      /* Inclure aussi les assignations DU plan en cours (mais sur d'autres steps que celui-ci)
         pour calculer le cumul correctement sur la date ciblée */
      const { data: ownAssigns } = await supabase
        .from("staffing_plan_assignment")
        .select("employe_id, presence_pct, step_id, staffing_plan_step!inner(plan_id)")
        .eq("date", data.date)
        .eq("staffing_plan_step.plan_id", data.planId)
        .neq("step_id", data.stepId);
      const occ = { ...availWindow.personnes };
      for (const a of (ownAssigns ?? []) as Array<{ employe_id: string; presence_pct: number }>) {
        const cur = occ[a.employe_id] ?? { occupation_pct_moyenne: 0, par_jour: {} };
        cur.par_jour[data.date] = (cur.par_jour[data.date] ?? 0) + (a.presence_pct ?? 100);
        cur.occupation_pct_moyenne = cur.par_jour[data.date];
        occ[a.employe_id] = cur;
      }

      const ranked = rankCandidats(employes, step.metier_id as number, occ);
      const absencesMap = availWindow.absences_par_personne ?? {};
      // Liste des dates ouvrées du step (pour compter absences pertinentes)
      const stepDates: string[] = [];
      {
        const d = new Date(stepStart + "T00:00:00Z");
        for (let i = 0; i < stepSpan; i++) {
          stepDates.push(d.toISOString().slice(0, 10));
          d.setUTCDate(d.getUTCDate() + 1);
        }
      }
      const top = ranked.slice(0, 10).map((r) => {
        const absSet = absencesMap[r.employe.id];
        const absent_days_in_step = absSet
          ? stepDates.filter((d) => absSet.has(d)).length
          : 0;
        return {
          employe: {
            id: r.employe.id,
            nom: r.employe.nom,
            prenom: r.employe.prenom,
            metier_principal_id: r.employe.metier_principal_id,
            type_contrat: r.employe.type_contrat as string,
          },
          score: Math.round(r.score),
          tier: r.tier,
          dispo_pct: 100 - (occ[r.employe.id]?.par_jour[data.date] ?? 0),
          absent_days_in_step,
          absent_today: absSet?.has(data.date) ?? false,
        };
      });

      return {
        suggestions: top,
        step: {
          id: step.id as string,
          metier_id: step.metier_id as number,
          objet_id: (step.objet_id as string | null) ?? null,
          start_date: step.start_date as string,
          span_days: step.span_days as number,
        },
      };
    }
  );

/* ------------------------------------------------------------------ */
/* INSERT staffing_plan_assignment                                     */
/* ------------------------------------------------------------------ */
export const assignPersonneToStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { step_id: string; employe_id: string; date: string; presence_pct?: number }) =>
    z
      .object({
        step_id: z.string().uuid(),
        employe_id: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        presence_pct: z.number().int().min(10).max(100).default(100),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("staffing_plan_assignment")
      .insert({
        step_id: data.step_id,
        employe_id: data.employe_id,
        date: data.date,
        presence_pct: data.presence_pct,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

/* ------------------------------------------------------------------ */
/* DELETE staffing_plan_assignment                                     */
/* ------------------------------------------------------------------ */
export const unassignPersonneFromStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("staffing_plan_assignment")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* PATCH presence_pct                                                  */
/* ------------------------------------------------------------------ */
export const updateAssignmentPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; presence_pct: number }) =>
    z.object({ id: z.string().uuid(), presence_pct: z.number().int().min(10).max(100) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("staffing_plan_assignment")
      .update({ presence_pct: data.presence_pct })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* GET assignments du plan : pour afficher conflits + état actuel       */
/* ------------------------------------------------------------------ */
export const getPlanAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string }) => z.object({ planId: z.string().uuid() }).parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      assignments: Array<{
        id: string;
        step_id: string;
        employe_id: string;
        date: string;
        presence_pct: number;
        nom: string;
        prenom: string;
        type_contrat: string;
      }>;
    }> => {
      const { supabase } = context;
      const { data: rows, error } = await supabase
        .from("staffing_plan_assignment")
        .select(
          "id, step_id, employe_id, date, presence_pct, employes:employe_id(nom, prenom, type_contrat), staffing_plan_step!inner(plan_id)"
        )
        .eq("staffing_plan_step.plan_id", data.planId);
      if (error) throw new Error(error.message);
      const out = (rows ?? []).map((r: any) => ({
        id: r.id as string,
        step_id: r.step_id as string,
        employe_id: r.employe_id as string,
        date: r.date as string,
        presence_pct: (r.presence_pct ?? 100) as number,
        nom: r.employes?.nom ?? "?",
        prenom: r.employes?.prenom ?? "?",
        type_contrat: r.employes?.type_contrat ?? "CDI",
      }));
      return { assignments: out };
    }
  );
