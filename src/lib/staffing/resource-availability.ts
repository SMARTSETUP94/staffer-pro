// v0.35.1bis — getResourceAvailability : agrège dispo employés + machines sur fenêtre cross-affaires
// Lit `staffing_plan_assignment` (plans published, exclut exclude_plan_id) + `machine_reservation`.
//
// Pure function : reçoit le client supabase pour faciliter les tests (peut être mocké).

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PersonneOccupation,
  ResourceAvailability,
  ResourceAvailabilityInput,
} from "./tier-ranking";
import type { MetierKey } from "./types";
import { METIER_KEY_BY_ID } from "./types";
import { dateRange, diffDays } from "./date-utils";

export async function getResourceAvailability(
  supabase: SupabaseClient,
  input: ResourceAvailabilityInput
): Promise<ResourceAvailability> {
  const { date_debut, date_fin, exclude_plan_id } = input;
  const totalDays = diffDays(date_debut, date_fin) + 1;
  const allDates = dateRange(date_debut, totalDays);

  // 1) Machine CNC réservations
  const { data: mr } = await supabase
    .from("machine_reservation")
    .select("date, machine_id")
    .gte("date", date_debut)
    .lte("date", date_fin);
  const num_machine_reserved = new Set<string>((mr ?? []).map((r: any) => r.date));

  // 2) Assignments published plans (exclude celui en cours)
  let q = supabase
    .from("staffing_plan_assignment")
    .select(
      "id, employe_id, date, presence_pct, step_id, staffing_plan_step!inner(metier_id, plan_id, staffing_plan!inner(status, id))"
    )
    .gte("date", date_debut)
    .lte("date", date_fin)
    .eq("staffing_plan_step.staffing_plan.status", "published");
  if (exclude_plan_id) q = q.neq("staffing_plan_step.plan_id", exclude_plan_id);
  const { data: assigns } = await q;

  // 3) Absences validées qui chevauchent la fenêtre
  const { data: absences } = await supabase
    .from("absences")
    .select("employe_id, date_debut, date_fin, demi_journee, valide")
    .eq("valide", true)
    .lte("date_debut", date_fin)
    .gte("date_fin", date_debut);

  const personnes: Record<string, PersonneOccupation> = {};
  const pic_par_jour: Record<string, number> = {};
  const pic_par_metier: Record<string, Record<MetierKey, number>> = {};
  for (const d of allDates) {
    pic_par_jour[d] = 0;
    pic_par_metier[d] = {} as Record<MetierKey, number>;
  }

  for (const a of (assigns ?? []) as any[]) {
    const empId = a.employe_id as string;
    const date = a.date as string;
    const pct = a.presence_pct ?? 100;
    const metierId = a.staffing_plan_step?.metier_id as number | undefined;
    const metierKey = metierId ? METIER_KEY_BY_ID[metierId] : undefined;

    if (!personnes[empId]) personnes[empId] = { occupation_pct_moyenne: 0, par_jour: {} };
    personnes[empId].par_jour[date] = (personnes[empId].par_jour[date] ?? 0) + pct;

    pic_par_jour[date] = (pic_par_jour[date] ?? 0) + 1;
    if (metierKey) {
      pic_par_metier[date][metierKey] = (pic_par_metier[date][metierKey] ?? 0) + 1;
    }
  }

  // Cumul absences (50% si demi-journée, 100% sinon) clampé à 100%
  const absences_par_personne: Record<string, Set<string>> = {};
  for (const ab of (absences ?? []) as any[]) {
    const empId = ab.employe_id as string;
    const start = (ab.date_debut as string) < date_debut ? date_debut : (ab.date_debut as string);
    const end = (ab.date_fin as string) > date_fin ? date_fin : (ab.date_fin as string);
    const span = diffDays(start, end) + 1;
    const pct = ab.demi_journee ? 50 : 100;
    if (!personnes[empId]) personnes[empId] = { occupation_pct_moyenne: 0, par_jour: {} };
    if (!absences_par_personne[empId]) absences_par_personne[empId] = new Set();
    for (const d of dateRange(start, span)) {
      personnes[empId].par_jour[d] = Math.min(100, (personnes[empId].par_jour[d] ?? 0) + pct);
      if (pct === 100) absences_par_personne[empId].add(d);
    }
  }

  // Moyenne occupation par personne sur la fenêtre
  for (const empId of Object.keys(personnes)) {
    const total = Object.values(personnes[empId].par_jour).reduce((a, b) => a + b, 0);
    personnes[empId].occupation_pct_moyenne = Math.min(100, total / totalDays);
  }

  return {
    num_machine_reserved,
    personnes,
    pic_par_jour,
    pic_par_metier,
    absences_par_personne,
  };
}
