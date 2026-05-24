/**
 * Lot 8.3b — Mutations équipe Fiche Objet.
 *
 * 3 server functions accessibles à toute personne avec la capability
 * `objet.team.manage` (admin, chef_chantier, chef_metier_scoped, atelier_chef) :
 *
 *   - `autoStaffObjet({ objetId })` : extrait la logique de `autoStaffStep` et
 *     l'applique à TOUS les steps publiés liés à l'objet. Aucune écriture si
 *     pas de plan publié (renvoie no_plan).
 *
 *   - `assignManualToObjet({ objetId, employeId, metierId, presencePct })` :
 *     ajoute une assignation manuelle sur le step (objet, métier) du plan
 *     publié, pour TOUS les jours ouvrés couverts. `manual_assignment_origin`
 *     est passé à `true` pour exclure ces lignes du check PRESENCE_MISMATCH
 *     côté cron divergence. `presencePct` par défaut = 100.
 *
 *   - `removeEmployeFromObjet({ objetId, employeId, metierId })` : supprime
 *     toutes les assignations de l'employé sur les steps (objet, métier)
 *     du plan publié.
 *
 * Sécurité : check cap server-side via `current_user_has_capability`, puis
 * écritures via le client authentifié (RLS s'applique pour les rôles chef/
 * admin) ou via supabaseAdmin si le rôle est cap-only sans RLS (atelier_chef).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getResourceAvailability } from "@/lib/staffing/resource-availability";
import { rankCandidats, type EmployeStaffing } from "@/lib/staffing/tier-ranking";
import { loadNiveauxParEmploye } from "./staffing-competences.server";

// ────────────────────────────────────────────────────────────
// Helpers communs
// ────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type SupaCtx = SupabaseClient<Database>;

/** Liste les jours ouvrés (lun–ven) couverts par un step. */
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

/** Vérifie la cap `objet.team.manage` côté serveur. Throw 401/403 sinon. */
async function assertCanManageEquipe(supabase: SupaCtx) {
  const { data, error } = await supabase.rpc("current_user_has_capability", {
    _cap_key: "objet.team.manage",
  });
  if (error) throw new Error(`cap check failed: ${error.message}`);
  if (!data) throw new Error("Accès refusé : capability objet.team.manage requise");
}


interface PublishedStep {
  id: string;
  metier_id: number;
  start_date: string;
  span_days: number;
  pers: number;
  plan_id: string;
}

/** Récupère les steps du plan PUBLIÉ lié à un objet, pour un métier optionnel. */
async function loadPublishedStepsForObjet(
  supabase: SupaCtx,
  objetId: string,
  metierId?: number
): Promise<{ steps: PublishedStep[]; planId: string | null; affaireId: string | null }> {
  let query = supabase
    .from("staffing_plan_step")
    .select(
      "id, metier_id, start_date, span_days, pers, plan_id, staffing_plan!inner(status, affaire_id)"
    )
    .eq("objet_id", objetId);
  if (metierId !== undefined) query = query.eq("metier_id", metierId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  type Row = PublishedStep & {
    staffing_plan: { status: string; affaire_id: string } | { status: string; affaire_id: string }[];
  };
  const all = (data ?? []) as unknown as Row[];
  // Hotfix 8.3 : autorise mutations sur plan draft OU published.
  // Préfère un plan publié s'il en existe un, sinon prend le brouillon.
  const mutable = all.filter((r) => {
    const sp = Array.isArray(r.staffing_plan) ? r.staffing_plan[0] : r.staffing_plan;
    return sp?.status === "published" || sp?.status === "draft";
  });
  if (mutable.length === 0) return { steps: [], planId: null, affaireId: null };

  const getStatus = (r: Row) =>
    (Array.isArray(r.staffing_plan) ? r.staffing_plan[0] : r.staffing_plan)?.status;
  const publishedOnly = mutable.filter((r) => getStatus(r) === "published");
  const picked = publishedOnly.length > 0 ? publishedOnly : mutable;
  const pickedPlanId = picked[0].plan_id;
  // Garde uniquement les steps du plan choisi (évite mix draft+published).
  const sameplan = picked.filter((r) => r.plan_id === pickedPlanId);

  const first = sameplan[0];
  const sp = Array.isArray(first.staffing_plan) ? first.staffing_plan[0] : first.staffing_plan;
  return {
    steps: sameplan.map(({ staffing_plan: _sp, ...rest }) => rest),
    planId: first.plan_id,
    affaireId: sp.affaire_id,
  };
}

// ────────────────────────────────────────────────────────────
// 1) autoStaffObjet — auto-remplit tous les steps de l'objet
// ────────────────────────────────────────────────────────────

interface AutoStaffObjetResult {
  ok: boolean;
  status: "filled" | "no_plan" | "all_full";
  filled: number;
  skipped: number;
  per_step: Array<{ step_id: string; metier_id: number; filled: number; skipped: number }>;
}

export const autoStaffObjet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { objetId: string }) =>
    z.object({ objetId: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }): Promise<AutoStaffObjetResult> => {
    const { supabase } = context;
    await assertCanManageEquipe(supabase);

    const { steps, planId } = await loadPublishedStepsForObjet(supabase, data.objetId);
    if (steps.length === 0 || !planId) {
      return { ok: false, status: "no_plan", filled: 0, skipped: 0, per_step: [] };
    }

    // Employés actifs
    const { data: emps, error: empErr } = await supabaseAdmin
      .from("employes")
      .select(
        "id, nom, prenom, metier_principal_id, metiers_secondaires, competences_polyvalentes, niveau_seniorite, type_contrat, actif, non_staffing"
      )
      .eq("actif", true)
      .eq("non_staffing", false);
    if (empErr) throw new Error(empErr.message);
    const niveauxMap = await loadNiveauxParEmploye(supabaseAdmin);
    const employes: EmployeStaffing[] = (emps ?? []).map((e) => ({
      id: e.id as string,
      nom: e.nom as string,
      prenom: e.prenom as string,
      metier_principal_id: e.metier_principal_id as number,
      metiers_secondaires: (e.metiers_secondaires ?? []) as number[],
      niveaux_par_metier: niveauxMap[e.id as string] ?? {},
      competences_polyvalentes: (e.competences_polyvalentes ?? {}) as Record<string, boolean>,
      niveau_seniorite: (e.niveau_seniorite ?? 3) as number,
      type_contrat: (e.type_contrat as "CDI" | "CDD" | "Interim") ?? "CDI",
      actif: true,
      non_staffing: false,
    }));

    // Fenêtre globale couverte par l'objet
    let minDate = "";
    let maxDate = "";
    for (const s of steps) {
      const days = workingDaysOfStep(s.start_date, s.span_days);
      if (days.length === 0) continue;
      if (!minDate || days[0] < minDate) minDate = days[0];
      if (!maxDate || days[days.length - 1] > maxDate) maxDate = days[days.length - 1];
    }
    if (!minDate) return { ok: true, status: "all_full", filled: 0, skipped: 0, per_step: [] };

    const avail = await getResourceAvailability(supabaseAdmin, {
      date_debut: minDate,
      date_fin: maxDate,
      exclude_plan_id: planId,
    });

    // Assignations existantes sur CE plan
    const { data: ownAssigns } = await supabaseAdmin
      .from("staffing_plan_assignment")
      .select("employe_id, date, presence_pct, step_id, staffing_plan_step!inner(plan_id)")
      .gte("date", minDate)
      .lte("date", maxDate)
      .eq("staffing_plan_step.plan_id", planId);

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

    type OwnRow = { employe_id: string; date: string; step_id: string; presence_pct: number };
    const ownRows = (ownAssigns ?? []) as OwnRow[];

    const inserts: Array<{
      step_id: string;
      employe_id: string;
      date: string;
      presence_pct: number;
      manual_assignment_origin: boolean;
    }> = [];
    const perStep: AutoStaffObjetResult["per_step"] = [];
    let totalFilled = 0;
    let totalSkipped = 0;

    for (const step of steps) {
      const days = workingDaysOfStep(step.start_date, step.span_days);
      const target = step.pers * 100;
      const totalOnStep: Record<string, number> = {};
      const assignedOnStep: Record<string, Set<string>> = {};
      for (const a of ownRows) {
        if (a.step_id !== step.id) continue;
        totalOnStep[a.date] = (totalOnStep[a.date] ?? 0) + (a.presence_pct ?? 100);
        assignedOnStep[a.date] ??= new Set();
        assignedOnStep[a.date].add(a.employe_id);
      }

      let stepFilled = 0;
      let stepSkipped = 0;
      for (const date of days) {
        let placed = totalOnStep[date] ?? 0;
        if (placed >= target) continue;

        const occMap: Record<string, { occupation_pct_moyenne: number; par_jour: Record<string, number> }> = {};
        for (const e of employes) {
          const c = cumul[`${e.id}|${date}`] ?? 0;
          occMap[e.id] = { occupation_pct_moyenne: c, par_jour: { [date]: c } };
        }
        const ranked = rankCandidats(employes, step.metier_id, occMap);

        for (const cand of ranked) {
          if (placed >= target) break;
          const empId = cand.employe.id;
          if (assignedOnStep[date]?.has(empId)) continue;
          const dispo = 100 - (cumul[`${empId}|${date}`] ?? 0);
          if (dispo <= 0) continue;
          const pct = Math.min(100, dispo, target - placed);
          if (pct < 10) continue;
          const rounded = Math.round(pct / 10) * 10;
          if (rounded < 10) continue;

          inserts.push({
            step_id: step.id,
            employe_id: empId,
            date,
            presence_pct: rounded,
            manual_assignment_origin: false,
          });
          cumul[`${empId}|${date}`] = (cumul[`${empId}|${date}`] ?? 0) + rounded;
          placed += rounded;
          assignedOnStep[date] ??= new Set();
          assignedOnStep[date].add(empId);
          stepFilled++;
        }
        if (placed < target) stepSkipped += Math.ceil((target - placed) / 100);
      }
      totalFilled += stepFilled;
      totalSkipped += stepSkipped;
      perStep.push({ step_id: step.id, metier_id: step.metier_id, filled: stepFilled, skipped: stepSkipped });
    }

    if (inserts.length > 0) {
      const { error: insErr } = await supabaseAdmin
        .from("staffing_plan_assignment")
        .insert(inserts);
      if (insErr) throw new Error(insErr.message);
    }

    return {
      ok: true,
      status: totalFilled > 0 ? "filled" : "all_full",
      filled: totalFilled,
      skipped: totalSkipped,
      per_step: perStep,
    };
  });

// ────────────────────────────────────────────────────────────
// 2) assignManualToObjet — ajout manuel
// ────────────────────────────────────────────────────────────

interface AssignManualResult {
  ok: boolean;
  status: "inserted" | "no_plan" | "already_assigned" | "cumul_exceeded";
  inserted: number;
  skipped_days: string[];
  warning_cumul?: { date: string; total_pct: number }[];
}

export const assignManualToObjet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    objetId: string;
    employeId: string;
    metierId: number;
    presencePct?: number;
  }) =>
    z
      .object({
        objetId: z.string().uuid(),
        employeId: z.string().uuid(),
        metierId: z.number().int().min(1).max(20),
        presencePct: z.number().int().min(10).max(100).default(100),
      })
      .parse(d)
  )
  .handler(async ({ data, context }): Promise<AssignManualResult> => {
    const { supabase } = context;
    await assertCanManageEquipe(supabase);

    const presence = data.presencePct ?? 100;
    const { steps, planId } = await loadPublishedStepsForObjet(
      supabase,
      data.objetId,
      data.metierId
    );
    if (steps.length === 0 || !planId) {
      return { ok: false, status: "no_plan", inserted: 0, skipped_days: [] };
    }

    // Collecte tous les jours ouvrés couverts par les steps du métier sur cet objet
    const stepDayMap: Array<{ step_id: string; date: string }> = [];
    for (const s of steps) {
      for (const d of workingDaysOfStep(s.start_date, s.span_days)) {
        stepDayMap.push({ step_id: s.id, date: d });
      }
    }
    if (stepDayMap.length === 0) {
      return { ok: false, status: "no_plan", inserted: 0, skipped_days: [] };
    }

    const dateMin = stepDayMap.reduce((m, x) => (m < x.date ? m : x.date), stepDayMap[0].date);
    const dateMax = stepDayMap.reduce((m, x) => (m > x.date ? m : x.date), stepDayMap[0].date);

    // Vérifier les jours déjà assignés (même employé, même step)
    const { data: existing } = await supabaseAdmin
      .from("staffing_plan_assignment")
      .select("step_id, date, presence_pct")
      .eq("employe_id", data.employeId)
      .gte("date", dateMin)
      .lte("date", dateMax);
    const existingSet = new Set(
      (existing ?? []).map((e) => `${e.step_id as string}|${e.date as string}`)
    );

    // Cumul actuel par jour pour CET employé sur TOUS plans publiés
    const { data: cumulRows } = await supabaseAdmin
      .from("staffing_plan_assignment")
      .select("date, presence_pct, staffing_plan_step!inner(plan_id, staffing_plan!inner(status))")
      .eq("employe_id", data.employeId)
      .gte("date", dateMin)
      .lte("date", dateMax);
    const cumulByDate: Record<string, number> = {};
    type CRow = {
      date: string;
      presence_pct: number;
      staffing_plan_step: { staffing_plan: { status: string } | { status: string }[] };
    };
    for (const r of (cumulRows ?? []) as unknown as CRow[]) {
      const sps = r.staffing_plan_step;
      const sp = Array.isArray(sps.staffing_plan) ? sps.staffing_plan[0] : sps.staffing_plan;
      if (sp?.status !== "published") continue;
      cumulByDate[r.date] = (cumulByDate[r.date] ?? 0) + (r.presence_pct ?? 0);
    }

    const inserts: Array<{
      step_id: string;
      employe_id: string;
      date: string;
      presence_pct: number;
      manual_assignment_origin: boolean;
    }> = [];
    const skipped: string[] = [];
    const warnings: { date: string; total_pct: number }[] = [];

    for (const { step_id, date } of stepDayMap) {
      if (existingSet.has(`${step_id}|${date}`)) {
        skipped.push(date);
        continue;
      }
      const futurCumul = (cumulByDate[date] ?? 0) + presence;
      if (futurCumul > 100) {
        warnings.push({ date, total_pct: futurCumul });
      }
      inserts.push({
        step_id,
        employe_id: data.employeId,
        date,
        presence_pct: presence,
        manual_assignment_origin: true,
      });
      cumulByDate[date] = futurCumul;
    }

    if (inserts.length === 0) {
      return { ok: false, status: "already_assigned", inserted: 0, skipped_days: skipped };
    }

    const { error: insErr } = await supabaseAdmin
      .from("staffing_plan_assignment")
      .insert(inserts);
    if (insErr) throw new Error(insErr.message);

    return {
      ok: true,
      status: warnings.length > 0 ? "cumul_exceeded" : "inserted",
      inserted: inserts.length,
      skipped_days: skipped,
      warning_cumul: warnings.length > 0 ? warnings : undefined,
    };
  });

// ────────────────────────────────────────────────────────────
// 3) removeEmployeFromObjet — retrait
// ────────────────────────────────────────────────────────────

interface RemoveResult {
  ok: boolean;
  deleted: number;
}

export const removeEmployeFromObjet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { objetId: string; employeId: string; metierId: number }) =>
    z
      .object({
        objetId: z.string().uuid(),
        employeId: z.string().uuid(),
        metierId: z.number().int().min(1).max(20),
      })
      .parse(d)
  )
  .handler(async ({ data, context }): Promise<RemoveResult> => {
    const { supabase } = context;
    await assertCanManageEquipe(supabase);

    const { steps } = await loadPublishedStepsForObjet(supabase, data.objetId, data.metierId);
    if (steps.length === 0) return { ok: true, deleted: 0 };

    const stepIds = steps.map((s) => s.id);
    const { data: deleted, error } = await supabaseAdmin
      .from("staffing_plan_assignment")
      .delete()
      .eq("employe_id", data.employeId)
      .in("step_id", stepIds)
      .select("id");
    if (error) throw new Error(error.message);

    return { ok: true, deleted: (deleted ?? []).length };
  });

// ────────────────────────────────────────────────────────────
// 4) Picker — liste les employés candidats pour un métier
// ────────────────────────────────────────────────────────────

export interface CandidatEmploye {
  id: string;
  nom: string;
  prenom: string;
  metier_principal_id: number;
  type_contrat: string;
  tier: 1 | 2 | 3 | 4;
  is_principal: boolean;
}

export const listCandidatsForMetier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { metierId: number }) =>
    z.object({ metierId: z.number().int().min(1).max(20) }).parse(d)
  )
  .handler(async ({ data, context }): Promise<CandidatEmploye[]> => {
    const { supabase } = context;
    await assertCanManageEquipe(supabase);

    const { data: emps, error } = await supabaseAdmin
      .from("employes")
      .select(
        "id, nom, prenom, metier_principal_id, metiers_secondaires, competences_polyvalentes, niveau_seniorite, type_contrat"
      )
      .eq("actif", true)
      .eq("non_staffing", false);
    if (error) throw new Error(error.message);

    const niveauxMap = await loadNiveauxParEmploye(supabaseAdmin);
    const employes: EmployeStaffing[] = (emps ?? []).map((e) => ({
      id: e.id as string,
      nom: e.nom as string,
      prenom: e.prenom as string,
      metier_principal_id: e.metier_principal_id as number,
      metiers_secondaires: (e.metiers_secondaires ?? []) as number[],
      niveaux_par_metier: niveauxMap[e.id as string] ?? {},
      competences_polyvalentes: (e.competences_polyvalentes ?? {}) as Record<string, boolean>,
      niveau_seniorite: (e.niveau_seniorite ?? 3) as number,
      type_contrat: (e.type_contrat as "CDI" | "CDD" | "Interim") ?? "CDI",
      actif: true,
      non_staffing: false,
    }));

    const ranked = rankCandidats(employes, data.metierId, {});
    return ranked.map((r) => ({
      id: r.employe.id,
      nom: r.employe.nom,
      prenom: r.employe.prenom,
      metier_principal_id: r.employe.metier_principal_id,
      type_contrat: r.employe.type_contrat,
      tier: r.tier,
      is_principal: r.employe.metier_principal_id === data.metierId,
    }));
  });
