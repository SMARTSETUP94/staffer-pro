import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export interface PoleCellRow {
  chantier_id: string;
  chantier_numero: string;
  chantier_nom: string;
  chantier_typologie: string | null;
  chantier_statut: string;
  metier_id: number;
  metier_libelle: string;
  metier_couleur: string;
  metier_ordre: number;
  nb_personnes: number;
  total_demi_jours: number;
  total_heures: number;
}

export interface PoleCapacite {
  metier_id: number;
  metier_libelle: string;
  metier_couleur: string;
  metier_ordre: number;
  capacite_cdi_cdd: number;
  capacite_interim: number;
  capacite_totale: number;
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
  const [cells, setCells] = useState<PoleCellRow[]>([]);
  const [capacites, setCapacites] = useState<PoleCapacite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debut = format(weekStart, "yyyy-MM-dd");
  const fin = format(weekEnd, "yyyy-MM-dd");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cellsRes, capRes] = await Promise.all([
        supabase.rpc("staffing_par_pole_consolide", {
          p_periode_debut: debut,
          p_periode_fin: fin,
          p_inclure_opportunites: inclureOpportunites,
          p_filtres_chantier_ids: undefined,
          p_filtres_metier_ids: filtresMetierIds && filtresMetierIds.length > 0 ? filtresMetierIds : undefined,
          p_filtres_statut: filtresStatut && filtresStatut.length > 0 ? filtresStatut : undefined,
        }),
        supabase.rpc("capacite_par_metier"),
      ]);
      if (cellsRes.error) throw cellsRes.error;
      if (capRes.error) throw capRes.error;
      setCells((cellsRes.data ?? []) as PoleCellRow[]);
      setCapacites((capRes.data ?? []) as PoleCapacite[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [debut, fin, inclureOpportunites, JSON.stringify(filtresMetierIds), JSON.stringify(filtresStatut)]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { cells, capacites, loading, error, refresh: fetchAll };
}
