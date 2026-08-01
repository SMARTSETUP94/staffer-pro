/**
 * Lot 8.3a — Zone Équipe de la Fiche Objet (lecture).
 *
 * `getObjetEquipe({ objetId })` retourne :
 *   - les métiers requis (dérivés des steps du plan staffing actif lié à l'objet,
 *     ou à défaut des heures devis > 0),
 *   - pour chaque métier : heures devis, heures staffées (assignations du plan),
 *     personnes assignées (employe + cumul presence_pct sur la fenêtre).
 *   - plan_status : 'published' | 'draft' | 'no_plan'
 *   - window : min(start_date)..max(end_date) sur les steps de l'objet, ou null.
 *
 * Cap : `objet.view` (alignée avec `getObjetFiche`).
 *
 * NB : Lot 8.3a ne fait que de la lecture. Les mutations (assign / remove /
 * autoStaffObjetEquipe) sont prévues pour 8.3b.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const METIER_HEURES_KEY: Record<number, keyof ObjetHeuresMap> = {
  1: "bois", // construction
  2: "metal",
  3: "peinture",
  4: "numerique",
  5: "tapisserie",
  6: "machiniste",
  7: "manutention",
  8: "be",
};

const METIER_LABEL: Record<number, string> = {
  1: "Menuiserie",
  2: "Métallerie",
  3: "Peinture",
  4: "Numérique",
  5: "Tapisserie",
  6: "Machiniste",
  7: "Logistique",
  8: "BE",
};

// Ordre canonique d'affichage (BE → Num → Bois → Métal → Peint → Tap → Mach → Manut)
const METIER_ORDER: number[] = [8, 4, 1, 2, 3, 5, 6, 7];

type ObjetHeuresMap = {
  be: number;
  numerique: number;
  bois: number;
  metal: number;
  peinture: number;
  tapisserie: number;
  machiniste: number;
  manutention: number;
};

export interface ObjetEquipeAssignation {
  employe_id: string;
  nom: string;
  prenom: string;
  presence_pct_cumul: number; // somme sur la fenêtre
  jours_count: number;
  step_id: string;
}

export interface ObjetEquipeMetierRow {
  metier_id: number;
  metier_label: string;
  metier_key: keyof ObjetHeuresMap;
  pers_requis: number;
  heures_devis: number;
  heures_staffees: number;
  assignations: ObjetEquipeAssignation[];
}

export interface ObjetEquipeData {
  plan_status: "published" | "draft" | "no_plan";
  window: { start: string; end: string } | null;
  metiers: ObjetEquipeMetierRow[];
}

export const getObjetEquipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { objetId: string }) =>
    z.object({ objetId: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }): Promise<ObjetEquipeData> => {
    const { supabase } = context;
    const { objetId } = data;

    // 1) Heures devis par métier sur l'objet (fallback si pas de plan)
    const { data: objRow, error: objErr } = await supabase
      .from("fabrication_objets")
      .select(
        "heures_prevues_be, heures_prevues_numerique, heures_prevues_bois, heures_prevues_metal, heures_prevues_peinture, heures_prevues_tapisserie, heures_prevues_manutention, quantite"
      )
      .eq("id", objetId)
      .single();
    if (objErr || !objRow) throw new Error(objErr?.message ?? "Objet introuvable");

    // Lot 8.3a hotfix (audit 23 mai P1.2) — convention "heures DB = TOTAL déjà multiplié"
    // alignée avec getObjetFiche (Lot 8.1 / Gabin). On ne multiplie PLUS par quantite ici.
    const heuresDevis: ObjetHeuresMap = {
      be: Number(objRow.heures_prevues_be ?? 0),
      numerique: Number(objRow.heures_prevues_numerique ?? 0),
      bois: Number(objRow.heures_prevues_bois ?? 0),
      metal: Number(objRow.heures_prevues_metal ?? 0),
      peinture: Number(objRow.heures_prevues_peinture ?? 0),
      tapisserie: Number(objRow.heures_prevues_tapisserie ?? 0),
      machiniste: 0,
      manutention: Number(objRow.heures_prevues_manutention ?? 0),
    };

    // 2) Steps du plan staffing publié liés à cet objet
    // Lot 8.3a hotfix (audit 23 mai P0#1) — la table embed est `staffing_plan` (singulier).
    const { data: steps } = await supabase
      .from("staffing_plan_step")
      .select(
        "id, metier_id, start_date, span_days, pers, plan_id, staffing_plan!inner(status)"
      )
      .eq("objet_id", objetId);

    type StepRow = {
      id: string;
      metier_id: number;
      start_date: string;
      span_days: number;
      pers: number;
      plan_id: string;
      staffing_plan: { status: string } | { status: string }[];
    };
    const allSteps = (steps ?? []) as unknown as StepRow[];

    // Filtre : on garde les steps de plans publiés en priorité ; sinon draft.
    const publishedSteps = allSteps.filter((s) => {
      const sp = Array.isArray(s.staffing_plan) ? s.staffing_plan[0] : s.staffing_plan;
      return sp?.status === "published";
    });
    const useSteps = publishedSteps.length > 0 ? publishedSteps : allSteps;

    let plan_status: ObjetEquipeData["plan_status"];
    if (publishedSteps.length > 0) plan_status = "published";
    else if (allSteps.length > 0) plan_status = "draft";
    else plan_status = "no_plan";

    // Fenêtre globale
    let windowOut: { start: string; end: string } | null = null;
    if (useSteps.length > 0) {
      const dates = useSteps.flatMap((s) => {
        const start = new Date(s.start_date + "T00:00:00Z");
        const end = new Date(start);
        end.setUTCDate(start.getUTCDate() + Math.max(0, s.span_days - 1));
        return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
      });
      dates.sort();
      windowOut = { start: dates[0], end: dates[dates.length - 1] };
    }

    // 3) Assignations sur ces steps
    const stepIds = useSteps.map((s) => s.id);
    let assigns: Array<{
      employe_id: string;
      step_id: string;
      presence_pct: number;
      date: string;
    }> = [];
    if (stepIds.length > 0) {
      const { data: a } = await supabase
        .from("staffing_plan_assignment")
        .select("employe_id, step_id, presence_pct, date")
        .in("step_id", stepIds);
      assigns = (a ?? []) as typeof assigns;
    }

    // Employés
    const empIds = Array.from(new Set(assigns.map((a) => a.employe_id)));
    const empMap = new Map<string, { nom: string; prenom: string }>();
    if (empIds.length > 0) {
      const { data: emps } = await supabase
        .from("employes")
        .select("id, nom, prenom")
        .in("id", empIds);
      for (const e of emps ?? []) {
        empMap.set(e.id as string, {
          nom: (e.nom as string) ?? "",
          prenom: (e.prenom as string) ?? "",
        });
      }
    }

    // 4) Agrégation par métier
    const requiredMetiers = new Set<number>();
    for (const s of useSteps) requiredMetiers.add(s.metier_id);
    // Fallback : si pas de plan, on liste les métiers ayant des heures devis > 0
    if (useSteps.length === 0) {
      for (const [mid, key] of Object.entries(METIER_HEURES_KEY)) {
        if (heuresDevis[key] > 0) requiredMetiers.add(Number(mid));
      }
    }

    const stepsByMetier = new Map<number, StepRow[]>();
    for (const s of useSteps) {
      const arr = stepsByMetier.get(s.metier_id) ?? [];
      arr.push(s);
      stepsByMetier.set(s.metier_id, arr);
    }

    const assignsByStep = new Map<string, typeof assigns>();
    for (const a of assigns) {
      const arr = assignsByStep.get(a.step_id) ?? [];
      arr.push(a);
      assignsByStep.set(a.step_id, arr);
    }

    const metierRows: ObjetEquipeMetierRow[] = [];
    for (const mid of METIER_ORDER) {
      if (!requiredMetiers.has(mid)) continue;
      const key = METIER_HEURES_KEY[mid];
      const stepsForM = stepsByMetier.get(mid) ?? [];

      // pers_requis : max(pers) parmi les steps du métier (dimensionne la cible)
      const pers_requis = stepsForM.reduce((acc, s) => Math.max(acc, s.pers), 0);

      // assignations agrégées par employé
      type Agg = {
        employe_id: string;
        sum_pct: number;
        jours: Set<string>;
        step_id: string;
      };
      const aggMap = new Map<string, Agg>();
      let heuresStaffees = 0;
      for (const s of stepsForM) {
        const list = assignsByStep.get(s.id) ?? [];
        for (const a of list) {
          // 1 jour assignation @100% = 8h (h_par_jour par défaut). On reste simple.
          heuresStaffees += (a.presence_pct / 100) * 8;
          const cur = aggMap.get(a.employe_id) ?? {
            employe_id: a.employe_id,
            sum_pct: 0,
            jours: new Set<string>(),
            step_id: s.id,
          };
          cur.sum_pct += a.presence_pct;
          cur.jours.add(a.date);
          aggMap.set(a.employe_id, cur);
        }
      }

      const assignations: ObjetEquipeAssignation[] = Array.from(aggMap.values())
        .map((agg) => {
          const emp = empMap.get(agg.employe_id);
          return {
            employe_id: agg.employe_id,
            nom: emp?.nom ?? "?",
            prenom: emp?.prenom ?? "",
            presence_pct_cumul: agg.sum_pct,
            jours_count: agg.jours.size,
            step_id: agg.step_id,
          };
        })
        .sort((a, b) => b.presence_pct_cumul - a.presence_pct_cumul);

      metierRows.push({
        metier_id: mid,
        metier_label: METIER_LABEL[mid] ?? `Métier ${mid}`,
        metier_key: key,
        pers_requis,
        heures_devis: heuresDevis[key] ?? 0,
        heures_staffees: Math.round(heuresStaffees * 10) / 10,
        assignations,
      });
    }

    return {
      plan_status,
      window: windowOut,
      metiers: metierRows,
    };
  });
