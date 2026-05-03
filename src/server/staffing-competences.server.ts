// v0.35.x — Helper serveur : charge la map { employe_id → { metier_id → niveau } }
// Source : table employe_metiers (colonne `niveau` ENUM secondaire/depannage/bloque).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompetenceNiveau } from "@/lib/staffing/tier-ranking";

export async function loadNiveauxParEmploye(
  supabase: SupabaseClient,
): Promise<Record<string, Record<number, CompetenceNiveau>>> {
  const { data, error } = await supabase
    .from("employe_metiers")
    .select("employe_id, metier_id, niveau");
  if (error) throw new Error(error.message);
  const out: Record<string, Record<number, CompetenceNiveau>> = {};
  for (const row of data ?? []) {
    const eid = row.employe_id as string;
    const mid = row.metier_id as number;
    const niv = ((row as { niveau?: CompetenceNiveau }).niveau ?? "secondaire") as CompetenceNiveau;
    if (!out[eid]) out[eid] = {};
    out[eid][mid] = niv;
  }
  return out;
}
