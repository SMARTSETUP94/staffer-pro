// v0.35.4 / Sprint 4 — Server functions création plan via Wizard
// - listFabObjetsForWizard: liste les fabrication_objets non archivés d'une affaire
// - getActivePlansForAffaire: renvoie les plans existants (draft/published) pour cette affaire
// - createStaffingPlan: crée un plan draft + plan_objects, archive les anciens si demandé
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------------------------------------------------------------ */
/* listFabObjetsForWizard                                              */
/* ------------------------------------------------------------------ */
export const listFabObjetsForWizard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { affaire_id: string }) =>
    z.object({ affaire_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("fabrication_objets")
      .select(
        "id, reference, nom, quantite, archive, heures_prevues_be, heures_prevues_numerique, heures_prevues_bois, heures_prevues_metal, heures_prevues_peinture, heures_prevues_tapisserie, heures_prevues_manutention",
      )
      .eq("affaire_id", data.affaire_id)
      .eq("archive", false)
      .order("ordre", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const h_be = Number(r.heures_prevues_be ?? 0);
      const h_num = Number(r.heures_prevues_numerique ?? 0);
      const h_bois = Number(r.heures_prevues_bois ?? 0);
      const h_metal = Number(r.heures_prevues_metal ?? 0);
      const h_peint = Number(r.heures_prevues_peinture ?? 0);
      const h_tap = Number(r.heures_prevues_tapisserie ?? 0);
      const h_manut = Number(r.heures_prevues_manutention ?? 0);
      return {
        id: r.id as string,
        reference: r.reference as string,
        nom: r.nom as string,
        quantite: Number(r.quantite ?? 1),
        h_bois,
        heures_total: h_be + h_num + h_bois + h_metal + h_peint + h_tap + h_manut,
      };
    });
  });

/* ------------------------------------------------------------------ */
/* getActivePlansForAffaire                                            */
/* ------------------------------------------------------------------ */
export const getActivePlansForAffaire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { affaire_id: string }) =>
    z.object({ affaire_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("staffing_plan")
      .select("id, status, date_debut_fab, date_fin_fab, created_at, published_at")
      .eq("affaire_id", data.affaire_id)
      .in("status", ["draft", "published"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ------------------------------------------------------------------ */
/* createStaffingPlan                                                  */
/* ------------------------------------------------------------------ */
export const createStaffingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      affaire_id: string;
      date_debut_fab: string;
      date_fin_fab: string;
      objet_ids: string[];
      archive_existing?: boolean;
    }) =>
      z
        .object({
          affaire_id: z.string().uuid(),
          date_debut_fab: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          date_fin_fab: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          objet_ids: z.array(z.string().uuid()).min(1),
          archive_existing: z.boolean().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, user } = context;

    if (data.date_debut_fab > data.date_fin_fab) {
      throw new Error("La date de début doit précéder la date de fin (livraison).");
    }

    /* Optionnel : archiver les plans actifs existants */
    if (data.archive_existing) {
      await supabase
        .from("staffing_plan")
        .update({ status: "archived" })
        .eq("affaire_id", data.affaire_id)
        .in("status", ["draft", "published"]);
    }

    /* Heures Bois pour ordre par défaut */
    const { data: fabRows, error: fabErr } = await supabase
      .from("fabrication_objets")
      .select("id, heures_prevues_bois")
      .in("id", data.objet_ids);
    if (fabErr) throw new Error(fabErr.message);
    const hBoisById = new Map<string, number>();
    for (const r of fabRows ?? []) {
      hBoisById.set(r.id as string, Number(r.heures_prevues_bois ?? 0));
    }

    /* Création plan draft */
    const { data: plan, error: planErr } = await supabase
      .from("staffing_plan")
      .insert({
        affaire_id: data.affaire_id,
        date_debut_fab: data.date_debut_fab,
        date_fin_fab: data.date_fin_fab,
        status: "draft",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (planErr || !plan) throw new Error(planErr?.message ?? "Création plan impossible");

    /* Insertion plan_objects, display_order = -h_bois (desc) */
    const objectsToInsert = data.objet_ids.map((objet_id) => ({
      plan_id: plan.id as string,
      objet_id,
      included: true,
      display_order: -Math.round((hBoisById.get(objet_id) ?? 0) * 100),
    }));
    const { error: insErr } = await supabase
      .from("staffing_plan_object")
      .insert(objectsToInsert);
    if (insErr) {
      // rollback simple
      await supabase.from("staffing_plan").delete().eq("id", plan.id);
      throw new Error(insErr.message);
    }

    return { plan_id: plan.id as string };
  });
