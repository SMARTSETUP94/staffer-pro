/**
 * Sprint D / Batch 2 — Opt-in alertes équipe par chantier.
 *
 * Helpers client autour de `affaire_alertes_optin`. L'opt-in active la
 * remontée d'une alerte donnée dans l'inbox du chef / admin.
 *
 * Codes d'alerte :
 *  - `sous_dim`     : équipe sous-dimensionnée sur une phase active
 *  - `depassement`  : heures réelles dépassent heures prévues
 *  - `cumul_100`    : une personne saisit ≥100% sur la période
 *  - `hors_equipe`  : saisie hors équipe castée
 */
import { supabase } from "@/integrations/supabase/client";

export const ALERTE_CODES = ["sous_dim", "depassement", "cumul_100", "hors_equipe"] as const;
export type AlerteCode = (typeof ALERTE_CODES)[number];

export const ALERTE_LABELS: Record<AlerteCode, string> = {
  sous_dim: "Équipe sous-dimensionnée",
  depassement: "Dépassement heures vs devis",
  cumul_100: "Personne cumulée ≥ 100%",
  hors_equipe: "Saisie hors équipe castée",
};

export interface AlerteOptinRow {
  id: string;
  affaire_id: string;
  alerte_code: AlerteCode;
  active: boolean;
}

export async function listAlerteOptin(affaireId: string): Promise<AlerteOptinRow[]> {
  const { data, error } = await supabase
    .from("affaire_alertes_optin")
    .select("id, affaire_id, alerte_code, active")
    .eq("affaire_id", affaireId);
  if (error) throw error;
  return (data ?? []) as AlerteOptinRow[];
}

export async function setAlerteOptin(
  affaireId: string,
  alerteCode: AlerteCode,
  active: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("affaire_alertes_optin")
    .upsert(
      { affaire_id: affaireId, alerte_code: alerteCode, active },
      { onConflict: "affaire_id,alerte_code" },
    );
  if (error) throw error;
}

/** Map utilitaire : code → active (default false). */
export function toOptinMap(rows: AlerteOptinRow[]): Record<AlerteCode, boolean> {
  const map = Object.fromEntries(ALERTE_CODES.map((c) => [c, false])) as Record<
    AlerteCode,
    boolean
  >;
  for (const r of rows) {
    if ((ALERTE_CODES as readonly string[]).includes(r.alerte_code)) {
      map[r.alerte_code] = r.active;
    }
  }
  return map;
}
