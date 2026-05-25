/**
 * Sprint D / Batch 1 — Hook capacité équipe.
 *
 * Lit la vue `v_affaire_equipe_capacite` pour une affaire donnée et renvoie
 * un map `phase → ligne capacité` consommable par `<EquipeCapaciteIndicator>`.
 *
 * Gating : feature flag `equipes_3_niveaux_alertes` (côté composant).
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
