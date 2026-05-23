// Lot 8.1 — Fiche Objet : server functions data
// - getObjetHeuresConsolidees(objetId) : prévu (live) + planifié (live) + réel (MV)
// - getObjetTeam(objetId) : personnes affectées par métier (staffing + legacy assignations)
// - assignPersonneToObjetStep(planId, stepId, employeId, dates[], presence_pct)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
