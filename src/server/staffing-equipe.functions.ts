// v0.35.x — Mode rapide : pré-remplir l'équipe affaire par métier sur toutes les steps du plan
// Backend : assignTeamToMetier(planId, metier_id, employe_ids) — INSERT batch sur step×jour
//           pour chaque step du métier dans le plan, en skippant les conflits cumul > 100%.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface AssignResult {
  inserted: number;
  skipped_conflict: number;
  skipped_existing: number;
  details: Array<{ employe_id: string; date: string; reason: "conflict" | "existing" | "ok" }>;
}

/* ------------------------------------------------------------------ */
/* Bulk : affecter N personnes à toutes les steps d'un métier du plan   */
/* ------------------------------------------------------------------ */
export const assignTeamToMetier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { planId: string; metier_id: number; employe_ids: string[]; presence_pct?: number }) =>
      z
        .object({
          planId: z.string().uuid(),
          metier_id: z.number().int(),
          employe_ids: z.array(z.string().uuid()).min(1).max(20),
          presence_pct: z.number().int().min(10).max(100).default(100),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<AssignResult> => {
    const { supabase } = context;
    const presence = data.presence_pct ?? 100;

    // 1. Toutes les steps du plan pour ce métier
    const { data: steps, error: stErr } = await supabase
      .from("staffing_plan_step")
      .select("id, start_date, span_days")
      .eq("plan_id", data.planId)
      .eq("metier_id", data.metier_id);
    if (stErr) throw new Error(stErr.message);
    if (!steps || steps.length === 0) {
      return { inserted: 0, skipped_conflict: 0, skipped_existing: 0, details: [] };
    }

    // 2. Construire la liste des (step_id, date) cibles (jours ouvrés Lun-Ven)
    const targets: Array<{ step_id: string; date: string }> = [];
    for (const s of steps as Array<{ id: string; start_date: string; span_days: number }>) {
      const start = new Date(s.start_date + "T00:00:00Z");
      for (let i = 0; i < s.span_days; i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const dow = d.getUTCDay();
        if (dow >= 1 && dow <= 5) {
          targets.push({ step_id: s.id, date: d.toISOString().slice(0, 10) });
        }
      }
    }
    const datesSet = new Set(targets.map((t) => t.date));

    // 3. Cumul existant par (employe_id × date) pour éviter > 100% — TOUS plans confondus
    const { data: cumulRows } = await supabase
      .from("staffing_plan_assignment")
      .select("employe_id, date, presence_pct")
      .in("employe_id", data.employe_ids)
      .in("date", Array.from(datesSet));
    const cumulByEmpDate = new Map<string, number>();
    for (const r of (cumulRows ?? []) as Array<{ employe_id: string; date: string; presence_pct: number }>) {
      const k = `${r.employe_id}|${r.date}`;
      cumulByEmpDate.set(k, (cumulByEmpDate.get(k) ?? 0) + (r.presence_pct ?? 100));
    }

    // 4. Existing assignments DANS CE PLAN pour skip doublons (même step+emp+date)
    const stepIds = (steps as Array<{ id: string }>).map((s) => s.id);
    const { data: existing } = await supabase
      .from("staffing_plan_assignment")
      .select("step_id, employe_id, date")
      .in("step_id", stepIds)
      .in("employe_id", data.employe_ids);
    const existingKey = new Set<string>();
    for (const r of (existing ?? []) as Array<{ step_id: string; employe_id: string; date: string }>) {
      existingKey.add(`${r.step_id}|${r.employe_id}|${r.date}`);
    }

    // 5. Build INSERT batch
    const toInsert: Array<{ step_id: string; employe_id: string; date: string; presence_pct: number }> = [];
    const details: AssignResult["details"] = [];
    let skipConflict = 0;
    let skipExisting = 0;
    for (const t of targets) {
      for (const empId of data.employe_ids) {
        const key = `${t.step_id}|${empId}|${t.date}`;
        if (existingKey.has(key)) {
          skipExisting += 1;
          details.push({ employe_id: empId, date: t.date, reason: "existing" });
          continue;
        }
        const cumKey = `${empId}|${t.date}`;
        const cur = cumulByEmpDate.get(cumKey) ?? 0;
        if (cur + presence > 100) {
          skipConflict += 1;
          details.push({ employe_id: empId, date: t.date, reason: "conflict" });
          continue;
        }
        toInsert.push({
          step_id: t.step_id,
          employe_id: empId,
          date: t.date,
          presence_pct: presence,
        });
        cumulByEmpDate.set(cumKey, cur + presence);
        details.push({ employe_id: empId, date: t.date, reason: "ok" });
      }
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase
        .from("staffing_plan_assignment")
        .insert(toInsert);
      if (insErr) throw new Error(insErr.message);
    }

    return {
      inserted: toInsert.length,
      skipped_conflict: skipConflict,
      skipped_existing: skipExisting,
      details,
    };
  });

/* ------------------------------------------------------------------ */
/* Liste des métiers actifs du plan + employés candidats par métier     */
/* ------------------------------------------------------------------ */
export const getEquipeAffaireData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { planId: string }) => z.object({ planId: z.string().uuid() }).parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      metiers: Array<{
        metier_id: number;
        steps_count: number;
        total_pers_jours: number;
      }>;
      candidats_by_metier: Record<
        number,
        Array<{
          id: string;
          nom: string;
          prenom: string;
          type_contrat: string;
          tier: 1 | 2 | 3;
        }>
      >;
    }> => {
      const { supabase } = context;

      const { data: steps, error: stErr } = await supabase
        .from("staffing_plan_step")
        .select("metier_id, span_days, pers, start_date")
        .eq("plan_id", data.planId);
      if (stErr) throw new Error(stErr.message);

      const metiersAgg = new Map<number, { steps_count: number; total_pers_jours: number }>();
      for (const s of (steps ?? []) as Array<{
        metier_id: number;
        span_days: number;
        pers: number;
        start_date: string;
      }>) {
        if (s.start_date === "TBD") continue;
        const cur = metiersAgg.get(s.metier_id) ?? { steps_count: 0, total_pers_jours: 0 };
        cur.steps_count += 1;
        cur.total_pers_jours += s.pers * s.span_days;
        metiersAgg.set(s.metier_id, cur);
      }

      const metiersList = Array.from(metiersAgg.entries()).map(([metier_id, v]) => ({
        metier_id,
        ...v,
      }));

      // Employés candidats (actif + non_staffing=false), classés par tier (1=principal, 2=secondaire/poly, 3=interim)
      const { data: emps, error: empErr } = await supabase
        .from("employes")
        .select(
          "id, nom, prenom, metier_principal_id, metiers_secondaires, type_contrat, actif, non_staffing",
        )
        .eq("actif", true)
        .eq("non_staffing", false);
      if (empErr) throw new Error(empErr.message);

      // Charge niveaux explicites (secondaire/depannage/bloque) pour exclure les bloqués
      const { data: nivRows } = await supabase
        .from("employe_metiers")
        .select("employe_id, metier_id, niveau");
      const niveauxMap: Record<string, Record<number, string>> = {};
      for (const r of nivRows ?? []) {
        const eid = r.employe_id as string;
        if (!niveauxMap[eid]) niveauxMap[eid] = {};
        niveauxMap[eid][r.metier_id as number] = ((r as { niveau?: string }).niveau ?? "secondaire");
      }

      const candidatsByMetier: Record<
        number,
        Array<{ id: string; nom: string; prenom: string; type_contrat: string; tier: 1 | 2 | 3 }>
      > = {};
      for (const m of metiersList) {
        const list = (emps ?? [])
          .map((e) => {
            const isPrincipal = e.metier_principal_id === m.metier_id;
            const niv = niveauxMap[e.id as string]?.[m.metier_id];
            if (niv === "bloque") return null;
            // Dépannage = exclu de la vue rapide (Tier 4 réservé à l'auto-staffing fin)
            if (!isPrincipal && niv !== "secondaire") {
              const isSecListe = ((e.metiers_secondaires ?? []) as number[]).includes(m.metier_id);
              if (!isSecListe) return null;
            }
            const isInterim = e.type_contrat === "Interim";
            const tier: 1 | 2 | 3 = isInterim ? 3 : isPrincipal ? 1 : 2;
            return {
              id: e.id as string,
              nom: e.nom as string,
              prenom: e.prenom as string,
              type_contrat: (e.type_contrat as string) ?? "CDI",
              tier,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
          .sort((a, b) => {
            if (a.tier !== b.tier) return a.tier - b.tier;
            return `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`);
          });
        candidatsByMetier[m.metier_id] = list;
      }

      return { metiers: metiersList, candidats_by_metier: candidatsByMetier };
    },
  );
