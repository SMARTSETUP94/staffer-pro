import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export interface PolePersonne {
  employe_id: string;
  prenom: string | null;
  nom: string | null;
  chantier_id: string;
  chantier_numero: string;
  chantier_nom: string;
  est_opportunite: boolean;
}

export interface PoleJourRow {
  metier_id: number;
  metier_libelle: string;
  metier_couleur: string;
  metier_ordre: number;
  date_jour: string; // yyyy-MM-dd
  nb_personnes: number;
  personnes: PolePersonne[];
}

interface Params {
  weekStart: Date;
  weekEnd: Date;
  inclureOpportunites: boolean;
  filtresMetierIds?: number[];
  filtresStatut?: string[];
}

export function usePlanningParPole({
  weekStart,
  weekEnd,
  inclureOpportunites,
  filtresMetierIds,
  filtresStatut,
}: Params) {
  const [rows, setRows] = useState<PoleJourRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debut = format(weekStart, "yyyy-MM-dd");
  const fin = format(weekEnd, "yyyy-MM-dd");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc(
        "staffing_par_pole_jours" as never,
        {
          p_periode_debut: debut,
          p_periode_fin: fin,
          p_inclure_opportunites: inclureOpportunites,
          p_filtres_metier_ids:
            filtresMetierIds && filtresMetierIds.length > 0 ? filtresMetierIds : undefined,
          p_filtres_statut:
            filtresStatut && filtresStatut.length > 0 ? filtresStatut : undefined,
        } as never,
      );
      if (err) throw err;
      setRows(((data ?? []) as unknown) as PoleJourRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [debut, fin, inclureOpportunites, JSON.stringify(filtresMetierIds), JSON.stringify(filtresStatut)]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { rows, loading, error, refresh: fetchAll };
}
