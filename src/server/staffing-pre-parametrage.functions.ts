// v0.36 RC — Server functions pré-paramétrage métier (chantier_metier_config)
// Spec : v0.36 PRÉ-PARAMÉTRAGE MÉTIER + LISSAGE AUTO + PIPELINE OBJET
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  autoSuggestMetierConfig,
  validateBeOverride,
  type MetierConfig,
  type MetierConfigKey,
  type Conflict,
  METIERS_V036,
} from "@/lib/staffing/pre-parametrage";
import { METIER_ID } from "@/lib/staffing/types";

/* ============================================================ */
/* Mapping MetierConfigKey ↔ metier_id                           */
/* ============================================================ */

const KEY_TO_ID: Record<MetierConfigKey, number> = {
  BE: METIER_ID.BE,
  Num: METIER_ID.Num,
  Bois: METIER_ID.Bois,
  Peint: METIER_ID.Peint,
  Tap: METIER_ID.Tap,
  Manut: METIER_ID.Manut,
};
const ID_TO_KEY: Record<number, MetierConfigKey> = Object.fromEntries(
  Object.entries(KEY_TO_ID).map(([k, v]) => [v, k as MetierConfigKey]),
) as Record<number, MetierConfigKey>;

export interface ChantierMetierConfigRow {
  id: string;
  affaire_id: string;
  metier_id: number;
  metier_code: MetierConfigKey;
  total_h_calc: number;
  nb_pers_cible: number;
  duree_cible_j: number;
  capa_max_jour: number;
  fenetre_start: string | null;
  fenetre_end: string | null;
  lissage_active: boolean;
  be_override: boolean;
  override_reason: string | null;
}

/* ============================================================ */
/* listConfigs — toutes les configs d'une affaire                */
/* ============================================================ */

export const listChantierMetierConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { affaire_id: string }) =>
    z.object({ affaire_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ChantierMetierConfigRow[]> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("chantier_metier_config")
      .select("*")
      .eq("affaire_id", data.affaire_id);
    if (error) throw new Error(error.message);
    return (rows ?? [])
      .map((r) => {
        const code = ID_TO_KEY[r.metier_id as number];
        if (!code) return null;
        return {
          id: r.id as string,
          affaire_id: r.affaire_id as string,
          metier_id: r.metier_id as number,
          metier_code: code,
          total_h_calc: Number(r.total_h_calc),
          nb_pers_cible: Number(r.nb_pers_cible),
          duree_cible_j: Number(r.duree_cible_j),
          capa_max_jour: Number(r.capa_max_jour),
          fenetre_start: (r.fenetre_start as string | null) ?? null,
          fenetre_end: (r.fenetre_end as string | null) ?? null,
          lissage_active: Boolean(r.lissage_active),
          be_override: Boolean(r.be_override),
          override_reason: (r.override_reason as string | null) ?? null,
        };
      })
      .filter((x): x is ChantierMetierConfigRow => x !== null);
  });

/* ============================================================ */
/* suggestForAffaire — totals depuis fabrication_objets + fenêtre */
/* ============================================================ */

export interface SuggestResult {
  configs: Array<Omit<ChantierMetierConfigRow, "id" | "affaire_id">>;
  conflicts: Conflict[];
  pipeline_duration: number;
  fenetre_dispo: number;
  totals_par_metier: Record<MetierConfigKey, number>;
}

export const suggestPreParametrage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { affaire_id: string; today?: string }) =>
    z
      .object({
        affaire_id: z.string().uuid(),
        today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<SuggestResult> => {
    const { supabase } = context;

    // 1) Affaire (date_fin_prevue = deadline)
    const { data: aff, error: affErr } = await supabase
      .from("affaires")
      .select("date_fin_prevue, date_debut")
      .eq("id", data.affaire_id)
      .single();
    if (affErr) throw new Error(affErr.message);
    if (!aff?.date_fin_prevue) {
      throw new Error("Affaire sans date_fin_prevue : impossible de pré-paramétrer.");
    }

    // 2) Totaux heures par métier depuis fabrication_objets non archivés
    const { data: objs, error: oErr } = await supabase
      .from("fabrication_objets")
      .select(
        "heures_prevues_be, heures_prevues_numerique, heures_prevues_bois, heures_prevues_peinture, heures_prevues_tapisserie, heures_prevues_manutention",
      )
      .eq("affaire_id", data.affaire_id)
      .eq("archive", false);
    if (oErr) throw new Error(oErr.message);
    const totals: Record<MetierConfigKey, number> = {
      BE: 0, Num: 0, Bois: 0, Peint: 0, Tap: 0, Manut: 0,
    };
    for (const o of objs ?? []) {
      totals.BE += Number(o.heures_prevues_be ?? 0);
      totals.Num += Number(o.heures_prevues_numerique ?? 0);
      totals.Bois += Number(o.heures_prevues_bois ?? 0);
      totals.Peint += Number(o.heures_prevues_peinture ?? 0);
      totals.Tap += Number(o.heures_prevues_tapisserie ?? 0);
      totals.Manut += Number(o.heures_prevues_manutention ?? 0);
    }

    const today = data.today ?? new Date().toISOString().slice(0, 10);
    const result = autoSuggestMetierConfig(totals, today, aff.date_fin_prevue as string);

    return {
      configs: result.configs.map((c) => ({
        metier_id: KEY_TO_ID[c.metier_code],
        metier_code: c.metier_code,
        total_h_calc: c.total_h_calc,
        nb_pers_cible: c.nb_pers_cible,
        duree_cible_j: c.duree_cible_j,
        capa_max_jour: c.capa_max_jour,
        fenetre_start: null,
        fenetre_end: null,
        lissage_active: c.lissage_active,
        be_override: false,
        override_reason: null,
      })),
      conflicts: result.conflicts,
      pipeline_duration: result.pipeline_duration,
      fenetre_dispo: result.fenetre_dispo,
      totals_par_metier: totals,
    };
  });

/* ============================================================ */
/* upsertConfig — sauvegarde (avec validation BE override)       */
/* ============================================================ */

const upsertSchema = z.object({
  affaire_id: z.string().uuid(),
  metier_id: z.number().int().positive(),
  total_h_calc: z.number().min(0),
  nb_pers_cible: z.number().int().min(1),
  duree_cible_j: z.number().positive(),
  capa_max_jour: z.number().int().min(1),
  fenetre_start: z.string().nullable().optional(),
  fenetre_end: z.string().nullable().optional(),
  lissage_active: z.boolean(),
  be_override: z.boolean(),
  override_reason: z.string().nullable().optional(),
});

export const upsertChantierMetierConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Validation BE override côté serveur
    if (data.metier_id === METIER_ID.BE) {
      const err = validateBeOverride({
        be_override: data.be_override,
        override_reason: data.override_reason ?? null,
      });
      if (err) throw new Error(err.message ?? "Validation BE override échouée");
    }
    const { error } = await supabase
      .from("chantier_metier_config")
      .upsert(
        {
          affaire_id: data.affaire_id,
          metier_id: data.metier_id,
          total_h_calc: data.total_h_calc,
          nb_pers_cible: data.nb_pers_cible,
          duree_cible_j: data.duree_cible_j,
          capa_max_jour: data.capa_max_jour,
          fenetre_start: data.fenetre_start ?? null,
          fenetre_end: data.fenetre_end ?? null,
          lissage_active: data.lissage_active,
          be_override: data.be_override,
          override_reason: data.override_reason ?? null,
        },
        { onConflict: "affaire_id,metier_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================================================ */
/* applySuggestionsToAffaire — bulk save                          */
/* ============================================================ */

export const applyPreParametrageSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { affaire_id: string }) =>
    z.object({ affaire_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Recalcule + persiste
    const sugg = await suggestPreParametrage({ data: { affaire_id: data.affaire_id } });
    if (sugg.configs.length === 0) return { saved: 0 };
    const rows = sugg.configs.map((c) => ({
      affaire_id: data.affaire_id,
      metier_id: c.metier_id,
      total_h_calc: c.total_h_calc,
      nb_pers_cible: c.nb_pers_cible,
      duree_cible_j: c.duree_cible_j,
      capa_max_jour: c.capa_max_jour,
      lissage_active: c.lissage_active,
      be_override: false,
      override_reason: null,
    }));
    const { error } = await supabase
      .from("chantier_metier_config")
      .upsert(rows, { onConflict: "affaire_id,metier_id" });
    if (error) throw new Error(error.message);
    return { saved: rows.length };
  });

export const METIER_KEYS = METIERS_V036;
