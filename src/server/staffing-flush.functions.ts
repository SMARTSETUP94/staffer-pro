// v0.35.x — Batch flush des edits steps (pers/manual_shift/manual_pers).
// Vérifie staffing_plan.updated_at vs baseUpdatedAt client.
// Si mismatch → renvoie { conflict: true, current_updated_at }.
// Sinon UPDATE batch + bump updated_at + renvoie nouveau updated_at.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const editSchema = z.object({
  step_id: z.string().uuid(),
  pers: z.number().int().min(1).max(12).optional(),
  manual_pers: z.boolean().optional(),
  manual_shift: z.number().int().min(-30).max(30).optional(),
  manual_span_demi: z.number().int().min(1).max(200).nullable().optional(),
});

export const flushStepEdits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        plan_id: z.string().uuid(),
        base_updated_at: z.string(),
        force: z.boolean().optional(),
        edits: z.array(editSchema),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: true; updated_at: string; applied: number }
      | { ok: false; conflict: true; current_updated_at: string }
    > => {
      const { supabase } = context;

      // 1. Lecture plan + check updated_at
      const { data: plan, error: pErr } = await supabase
        .from("staffing_plan")
        .select("id, updated_at, status")
        .eq("id", data.plan_id)
        .single();
      if (pErr || !plan) throw new Error(pErr?.message ?? "Plan introuvable");

      if (plan.status !== "draft") {
        throw new Error("Le plan n'est plus en brouillon — modifications interdites.");
      }

      if (!data.force && plan.updated_at !== data.base_updated_at) {
        return {
          ok: false,
          conflict: true,
          current_updated_at: plan.updated_at as string,
        };
      }

      // 2. Vérifier que toutes les steps appartiennent au plan (sécurité)
      const stepIds = data.edits.map((e) => e.step_id);
      if (stepIds.length === 0) {
        return { ok: true, updated_at: plan.updated_at as string, applied: 0 };
      }
      const { data: steps, error: sErr } = await supabase
        .from("staffing_plan_step")
        .select("id, plan_id")
        .in("id", stepIds);
      if (sErr) throw new Error(sErr.message);
      const validIds = new Set((steps ?? []).filter((s) => s.plan_id === data.plan_id).map((s) => s.id as string));

      // 3. UPDATE séquentiel (PostgREST n'a pas de batch UPDATE différencié)
      let applied = 0;
      for (const e of data.edits) {
        if (!validIds.has(e.step_id)) continue;
        const patch: {
          source: string;
          pers?: number;
          manual_pers?: boolean;
          manual_shift?: number;
          manual_span_demi?: number | null;
        } = { source: "manual" };
        if (e.pers !== undefined) patch.pers = e.pers;
        if (e.manual_pers !== undefined) patch.manual_pers = e.manual_pers;
        if (e.manual_shift !== undefined) patch.manual_shift = e.manual_shift;
        if (e.manual_span_demi !== undefined) patch.manual_span_demi = e.manual_span_demi;
        const { error: upErr } = await supabase
          .from("staffing_plan_step")
          .update(patch)
          .eq("id", e.step_id);
        if (upErr) throw new Error(upErr.message);
        applied++;
      }

      // 4. Bump updated_at du plan
      const newUpdated = new Date().toISOString();
      const { error: bErr } = await supabase
        .from("staffing_plan")
        .update({ updated_at: newUpdated })
        .eq("id", data.plan_id);
      if (bErr) throw new Error(bErr.message);

      return { ok: true, updated_at: newUpdated, applied };
    },
  );
