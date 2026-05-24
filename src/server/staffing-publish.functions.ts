// v0.35.5 → Sprint B (refonte staffing) — Publication plan + sync équipes 3 niveaux
//
// Sprint B C1 : extraction `syncEquipesFromPlan` interne, appelée par :
//   - publishStaffingPlan (status='published' AVANT)
//   - backfillEquipesFromExistingPlans (B9, sans toucher au statut)
//
// Objectifs sync :
//   - UPSERT affaire_equipe  (N2) : 1 ligne par (affaire_id, employe_id, phase)
//   - UPSERT fabrication_objet_equipe (N3) : 1 ligne par (objet_id, employe_id)
//   - UPDATE assignations.phase depuis steps.phase (propagation)
//
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays } from "@/lib/staffing/date-utils";

/* ------------------------------------------------------------------ */
/* Phases acceptées par affaire_equipe.phase (CHECK constraint)        */
/* ------------------------------------------------------------------ */
const VALID_AFFAIRE_PHASES = new Set([
  "commercial_etude",
  "fabrication",
  "montage",
  "demontage",
]);

function normalizePhase(raw: string | null | undefined): string {
  if (raw && VALID_AFFAIRE_PHASES.has(raw)) return raw;
  return "fabrication"; // défaut sain pour plans staffing fabrication
}

/* ------------------------------------------------------------------ */
/* syncEquipesFromPlan (interne)                                       */
/*                                                                     */
/* Pure idempotent — peut être appelée sur draft OU published.         */
/* Ne touche JAMAIS staffing_plan.status.                              */
/* ------------------------------------------------------------------ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaCtx = any;

/**
 * Sync équipes 3 niveaux depuis un plan staffing.
 *
 * Implémentation : délègue à la RPC SQL `sync_equipes_from_plan(plan_id, user_id)`
 * (SECURITY DEFINER, atomique, bypass du trigger enforce_objet_equipe_strict
 * via SET LOCAL dans la même session — cf. mem://debts/bypass-objet-equipe-strict-temp).
 *
 * Ne modifie JAMAIS staffing_plan.status. Idempotent.
 */
export async function syncEquipesFromPlan(
  supabase: SupaCtx,
  planId: string,
  userId: string | null,
): Promise<{ n2_upserts: number; n3_upserts: number; phase_updates: number }> {
  const { data, error } = await supabase.rpc("sync_equipes_from_plan", {
    p_plan_id: planId,
    p_user_id: userId,
  });
  if (error) throw new Error(`sync_equipes_from_plan: ${error.message}`);
  const r = (data ?? {}) as {
    n2_upserts?: number;
    n3_upserts?: number;
    phase_updates?: number;
  };
  return {
    n2_upserts: r.n2_upserts ?? 0,
    n3_upserts: r.n3_upserts ?? 0,
    phase_updates: r.phase_updates ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/* publishStaffingPlan                                                 */
/* ------------------------------------------------------------------ */
export const publishStaffingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string }) =>
    z.object({ planId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { planId } = data;

    /* 1. Plan + objets + steps + assignments — snapshot complet */
    const { data: plan, error: planErr } = await supabase
      .from("staffing_plan")
      .select("id, affaire_id, date_debut_fab, date_fin_fab, status")
      .eq("id", planId)
      .single();
    if (planErr || !plan) throw new Error(planErr?.message ?? "Plan introuvable");
    if (plan.status !== "draft") throw new Error("Seul un plan en brouillon peut être publié");

    const { data: objets } = await supabase
      .from("staffing_plan_object")
      .select("*")
      .eq("plan_id", planId);

    const { data: steps } = await supabase
      .from("staffing_plan_step")
      .select("*")
      .eq("plan_id", planId);

    const stepIds = (steps ?? []).map((s) => s.id as string);
    let assignments: Array<{
      id: string;
      step_id: string;
      employe_id: string;
      date: string;
      presence_pct: number;
    }> = [];
    if (stepIds.length > 0) {
      const { data: asg } = await supabase
        .from("staffing_plan_assignment")
        .select("id, step_id, employe_id, date, presence_pct")
        .in("step_id", stepIds);
      assignments = (asg ?? []) as typeof assignments;
    }

    /* 2. Snapshot avant publication */
    await supabase.from("staffing_plan_snapshot").insert({
      plan_id: planId,
      reason: "publish",
      created_by: userId,
      snapshot_data: {
        plan,
        objets: objets ?? [],
        steps: steps ?? [],
        assignments,
      },
    });

    /* 3. Archiver l'ancien published de la même affaire (s'il existe) */
    const { data: oldPublished } = await supabase
      .from("staffing_plan")
      .select("id")
      .eq("affaire_id", plan.affaire_id)
      .eq("status", "published")
      .neq("id", planId);
    if (oldPublished && oldPublished.length > 0) {
      const oldIds = oldPublished.map((p) => p.id as string);
      await supabase
        .from("staffing_plan")
        .update({ status: "archived", parent_plan_id: planId })
        .in("id", oldIds);
      await supabase.from("assignations").delete().in("staffing_plan_id", oldIds);
    }

    /* 4. Passer ce plan en published */
    const { error: upErr } = await supabase
      .from("staffing_plan")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        published_by: userId,
      })
      .eq("id", planId);
    if (upErr) throw new Error(upErr.message);

    /* 6. Propagation vers Planning principal — assignations */
    await supabase.from("assignations").delete().eq("staffing_plan_id", planId);

    if (assignments.length > 0 && steps && steps.length > 0) {
      const stepById = new Map<string, (typeof steps)[number]>();
      for (const s of steps) stepById.set(s.id as string, s);

      const rows = assignments
        .map((a) => {
          const step = stepById.get(a.step_id);
          if (!step) return null;
          const heures = Math.max(
            1,
            Math.round((step.h_par_jour ?? 8) * (a.presence_pct / 100)),
          );
          return {
            affaire_id: plan.affaire_id,
            employe_id: a.employe_id,
            metier_id: step.metier_id,
            date: a.date,
            demi_journee: "JOURNEE" as const,
            heures,
            type_operation: "auto_staffing",
            staffing_plan_id: planId,
            phase: (step.phase as string | null) ?? null,
            created_by: userId,
            statut_confirmation: "non_requise" as const,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (rows.length > 0) {
        const { error: assErr } = await supabase.from("assignations").insert(rows);
        if (assErr) throw new Error(`Propagation assignations : ${assErr.message}`);
      }
    }

    /* 6.bis SPRINT B — Sync équipes 3 niveaux (N2 affaire_equipe + N3 objet_equipe) */
    const equipesResult = await syncEquipesFromPlan(supabase, planId, userId);

    /* 7. Notifications aux employés affectés */
    const employeIds = Array.from(new Set(assignments.map((a) => a.employe_id)));
    if (employeIds.length > 0) {
      const { data: emps } = await supabase
        .from("employes")
        .select("id, profile_id, prenom")
        .in("id", employeIds);

      const { data: aff } = await supabase
        .from("affaires")
        .select("numero, nom")
        .eq("id", plan.affaire_id)
        .single();

      const dates = assignments.map((a) => a.date).sort();
      const dMin = dates[0];
      const dMax = dates[dates.length - 1];
      const fmt = (iso: string) => {
        const [y, m, d] = iso.split("-");
        return `${d}/${m}/${y}`;
      };

      const notifs = (emps ?? [])
        .filter((e) => e.profile_id)
        .map((e) => ({
          user_id: e.profile_id as string,
          type: "staffing_publie" as const,
          titre: "Nouveau staffing publié",
          message: `${aff?.numero ?? ""} — ${aff?.nom ?? ""} : créneaux du ${fmt(dMin)} au ${fmt(dMax)}.`,
          lien: `/ma-semaine`,
          metadata: { plan_id: planId, affaire_id: plan.affaire_id },
        }));

      if (notifs.length > 0) {
        await supabase.from("notifications").insert(notifs);
      }
    }

    /* 8. Audit enrichi (Sprint B) — note : table staffing_audit n'existe pas
       encore (à créer Sprint D avec ux_telemetry_events). Pour l'instant
       les compteurs equipes sont retournés dans le payload de la fn. */

    return {
      ok: true,
      published_assignments: assignments.length,
      notified_users: employeIds.length,
      affected_days: new Set(assignments.map((a) => a.date)).size,
      equipes_n2: equipesResult.n2_upserts,
      equipes_n3: equipesResult.n3_upserts,
      phase_updates: equipesResult.phase_updates,
    };
  });

/* ------------------------------------------------------------------ */
/* backfillEquipesFromExistingPlans (Sprint B — B9)                    */
/*                                                                     */
/* Re-synchronise les équipes 3 niveaux depuis les plans existants     */
/* SANS modifier leur statut. Idempotent.                              */
/*                                                                     */
/* Admin uniquement (filtré côté serveur).                             */
/* ------------------------------------------------------------------ */
export const backfillEquipesFromExistingPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { statusFilter?: "draft" | "published" | "all" }) =>
    z.object({ statusFilter: z.enum(["draft", "published", "all"]).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Garde-fou rôle admin
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId as string);
    const isAdmin = (roles ?? []).some((r) => (r.role as string) === "admin");
    if (!isAdmin) throw new Error("Accès admin requis pour backfill équipes");

    const filter = data.statusFilter ?? "draft";

    // Snapshot statuts AVANT (garde-fou C1)
    let q = supabase.from("staffing_plan").select("id, status, affaire_id");
    if (filter !== "all") q = q.eq("status", filter);
    const { data: plans, error } = await q;
    if (error) throw new Error(error.message);

    const statusBefore = new Map<string, string>();
    for (const p of plans ?? []) {
      statusBefore.set(p.id as string, p.status as string);
    }

    const results: Array<{
      plan_id: string;
      affaire_id: string;
      n2: number;
      n3: number;
      phase_updates: number;
    }> = [];

    for (const p of plans ?? []) {
      try {
        const r = await syncEquipesFromPlan(supabase, p.id as string, userId);
        results.push({
          plan_id: p.id as string,
          affaire_id: p.affaire_id as string,
          n2: r.n2_upserts,
          n3: r.n3_upserts,
          phase_updates: r.phase_updates,
        });
      } catch (err) {
        results.push({
          plan_id: p.id as string,
          affaire_id: p.affaire_id as string,
          n2: -1,
          n3: -1,
          phase_updates: -1,
        });
        console.error(`backfill plan ${p.id} error`, err);
      }
    }

    // Vérification statuts APRÈS (garde-fou C1)
    const { data: plansAfter } = await supabase
      .from("staffing_plan")
      .select("id, status")
      .in("id", Array.from(statusBefore.keys()));
    const statusDrift: Array<{ plan_id: string; before: string; after: string }> = [];
    for (const p of plansAfter ?? []) {
      const before = statusBefore.get(p.id as string);
      const after = p.status as string;
      if (before && before !== after) {
        statusDrift.push({ plan_id: p.id as string, before, after });
      }
    }
    if (statusDrift.length > 0) {
      throw new Error(
        `INVARIANT BROKEN — statuts modifiés involontairement : ${JSON.stringify(statusDrift)}`,
      );
    }

    return {
      ok: true,
      plans_processed: results.length,
      status_preserved: true,
      total_n2: results.reduce((s, r) => s + Math.max(0, r.n2), 0),
      total_n3: results.reduce((s, r) => s + Math.max(0, r.n3), 0),
      total_phase_updates: results.reduce((s, r) => s + Math.max(0, r.phase_updates), 0),
      errors: results.filter((r) => r.n2 === -1).length,
      details: results,
    };
  });

/* ------------------------------------------------------------------ */
/* listPlanSnapshots                                                   */
/* ------------------------------------------------------------------ */
export const listPlanSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string }) =>
    z.object({ planId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: snaps, error } = await supabase
      .from("staffing_plan_snapshot")
      .select("id, reason, created_by, created_at, snapshot_data")
      .eq("plan_id", data.planId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const userIds = Array.from(
      new Set((snaps ?? []).map((s) => s.created_by).filter((x): x is string => !!x)),
    );
    let profilesById = new Map<string, { full_name: string | null; email: string }>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      for (const p of profs ?? []) {
        profilesById.set(p.id as string, {
          full_name: (p.full_name as string | null) ?? null,
          email: p.email as string,
        });
      }
    }

    return (snaps ?? []).map((s) => ({
      id: s.id as string,
      reason: s.reason as string,
      created_at: s.created_at as string,
      created_by: s.created_by as string | null,
      created_by_name:
        s.created_by && profilesById.has(s.created_by as string)
          ? profilesById.get(s.created_by as string)!.full_name ??
            profilesById.get(s.created_by as string)!.email
          : null,
      snapshot_data: s.snapshot_data,
    }));
  });

/* ------------------------------------------------------------------ */
/* restorePlanSnapshot                                                 */
/* ------------------------------------------------------------------ */
export const restorePlanSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string; snapshotId: string }) =>
    z
      .object({
        planId: z.string().uuid(),
        snapshotId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: snap, error: sErr } = await supabase
      .from("staffing_plan_snapshot")
      .select("snapshot_data, plan_id")
      .eq("id", data.snapshotId)
      .single();
    if (sErr || !snap) throw new Error(sErr?.message ?? "Snapshot introuvable");
    if (snap.plan_id !== data.planId) throw new Error("Snapshot d'un autre plan");

    const sd = snap.snapshot_data as {
      objets?: Array<Record<string, unknown>>;
      steps?: Array<Record<string, unknown>>;
      assignments?: Array<Record<string, unknown>>;
    };

    const { data: curSteps } = await supabase
      .from("staffing_plan_step")
      .select("*")
      .eq("plan_id", data.planId);
    const curStepIds = (curSteps ?? []).map((s) => s.id as string);
    const { data: curAsg } = curStepIds.length
      ? await supabase
          .from("staffing_plan_assignment")
          .select("*")
          .in("step_id", curStepIds)
      : { data: [] as Array<Record<string, unknown>> };
    const { data: curObjets } = await supabase
      .from("staffing_plan_object")
      .select("*")
      .eq("plan_id", data.planId);

    await supabase.from("staffing_plan_snapshot").insert({
      plan_id: data.planId,
      reason: "restore",
      created_by: userId,
      snapshot_data: {
        objets: curObjets ?? [],
        steps: curSteps ?? [],
        assignments: curAsg ?? [],
      } as never,
    } as never);

    if (curStepIds.length > 0) {
      await supabase
        .from("staffing_plan_assignment")
        .delete()
        .in("step_id", curStepIds);
    }
    await supabase.from("staffing_plan_step").delete().eq("plan_id", data.planId);

    const stepIdMap = new Map<string, string>();
    if (Array.isArray(sd.steps) && sd.steps.length > 0) {
      const stepsRows = sd.steps.map((s) => {
        const r: Record<string, unknown> = {
          plan_id: data.planId,
          metier_id: s.metier_id,
          objet_id: s.objet_id,
          start_date: s.start_date,
          span_days: s.span_days,
          span_demi_jours: s.span_demi_jours ?? (typeof s.span_days === "number" ? s.span_days * 2 : null),
          start_half_day: s.start_half_day ?? "AM",
          phase: s.phase ?? null,
          pers: s.pers,
          h_par_jour: s.h_par_jour ?? 8,
          manual_shift: s.manual_shift ?? 0,
          manual_pers: s.manual_pers ?? false,
          source: s.source ?? "manual",
        };
        return r;
      });
      const { data: insSteps, error: insErr } = await supabase
        .from("staffing_plan_step")
        .insert(stepsRows as never)
        .select("id, metier_id, objet_id, start_date");
      if (insErr) throw new Error(insErr.message);
      const newKey = new Map<string, string>();
      for (const r of insSteps ?? []) {
        newKey.set(
          `${r.metier_id}|${r.objet_id ?? "_null_"}|${r.start_date}`,
          r.id as string,
        );
      }
      for (const s of sd.steps) {
        const k = `${s.metier_id}|${s.objet_id ?? "_null_"}|${s.start_date}`;
        const newId = newKey.get(k);
        if (newId && s.id) stepIdMap.set(s.id as string, newId);
      }
    }

    if (Array.isArray(sd.assignments) && sd.assignments.length > 0) {
      const asgRows = sd.assignments
        .map((a) => {
          const newStepId = stepIdMap.get(a.step_id as string);
          if (!newStepId) return null;
          return {
            step_id: newStepId,
            employe_id: a.employe_id,
            date: a.date,
            presence_pct: a.presence_pct ?? 100,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (asgRows.length > 0) {
        await supabase.from("staffing_plan_assignment").insert(asgRows as never);
      }
    }

    return { ok: true };
  });

void addDays;
