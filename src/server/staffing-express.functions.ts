// v0.35.11 / Sprint Express — Composite "Express" : create + calculate + auto-staff
// (+ publish auto si 0 conflit/0 unfilled). Réduit le flow staffing à 1-2 clics.
//
// Étapes côté serveur :
//  1. createStaffingPlan        → plan draft + plan_objects
//  2. calculateStaffingPlan     → génère les steps (BE → Num → Bois → … → Manut)
//  3. autoStaffPlan             → remplit les assignments (CDI > CDD > Intérim)
//  4. publishStaffingPlan       → SI auto_publish=true ET 0 unfilled ET 0 alerte CNC/pic
//
// Renvoie un résultat agrégé permettant à l'UI d'afficher un bandeau précis :
//  - plan_id, status final
//  - steps_count, filled, unfilled
//  - alertes (CNC, pic atelier)
//  - published (bool) + reason si non publié
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStaffingPlan } from "./staffing-plan-create.functions";
import { calculateStaffingPlan } from "./staffing.functions";
import { autoStaffPlan } from "./staffing-autostaff-plan.functions";
import { publishStaffingPlan } from "./staffing-publish.functions";

interface ExpressResult {
  plan_id: string;
  status: "draft" | "published";
  steps_count: number;
  filled_total: number;
  unfilled_total: number;
  alertes_count: number;
  alertes_critiques: number; // CNC + atelier > 12
  published: boolean;
  publish_reason_skipped?: string;
  drafts_archived: number;
  duration_ms: number;
}

export const createPlanExpress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      affaire_id: string;
      date_debut_fab: string;
      date_fin_fab: string;
      objet_ids: string[];
      auto_publish?: boolean;
    }) =>
      z
        .object({
          affaire_id: z.string().uuid(),
          date_debut_fab: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          date_fin_fab: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          objet_ids: z.array(z.string().uuid()).min(1),
          auto_publish: z.boolean().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }): Promise<ExpressResult> => {
    const t0 = Date.now();

    // 1. Create plan draft + objects
    const created = await createStaffingPlan({
      data: {
        affaire_id: data.affaire_id,
        date_debut_fab: data.date_debut_fab,
        date_fin_fab: data.date_fin_fab,
        objet_ids: data.objet_ids,
      },
    });
    const planId = created.plan_id;

    // 2. Calculate steps
    const calc = await calculateStaffingPlan({ data: { planId } });
    const stepsCount = calc.result.steps.filter(
      (s) => s.start_date !== "TBD",
    ).length;
    const alertes = calc.result.alertes ?? [];
    const alertesCount = alertes.length;
    // Critique : CNC conflit OU pic atelier > 12 (mapping élargi pour rester safe)
    const alertesCritiques = alertes.filter((a) => {
      const t = (a as { type?: string }).type ?? "";
      return /cnc|pic|atelier|conflit/i.test(t);
    }).length;

    // 3. Auto-staff (skip si pas de steps)
    let filled = 0;
    let unfilled = 0;
    if (stepsCount > 0) {
      const as = await autoStaffPlan({ data: { planId } });
      filled = as.filled_total;
      unfilled = as.unfilled_total;
    } else {
      unfilled = 0; // rien à faire
    }

    // 4. Publish auto si demandé et conditions remplies
    const wantsPublish = data.auto_publish === true;
    let published = false;
    let publishSkippedReason: string | undefined;

    if (!wantsPublish) {
      publishSkippedReason = "auto_publish=false";
    } else if (stepsCount === 0) {
      publishSkippedReason = "Aucun créneau calculé";
    } else if (unfilled > 0) {
      publishSkippedReason = `${unfilled} slot(s) non couvert(s)`;
    } else if (alertesCritiques > 0) {
      publishSkippedReason = `${alertesCritiques} alerte(s) critique(s)`;
    } else {
      try {
        await publishStaffingPlan({ data: { planId } });
        published = true;
      } catch (e) {
        publishSkippedReason =
          e instanceof Error ? `Publication échouée : ${e.message}` : "Publication échouée";
      }
    }

    return {
      plan_id: planId,
      status: published ? "published" : "draft",
      steps_count: stepsCount,
      filled_total: filled,
      unfilled_total: unfilled,
      alertes_count: alertesCount,
      alertes_critiques: alertesCritiques,
      published,
      publish_reason_skipped: publishSkippedReason,
      drafts_archived: created.drafts_archived,
      duration_ms: Date.now() - t0,
    };
  });
