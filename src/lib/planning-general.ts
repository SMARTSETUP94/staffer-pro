/**
 * Planning indicatif général par affaire et par métier.
 *
 * Source : table `public.affaire_planning_metier` (1 ligne par affaire × métier,
 * dates début/fin, aucun staffing nominatif).
 *
 * Lecture/écriture gatées côté DB par la capability `section.affaires`.
 */
import { supabase } from "@/integrations/supabase/client";

export interface MetierLite {
  id: number;
  libelle: string;
  couleur: string | null;
}

export interface AffaireLite {
  id: string;
  numero: string | null;
  nom: string | null;
  client: string | null;
  statut: string | null;
  phase: string | null;
  date_montage: string | null;
  date_demontage: string | null;
}

export interface PlanningMetierRow {
  id: string;
  affaire_id: string;
  metier_id: number;
  date_debut: string;
  date_fin: string;
  commentaire: string | null;
}

export interface PlanningGeneralData {
  affaires: AffaireLite[];
  plannings: PlanningMetierRow[];
  metiers: MetierLite[];
}

export async function fetchPlanningGeneral(): Promise<PlanningGeneralData> {
  const [affairesRes, planningsRes, metiersRes] = await Promise.all([
    supabase
      .from("affaires")
      .select("id, numero, nom, client, statut, phase, date_montage, date_demontage")
      .is("archived_at", null)
      .neq("statut", "annule")
      .order("date_montage", { ascending: true, nullsFirst: false }),
    supabase
      .from("affaire_planning_metier")
      .select("id, affaire_id, metier_id, date_debut, date_fin, commentaire")
      .order("date_debut", { ascending: true }),
    supabase.from("metiers").select("id, libelle, couleur").order("id", { ascending: true }),
  ]);

  if (affairesRes.error) throw affairesRes.error;
  if (planningsRes.error) throw planningsRes.error;
  if (metiersRes.error) throw metiersRes.error;

  return {
    affaires: (affairesRes.data ?? []) as AffaireLite[],
    plannings: (planningsRes.data ?? []) as PlanningMetierRow[],
    metiers: (metiersRes.data ?? []) as MetierLite[],
  };
}

export interface PlanningMetierInput {
  affaire_id: string;
  metier_id: number;
  date_debut: string;
  date_fin: string;
  commentaire?: string | null;
}

/** Upsert idempotent : 1 ligne par (affaire, métier). */
export async function upsertPlanningMetier(rows: PlanningMetierInput[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("affaire_planning_metier").upsert(
    rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
    { onConflict: "affaire_id,metier_id" },
  );
  if (error) throw error;
}

/** Supprime les lignes (affaire, métier) décochées dans le dialogue d'édition. */
export async function deletePlanningMetierRows(
  affaireId: string,
  metierIds: number[],
): Promise<void> {
  if (metierIds.length === 0) return;
  const { error } = await supabase
    .from("affaire_planning_metier")
    .delete()
    .eq("affaire_id", affaireId)
    .in("metier_id", metierIds);
  if (error) throw error;
}

export function isProspectAffaire(a: Pick<AffaireLite, "phase" | "statut">): boolean {
  return a.phase === "opportunite" || a.statut === "prospect";
}
