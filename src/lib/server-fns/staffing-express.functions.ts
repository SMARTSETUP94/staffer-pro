// v0.35.11 / Sprint Express — Composite "Express" : create + calculate + auto-staff
// (+ publish auto si 0 conflit/0 unfilled). Réduit le flow staffing à 1-2 clics.
//
// v0.35.12 — ajout `include_weekends` (autorise samedi/dimanche dans l'algo) + alerte délai court.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStaffingPlan } from "./staffing-plan-create.functions";
import { calculateStaffingPlan } from "./staffing.functions";
import { autoStaffPlan } from "./staffing-autostaff-plan.functions";
import { publishStaffingPlan } from "./staffing-publish.functions";
import {
  workingDaysBetween,
  holidaysRange,
  fromISO,
} from "@/lib/staffing/date-utils";

interface ExpressResult {
  plan_id: string;
  status: "draft" | "published";
  steps_count: number;
  filled_total: number;
  unfilled_total: number;
  alertes_count: number;
  alertes_critiques: number;
  published: boolean;
  publish_reason_skipped?: string;
  drafts_archived: number;
  duration_ms: number;
  /** Nombre de jours ouvrés disponibles entre date_debut_fab et date_fin_fab (info UI). */
  jours_ouvres: number;
  /** True si jours_ouvres < 5 → bandeau "délai court". */
  delai_court: boolean;
  include_weekends: boolean;
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
      include_weekends?: boolean;
    }) =>
      z
        .object({
          affaire_id: z.string().uuid(),
          date_debut_fab: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          date_fin_fab: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          objet_ids: z.array(z.string().uuid()).min(1),
          auto_publish: z.boolean().optional(),
          include_weekends: z.boolean().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }): Promise<ExpressResult> => {
    const t0 = Date.now();
    const includeWeekends = data.include_weekends === true;

    // 1. Create
    const created = await createStaffingPlan({
      data: {
        affaire_id: data.affaire_id,
        date_debut_fab: data.date_debut_fab,
        date_fin_fab: data.date_fin_fab,
        objet_ids: data.objet_ids,
        include_weekends: includeWeekends,
      },
    });
    const planId = created.plan_id;

    // 2. Calculate
    const calc = await calculateStaffingPlan({ data: { planId } });
    const stepsCount = calc.result.steps.filter((s) => s.start_date !== "TBD").length;
    const alertes = calc.result.alerts ?? [];
    const alertesCount = alertes.length;
    const alertesCritiques = alertes.filter((a) => a.severity === "hard").length;

    // 3. Auto-staff
    let filled = 0;
    let unfilled = 0;
    if (stepsCount > 0) {
      const as = await autoStaffPlan({ data: { planId } });
      filled = as.filled_total;
      unfilled = as.unfilled_total;
    }

    // 4. Publish auto
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

    // Délai court : compte jours ouvrés (avec ou sans weekend selon flag)
    const livYear = fromISO(data.date_fin_fab).getUTCFullYear();
    const holidays = holidaysRange(livYear - 1, livYear + 1);
    const joursOuvres = workingDaysBetween(
      data.date_debut_fab,
      data.date_fin_fab,
      holidays,
      includeWeekends,
    );
    const delaiCourt = joursOuvres < 5;

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
      jours_ouvres: joursOuvres,
      delai_court: delaiCourt,
      include_weekends: includeWeekends,
    };
  });
