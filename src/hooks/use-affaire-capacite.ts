/**
 * Sprint D / Batch 1 + Batch 2 finition — Hooks capacité équipe.
 *
 * - `useAffaireCapacite` : capacité par phase (v_affaire_equipe_capacite).
 * - `useAffaireCapaciteMetier` : capacité par métier dans la fab
 *   (v_affaire_equipe_capacite_metier) — 6 métiers fab individuels.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CapaciteStatut } from "@/components/atoms/EquipeCapaciteIndicator";

export interface CapacitePhaseRow {
  phase: string;
  nb_personnes_castees: number;
  heures_prevues: number | null;
  jours_ouvres_phase: number;
  capacite_estimee_h: number | null;
  ratio_capacite_vs_prevu: number | null;
  statut: CapaciteStatut;
  phase_start: string | null;
  phase_end: string | null;
}

export function useAffaireCapacite(affaireId: string | undefined) {
  return useQuery({
    queryKey: ["affaire-capacite", affaireId],
    enabled: !!affaireId,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, CapacitePhaseRow>> => {
      const { data, error } = await supabase
        .from("v_affaire_equipe_capacite")
        .select(
          "phase,nb_personnes_castees,heures_prevues,jours_ouvres_phase,capacite_estimee_h,ratio_capacite_vs_prevu,statut,phase_start,phase_end",
        )
        .eq("affaire_id", affaireId!);
      if (error) throw error;
      const map: Record<string, CapacitePhaseRow> = {};
      for (const r of (data ?? []) as CapacitePhaseRow[]) {
        map[r.phase] = r;
      }
      return map;
    },
  });
}

export interface CapaciteMetierRow {
  metier_id: number;
  nb_personnes_castees: number;
  heures_prevues: number | null;
  jours_ouvres_phase: number;
  capacite_estimee_h: number | null;
  ratio_capacite_vs_prevu: number | null;
  statut: CapaciteStatut;
}

export function useAffaireCapaciteMetier(affaireId: string | undefined) {
  return useQuery({
    queryKey: ["affaire-capacite-metier", affaireId],
    enabled: !!affaireId,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<number, CapaciteMetierRow>> => {
      const { data, error } = await supabase
        .from("v_affaire_equipe_capacite_metier")
        .select(
          "metier_id,nb_personnes_castees,heures_prevues,jours_ouvres_phase,capacite_estimee_h,ratio_capacite_vs_prevu,statut",
        )
        .eq("affaire_id", affaireId!);
      if (error) throw error;
      const map: Record<number, CapaciteMetierRow> = {};
      for (const r of (data ?? []) as CapaciteMetierRow[]) {
        map[r.metier_id] = r;
      }
      return map;
    },
  });
}
