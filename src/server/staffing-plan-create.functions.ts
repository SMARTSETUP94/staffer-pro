// v0.35.4 / Sprint 4 — Server functions création plan via Wizard
// v0.35.4.1 — Tracking anti-duplication objets : 1 objet = 1 plan actif (draft|published) max
// - listFabObjetsForWizard: liste les fabrication_objets non archivés + dans_plan_actif
// - getActivePlansForAffaire: renvoie les plans existants (draft/published) pour cette affaire
// - createStaffingPlan: crée un plan draft + plan_objects, gère collisions (409 si published, archive auto draft)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface DansPlanActif {
  plan_id: string;
  status: "draft" | "published";
  affaire_id: string;
  affaire_nom: string | null;
  affaire_numero: string | null;
  same_affaire: boolean;
  created_at: string;
  created_by: string | null;
}

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

    const objIds = (rows ?? []).map((r) => r.id as string);

    /* Collisions : objets déjà dans un plan actif (draft|published) */
    const collisions = new Map<string, DansPlanActif>();
    if (objIds.length > 0) {
      const { data: spo, error: spoErr } = await supabase
        .from("staffing_plan_object")
        .select(
          "objet_id, plan:staffing_plan!inner(id, status, affaire_id, created_at, created_by)",
        )
        .in("objet_id", objIds)
        .in("plan.status", ["draft", "published"]);
      if (spoErr) throw new Error(spoErr.message);

      const affaireIds = new Set<string>();
      const raws: Array<{
        objet_id: string;
        plan_id: string;
        status: "draft" | "published";
        affaire_id: string;
        created_at: string;
        created_by: string | null;
      }> = [];
      for (const row of (spo ?? []) as Array<{
        objet_id: string;
        plan: {
          id: string;
          status: string;
          affaire_id: string;
          created_at: string;
          created_by: string | null;
        } | null;
      }>) {
        if (!row.plan) continue;
        affaireIds.add(row.plan.affaire_id);
        raws.push({
          objet_id: row.objet_id,
          plan_id: row.plan.id,
          status: row.plan.status as "draft" | "published",
          affaire_id: row.plan.affaire_id,
          created_at: row.plan.created_at,
          created_by: row.plan.created_by,
        });
      }

      const affaireMeta = new Map<string, { nom: string | null; numero: string | null }>();
      if (affaireIds.size > 0) {
        const { data: affs } = await supabase
          .from("affaires")
          .select("id, nom, numero")
          .in("id", Array.from(affaireIds));
        for (const a of affs ?? []) {
          affaireMeta.set(a.id as string, {
            nom: (a.nom as string | null) ?? null,
            numero: (a.numero as string | null) ?? null,
          });
        }
      }

      /* Priorité : published > draft, sinon plus récent */
      for (const r of raws) {
        const prev = collisions.get(r.objet_id);
        const meta = affaireMeta.get(r.affaire_id) ?? { nom: null, numero: null };
        const candidate: DansPlanActif = {
          plan_id: r.plan_id,
          status: r.status,
          affaire_id: r.affaire_id,
          affaire_nom: meta.nom,
          affaire_numero: meta.numero,
          same_affaire: r.affaire_id === data.affaire_id,
          created_at: r.created_at,
          created_by: r.created_by,
        };
        if (
          !prev ||
          (prev.status === "draft" && candidate.status === "published") ||
          (prev.status === candidate.status && candidate.created_at > prev.created_at)
        ) {
          collisions.set(r.objet_id, candidate);
        }
      }
    }

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
        dans_plan_actif: collisions.get(r.id as string) ?? null,
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
    const { supabase, userId } = context;

    if (data.date_debut_fab > data.date_fin_fab) {
      throw new Error("La date de début doit précéder la date de fin (livraison).");
    }

    /* v0.35.4.1 — Validation anti-duplication objets */
    const { data: collisionsRows, error: colErr } = await supabase
      .from("staffing_plan_object")
      .select(
        "objet_id, plan:staffing_plan!inner(id, status, affaire_id)",
      )
      .in("objet_id", data.objet_ids)
      .in("plan.status", ["draft", "published"]);
    if (colErr) throw new Error(colErr.message);

    const blocking: Array<{ objet_id: string; plan_id: string; affaire_id: string }> = [];
    const draftSameAffaire = new Set<string>();
    for (const row of (collisionsRows ?? []) as Array<{
      objet_id: string;
      plan: { id: string; status: string; affaire_id: string } | null;
    }>) {
      if (!row.plan) continue;
      if (row.plan.status === "published") {
        blocking.push({
          objet_id: row.objet_id,
          plan_id: row.plan.id,
          affaire_id: row.plan.affaire_id,
        });
      } else if (row.plan.status === "draft" && row.plan.affaire_id !== data.affaire_id) {
        // draft d'une AUTRE affaire = blocant aussi
        blocking.push({
          objet_id: row.objet_id,
          plan_id: row.plan.id,
          affaire_id: row.plan.affaire_id,
        });
      } else if (row.plan.status === "draft" && row.plan.affaire_id === data.affaire_id) {
        draftSameAffaire.add(row.plan.id);
      }
    }

    if (blocking.length > 0) {
      const objMeta = new Map<string, string>();
      const { data: objs } = await supabase
        .from("fabrication_objets")
        .select("id, nom, reference")
        .in(
          "id",
          blocking.map((b) => b.objet_id),
        );
      for (const o of objs ?? []) {
        objMeta.set(o.id as string, `${o.reference as string} — ${o.nom as string}`);
      }
      const first = blocking[0];
      const label = objMeta.get(first.objet_id) ?? first.objet_id.slice(0, 8);
      const err = new Error(
        `Objet "${label}" déjà staffé dans un plan publié ou un brouillon d'une autre affaire. Archivez-le d'abord.`,
      );
      (err as Error & { code?: string; status?: number }).code = "OBJET_DEJA_STAFFE";
      (err as Error & { code?: string; status?: number }).status = 409;
      throw err;
    }

    /* Auto-archive : plans draft de la MÊME affaire qui contiennent un de nos objets */
    if (draftSameAffaire.size > 0) {
      await supabase
        .from("staffing_plan")
        .update({ status: "archived" })
        .in("id", Array.from(draftSameAffaire));
    }

    /* Optionnel : archiver tous les plans actifs existants de l'affaire (bouton "nouveau plan") */
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
        created_by: userId,
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

    return {
      plan_id: plan.id as string,
      drafts_archived: draftSameAffaire.size,
    };
  });
