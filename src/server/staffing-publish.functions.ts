// v0.35.5 / Sprint 5 — Publication plan staffing + snapshots + restore + history
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays } from "@/lib/staffing/date-utils";

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
      // Archive : status=archived + parent_plan_id chainage
      await supabase
        .from("staffing_plan")
        .update({ status: "archived", parent_plan_id: planId })
        .in("id", oldIds);
      // Cleanup créneaux Planning issus de l'ancien plan
      await supabase
        .from("assignations")
        .delete()
        .in("staffing_plan_id", oldIds);
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

    /* 5. machine_reservation : déjà gérées par calculate (cnc_principale).
       On s'assure d'avoir bien (re)posé les Num du plan */
    // (handled by calculate; rien à faire de plus ici)

    /* 6. Propagation vers Planning principal — assignations
       Pour chaque assignment (step × employe × date), créer une assignations row
       avec staffing_plan_id, type_operation='auto_staffing', metier_id, heures.
       Les anciennes du même plan_id sont supprimées d'abord pour idempotence. */
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

    return {
      ok: true,
      published_assignments: assignments.length,
      notified_users: employeIds.length,
      affected_days: new Set(assignments.map((a) => a.date)).size,
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

    /* Snapshot pré-restore */
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

    /* DELETE actuel + RESTORE depuis snapshot */
    if (curStepIds.length > 0) {
      await supabase
        .from("staffing_plan_assignment")
        .delete()
        .in("step_id", curStepIds);
    }
    await supabase.from("staffing_plan_step").delete().eq("plan_id", data.planId);

    /* Réinsérer steps avec NEW ids et garder un mapping old->new pour assignments */
    const stepIdMap = new Map<string, string>();
    if (Array.isArray(sd.steps) && sd.steps.length > 0) {
      const stepsRows = sd.steps.map((s) => {
        const r: Record<string, unknown> = {
          plan_id: data.planId,
          metier_id: s.metier_id,
          objet_id: s.objet_id,
          start_date: s.start_date,
          span_days: s.span_days,
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
      // Map (metier_id|objet_id|start_date) -> new id
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

    /* Réinsérer assignments */
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

    /* Plan_object : on laisse en place (la structure objets ne change pas via UI) */

    return { ok: true };
  });

// keep addDays used elsewhere — silence unused warning
void addDays;
