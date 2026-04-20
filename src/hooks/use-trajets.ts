import { useEffect, useState } from "react";
import { eachDayOfInterval, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Trajet, Vehicule } from "./use-vehicules";

export function useTrajetsWeek(weekStart: Date, weekEnd: Date) {
  const [trajets, setTrajets] = useState<Trajet[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("trajets")
      .select("*")
      .gte("date", format(weekStart, "yyyy-MM-dd"))
      .lte("date", format(weekEnd, "yyyy-MM-dd"))
      .order("date")
      .order("heure_depart");
    if (!error) setTrajets((data as Trajet[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.getTime(), weekEnd.getTime()]);

  return { trajets, loading, refresh };
}

export function getDaysOfWeek(weekStart: Date, weekEnd: Date) {
  return eachDayOfInterval({ start: weekStart, end: weekEnd });
}

/**
 * Filtre les chauffeurs compatibles pour un véhicule donné.
 * - VL / 20m³ : tout employé actif marqué `est_livreur=true`
 * - Poids lourd : seulement ceux dans `vehicule_chauffeurs_autorises`
 */
export function getCompatibleChauffeurs<T extends { id: string; est_livreur: boolean; actif: boolean }>(
  vehicule: Vehicule | null,
  livreurs: T[],
  autorisesIds: Set<string>,
): T[] {
  if (!vehicule) return livreurs.filter((l) => l.actif && l.est_livreur);
  if (vehicule.type === "poids_lourd") {
    return livreurs.filter((l) => l.actif && l.est_livreur && autorisesIds.has(l.id));
  }
  return livreurs.filter((l) => l.actif && l.est_livreur);
}
