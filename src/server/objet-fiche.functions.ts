// Lot 8.1 — Fiche Objet : server functions data
// - getObjetHeuresConsolidees(objetId) : prévu (live) + planifié (live) + réel (MV)
// - getObjetTeam(objetId) : personnes affectées par métier (staffing + legacy assignations)
// - assignPersonneToObjetStep(planId, stepId, employeId, dates[], presence_pct)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getEditableFields } from "@/lib/objet-fiche-permissions";

/** Mapping codes métier (DB) → colonnes heures_prevues_* de fabrication_objets */
const METIER_CODE_TO_PREVU_COL: Record<string, string | null> = {
  construction: "heures_prevues_bois",
  metallerie: "heures_prevues_metal",
  peinture: "heures_prevues_peinture",
  numerique: "heures_prevues_numerique",
  tapisserie: "heures_prevues_tapisserie",
  logistique: "heures_prevues_manutention",
  suivi_projet: "heures_prevues_be",
  machiniste: null, // pas de colonne prévue — planifié/réel uniquement
};

export interface ObjetHeuresMetier {
  metier_id: number;
  metier_code: string;
  metier_libelle: string;
  heures_prevues: number;
  heures_planifiees: number;
  heures_reelles: number;
  progression_pct: number | null;
}

export interface ObjetTeamPersonne {
  employe_id: string;
  nom: string;
  prenom: string;
  type_contrat: string | null;
  presence_pct_moyen: number;
  nb_jours: number;
  source: "staffing" | "legacy";
}

export interface ObjetTeamMetier extends ObjetHeuresMetier {
  personnes: ObjetTeamPersonne[];
}

export interface GetObjetTeamResult {
  objet: {
    id: string;
    affaire_id: string;
    reference: string;
    nom: string;
    quantite: number;
  };
  metiers: ObjetTeamMetier[];
}

/* ------------------------------------------------------------------ */
/* Helper : vérifier que l'utilisateur a accès à l'objet via l'affaire */
/* ------------------------------------------------------------------ */
async function assertUserCanAccessObjet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  objetId: string,
): Promise<{ id: string; affaire_id: string; reference: string; nom: string; quantite: number }> {
  // RLS sur fabrication_objets filtre déjà : si la query renvoie une ligne, l'user y a accès
  const { data, error } = await supabase
    .from("fabrication_objets")
    .select("id, affaire_id, reference, nom, quantite")
    .eq("id", objetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Objet introuvable ou accès refusé");
  return data as { id: string; affaire_id: string; reference: string; nom: string; quantite: number };
}

/* ================================================================== */
/* 1. getObjetTeam — vue agrégée par métier × personnes                */
/* ================================================================== */
export const getObjetTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { objetId: string }) =>
    z.object({ objetId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<GetObjetTeamResult> => {
    const { supabase } = context;

    // 1. Vérif accès + identité objet
    const objet = await assertUserCanAccessObjet(supabase, data.objetId);

    // 2. Métiers (référentiel statique)
    const { data: metiers, error: mErr } = await supabase
      .from("metiers")
      .select("id, code, libelle")
      .order("id");
    if (mErr) throw new Error(mErr.message);

    // 3. Heures prévues (live depuis fabrication_objets — déjà chargé partiellement)
    const { data: prevuRow, error: pErr } = await supabase
      .from("fabrication_objets")
      .select(
        "heures_prevues_be, heures_prevues_numerique, heures_prevues_bois, heures_prevues_metal, heures_prevues_peinture, heures_prevues_tapisserie, heures_prevues_manutention",
      )
      .eq("id", data.objetId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);

    // 4. Heures planifiées (live depuis staffing_plan_step)
    const { data: stepsRows } = await supabase
      .from("staffing_plan_step")
      .select("id, metier_id, pers, span_days, h_par_jour")
      .eq("objet_id", data.objetId);
    const stepsParMetier = new Map<number, { stepIds: string[]; heures: number }>();
    for (const s of (stepsRows ?? []) as Array<{
      id: string;
      metier_id: number;
      pers: number;
      span_days: number;
      h_par_jour: number;
    }>) {
      const cur = stepsParMetier.get(s.metier_id) ?? { stepIds: [], heures: 0 };
      cur.stepIds.push(s.id);
      cur.heures += (s.pers ?? 0) * (s.span_days ?? 0) * (s.h_par_jour ?? 0);
      stepsParMetier.set(s.metier_id, cur);
    }

    // 5. Heures réelles (depuis MV via admin client — non-exposée API)
    const { data: reelRows } = await supabaseAdmin
      .from("v_objet_heures_consolidees")
      .select("metier_id, heures_reelles")
      .eq("objet_id", data.objetId);
    const reelByMetier = new Map<number, number>();
    for (const r of (reelRows ?? []) as Array<{ metier_id: number; heures_reelles: number }>) {
      reelByMetier.set(r.metier_id, Number(r.heures_reelles ?? 0));
    }

    // 6. Personnes affectées via staffing_plan_assignment (toutes steps du métier × objet)
    const allStepIds: string[] = [];
    for (const v of stepsParMetier.values()) allStepIds.push(...v.stepIds);
    const personnesParMetier = new Map<number, Map<string, ObjetTeamPersonne>>();

    if (allStepIds.length > 0) {
      const { data: assigns } = await supabase
        .from("staffing_plan_assignment")
        .select("step_id, employe_id, date, presence_pct")
        .in("step_id", allStepIds);
      // Map step_id → metier_id
      const stepToMetier = new Map<string, number>();
      for (const s of (stepsRows ?? []) as Array<{ id: string; metier_id: number }>) {
        stepToMetier.set(s.id, s.metier_id);
      }
      // Récup employés concernés en bulk
      const empIds = Array.from(new Set((assigns ?? []).map((a: { employe_id: string }) => a.employe_id)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let empMap = new Map<string, any>();
      if (empIds.length > 0) {
        const { data: emps } = await supabase
          .from("employes")
          .select("id, nom, prenom, type_contrat")
          .in("id", empIds);
        for (const e of (emps ?? []) as Array<{ id: string }>) {
          empMap.set(e.id, e);
        }
      }
      // Agréger par (metier_id, employe_id)
      for (const a of (assigns ?? []) as Array<{
        step_id: string;
        employe_id: string;
        date: string;
        presence_pct: number;
      }>) {
        const metierId = stepToMetier.get(a.step_id);
        if (metierId == null) continue;
        if (!personnesParMetier.has(metierId)) personnesParMetier.set(metierId, new Map());
        const inner = personnesParMetier.get(metierId)!;
        const emp = empMap.get(a.employe_id) as
          | { nom: string; prenom: string; type_contrat: string | null }
          | undefined;
        const cur = inner.get(a.employe_id) ?? {
          employe_id: a.employe_id,
          nom: emp?.nom ?? "?",
          prenom: emp?.prenom ?? "",
          type_contrat: emp?.type_contrat ?? null,
          presence_pct_moyen: 0,
          nb_jours: 0,
          source: "staffing" as const,
        };
        // moyenne mobile : (avg×n + new) / (n+1)
        cur.presence_pct_moyen = Math.round(
          (cur.presence_pct_moyen * cur.nb_jours + (a.presence_pct ?? 100)) / (cur.nb_jours + 1),
        );
        cur.nb_jours += 1;
        inner.set(a.employe_id, cur);
      }
    }

    // 7. Composer le résultat — 1 ligne par métier
    const metiersResult: ObjetTeamMetier[] = (metiers as Array<{
      id: number;
      code: string;
      libelle: string;
    }>).map((m) => {
      const prevuCol = METIER_CODE_TO_PREVU_COL[m.code];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prevu = prevuCol ? Number((prevuRow as any)?.[prevuCol] ?? 0) : 0;
      const planif = stepsParMetier.get(m.id)?.heures ?? 0;
      const reel = reelByMetier.get(m.id) ?? 0;
      const personnes = Array.from(personnesParMetier.get(m.id)?.values() ?? []).sort(
        (a, b) => b.nb_jours - a.nb_jours,
      );
      return {
        metier_id: m.id,
        metier_code: m.code,
        metier_libelle: m.libelle,
        heures_prevues: prevu,
        heures_planifiees: Number(planif.toFixed(2)),
        heures_reelles: Number(reel.toFixed(2)),
        progression_pct: prevu > 0 ? Math.round((reel / prevu) * 100) : null,
        personnes,
      };
    });

    return { objet, metiers: metiersResult };
  });

/* ================================================================== */
/* 2. assignPersonneToObjetStep — affecter 1 personne sur 1 step       */
/*    pour des dates précises, en évitant cumul > 100% et doublons     */
/* ================================================================== */
export interface AssignPersonneResult {
  inserted: number;
  skipped_conflict: number;
  skipped_existing: number;
  details: Array<{ date: string; reason: "ok" | "conflict" | "existing" }>;
}

export const assignPersonneToObjetStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      planId: string;
      stepId: string;
      employeId: string;
      dates: string[];
      presence_pct?: number;
    }) =>
      z
        .object({
          planId: z.string().uuid(),
          stepId: z.string().uuid(),
          employeId: z.string().uuid(),
          dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(60),
          presence_pct: z.number().int().min(10).max(100).default(100),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<AssignPersonneResult> => {
    const { supabase } = context;
    const presence = data.presence_pct ?? 100;

    // 1. Vérif step appartient bien au plan
    const { data: step, error: sErr } = await supabase
      .from("staffing_plan_step")
      .select("id, plan_id, objet_id, metier_id")
      .eq("id", data.stepId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!step || (step as { plan_id: string }).plan_id !== data.planId) {
      throw new Error("Step introuvable ou hors plan");
    }

    // 2. Cumul existant par (employe × date) — TOUS plans confondus
    const { data: cumulRows } = await supabase
      .from("staffing_plan_assignment")
      .select("date, presence_pct")
      .eq("employe_id", data.employeId)
      .in("date", data.dates);
    const cumulByDate = new Map<string, number>();
    for (const r of (cumulRows ?? []) as Array<{ date: string; presence_pct: number }>) {
      cumulByDate.set(r.date, (cumulByDate.get(r.date) ?? 0) + (r.presence_pct ?? 100));
    }

    // 3. Existing dans CE step (skip doublons)
    const { data: existRows } = await supabase
      .from("staffing_plan_assignment")
      .select("date")
      .eq("step_id", data.stepId)
      .eq("employe_id", data.employeId)
      .in("date", data.dates);
    const existDates = new Set((existRows ?? []).map((r: { date: string }) => r.date));

    // 4. Construire les inserts
    const inserts: Array<{
      step_id: string;
      employe_id: string;
      date: string;
      presence_pct: number;
    }> = [];
    const details: AssignPersonneResult["details"] = [];
    for (const d of data.dates) {
      if (existDates.has(d)) {
        details.push({ date: d, reason: "existing" });
        continue;
      }
      if ((cumulByDate.get(d) ?? 0) + presence > 100) {
        details.push({ date: d, reason: "conflict" });
        continue;
      }
      inserts.push({
        step_id: data.stepId,
        employe_id: data.employeId,
        date: d,
        presence_pct: presence,
      });
      details.push({ date: d, reason: "ok" });
    }

    if (inserts.length > 0) {
      const { error: insErr } = await supabase.from("staffing_plan_assignment").insert(inserts);
      if (insErr) throw new Error(insErr.message);
    }

    return {
      inserted: inserts.length,
      skipped_conflict: details.filter((x) => x.reason === "conflict").length,
      skipped_existing: details.filter((x) => x.reason === "existing").length,
      details,
    };
  });

/* ================================================================== */
/* Lot 8.2 — getObjetFiche : identité complète + matrice heures        */
/* ================================================================== */
export interface ObjetFicheIdentite {
  id: string;
  affaire_id: string;
  reference: string;
  nom: string;
  quantite: number;
  commentaire: string | null;
  respo_fab_id: string | null;
  respo_fab_name: string | null;
  type_finition: string;
  budget_materiaux: number;
  a_dessiner: boolean;
  a_construire: boolean;
  est_brut: boolean;
  a_emballer: boolean;
  a_usiner: boolean;
  heures_prevues_be: number;
  heures_prevues_numerique: number;
  heures_prevues_bois: number;
  heures_prevues_metal: number;
  heures_prevues_peinture: number;
  heures_prevues_tapisserie: number;
  heures_prevues_manutention: number;
  // Lot 8.2c — Dimensions + matériaux + finition détaillée
  largeur_mm: number | null;
  longueur_mm: number | null;
  hauteur_mm: number | null;
  materiaux: string | null;
  finition_detail: string | null;
  archive: boolean;
}


export interface ObjetFicheAffaire {
  id: string;
  numero: string;
  nom: string;
}

export interface GetObjetFicheResult {
  objet: ObjetFicheIdentite;
  affaire: ObjetFicheAffaire;
  heures: ObjetHeuresMetier[];
}

export const getObjetFiche = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { objetId: string }) =>
    z.object({ objetId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<GetObjetFicheResult> => {
    const { supabase } = context;

    // 1. Objet + identité (RLS scope)
    const { data: obj, error: oErr } = await supabase
      .from("fabrication_objets")
      .select(
        "id, affaire_id, reference, nom, quantite, commentaire, respo_fab_id, type_finition, budget_materiaux, a_dessiner, a_construire, est_brut, a_emballer, a_usiner, heures_prevues_be, heures_prevues_numerique, heures_prevues_bois, heures_prevues_metal, heures_prevues_peinture, heures_prevues_tapisserie, heures_prevues_manutention, largeur_mm, longueur_mm, hauteur_mm, materiaux, finition_detail, archive",
      )
      .eq("id", data.objetId)
      .maybeSingle();

    if (oErr) throw new Error(oErr.message);
    if (!obj) throw new Error("Objet introuvable ou accès refusé");

    // 2. Respo fab name (optionnel)
    let respo_fab_name: string | null = null;
    if (obj.respo_fab_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", obj.respo_fab_id)
        .maybeSingle();
      respo_fab_name = (prof as { full_name: string | null } | null)?.full_name ?? null;
    }

    // 3. Affaire (numero + nom pour breadcrumb)
    const { data: aff } = await supabase
      .from("affaires")
      .select("id, numero, nom")
      .eq("id", obj.affaire_id)
      .maybeSingle();

    // 4. Matrice heures (réutilise la logique getObjetTeam mais sans personnes)
    const { data: metiers } = await supabase
      .from("metiers")
      .select("id, code, libelle")
      .order("id");

    const { data: stepsRows } = await supabase
      .from("staffing_plan_step")
      .select("metier_id, pers, span_demi_jours, span_days, h_par_jour")
      .eq("objet_id", data.objetId);
    const planifByMetier = new Map<number, number>();
    for (const s of (stepsRows ?? []) as Array<{
      metier_id: number;
      pers: number;
      span_demi_jours: number | null;
      span_days: number;
      h_par_jour: number;
    }>) {
      // Formule v0.39.0b/c : pers × span_demi × 4h (H_HALF).
      // Fallback span_days × h_par_jour si span_demi_jours pas renseigné.
      const h = s.span_demi_jours != null
        ? (s.pers ?? 0) * s.span_demi_jours * 4
        : (s.pers ?? 0) * (s.span_days ?? 0) * (s.h_par_jour ?? 0);
      planifByMetier.set(s.metier_id, (planifByMetier.get(s.metier_id) ?? 0) + h);
    }

    const { data: reelRows } = await supabaseAdmin
      .from("v_objet_heures_consolidees")
      .select("metier_id, heures_reelles")
      .eq("objet_id", data.objetId);
    const reelByMetier = new Map<number, number>();
    for (const r of (reelRows ?? []) as Array<{ metier_id: number; heures_reelles: number }>) {
      reelByMetier.set(r.metier_id, Number(r.heures_reelles ?? 0));
    }

    const heures: ObjetHeuresMetier[] = (metiers ?? [] as Array<{ id: number; code: string; libelle: string }>).map(
      (m: { id: number; code: string; libelle: string }) => {
        const prevuCol = METIER_CODE_TO_PREVU_COL[m.code];
        const prevu = prevuCol
          ? Number((obj as unknown as Record<string, number>)[prevuCol] ?? 0)
          : 0;
        const planif = planifByMetier.get(m.id) ?? 0;
        const reel = reelByMetier.get(m.id) ?? 0;
        return {
          metier_id: m.id,
          metier_code: m.code,
          metier_libelle: m.libelle,
          heures_prevues: prevu,
          heures_planifiees: Number(planif.toFixed(2)),
          heures_reelles: Number(reel.toFixed(2)),
          progression_pct: prevu > 0 ? Math.round((reel / prevu) * 100) : null,
        };
      },
    );

    return {
      objet: { ...(obj as ObjetFicheIdentite), respo_fab_name },
      affaire: (aff as ObjetFicheAffaire | null) ?? { id: obj.affaire_id, numero: "?", nom: "?" },
      heures,
    };
  });

/* ================================================================== */
/* Lot 8.2 — updateObjetIdentite : édition role-aware                  */
/* ================================================================== */
const UpdateInputSchema = z.object({
  objetId: z.string().uuid(),
  patch: z
    .object({
      nom: z.string().min(1).max(200).optional(),
      quantite: z.number().int().min(1).max(10000).optional(),
      commentaire: z.string().max(2000).nullable().optional(),
      respo_fab_id: z.string().uuid().nullable().optional(),
      heures_prevues_be: z.number().min(0).max(10000).optional(),
      heures_prevues_numerique: z.number().min(0).max(10000).optional(),
      heures_prevues_bois: z.number().min(0).max(10000).optional(),
      heures_prevues_metal: z.number().min(0).max(10000).optional(),
      heures_prevues_peinture: z.number().min(0).max(10000).optional(),
      heures_prevues_tapisserie: z.number().min(0).max(10000).optional(),
      heures_prevues_manutention: z.number().min(0).max(10000).optional(),
    })
    .refine((p) => Object.keys(p).length > 0, { message: "Patch vide" }),
});

export interface UpdateObjetIdentiteResult {
  ok: boolean;
  applied: string[];
  rejected: string[];
}

/** Mapping champ logique → liste de colonnes DB qu'il autorise. */
const FIELD_TO_COLUMNS: Record<string, string[]> = {
  nom: ["nom"],
  quantite: ["quantite"],
  commentaire: ["commentaire"],
  respo_fab_id: ["respo_fab_id"],
  heures_prevues: [
    "heures_prevues_be",
    "heures_prevues_numerique",
    "heures_prevues_bois",
    "heures_prevues_metal",
    "heures_prevues_peinture",
    "heures_prevues_tapisserie",
    "heures_prevues_manutention",
  ],
};

export const updateObjetIdentite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInputSchema.parse(d))
  .handler(async ({ data, context }): Promise<UpdateObjetIdentiteResult> => {
    const { supabase, userId } = context;

    // 1. Vérif accès via RLS (lecture)
    await assertUserCanAccessObjet(supabase, data.objetId);

    // 2. Reconstituer la matrice côté serveur (defense in depth — on ne
    // se base PAS sur ce que le client a envoyé)
    const { data: rolesRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = (rolesRows ?? []).map((r: { role: string }) => r.role);
    const allowedFields = getEditableFields(roles);

    // Construire la liste des colonnes autorisées
    const allowedCols = new Set<string>();
    for (const f of allowedFields) {
      for (const c of FIELD_TO_COLUMNS[f] ?? []) allowedCols.add(c);
    }

    // 3. Filtrer le patch
    const applied: string[] = [];
    const rejected: string[] = [];
    const finalPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.patch)) {
      if (allowedCols.has(k)) {
        finalPatch[k] = v;
        applied.push(k);
      } else {
        rejected.push(k);
      }
    }

    if (Object.keys(finalPatch).length === 0) {
      return { ok: false, applied, rejected };
    }

    const { error } = await supabase
      .from("fabrication_objets")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(finalPatch as any)
      .eq("id", data.objetId);
    if (error) throw new Error(error.message);

    return { ok: true, applied, rejected };
  });
