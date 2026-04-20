import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Vehicule = Tables<"vehicules">;
export type AdresseFavorite = Tables<"adresses_favorites">;
export type VehiculeChauffeurAutorise = Tables<"vehicule_chauffeurs_autorises">;
export type Trajet = Tables<"trajets">;

export function useVehicules() {
  const query = useQuery({
    queryKey: ["vehicules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicules")
        .select("*")
        .order("nom", { ascending: true });
      if (error) throw error;
      return data as Vehicule[];
    },
  });
  return { vehicules: query.data ?? [], isLoading: query.isLoading, refetch: query.refetch };
}

export function useAdressesFavorites() {
  const query = useQuery({
    queryKey: ["adresses_favorites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("adresses_favorites")
        .select("*")
        .order("nom", { ascending: true });
      if (error) throw error;
      return data as AdresseFavorite[];
    },
  });
  return { adresses: query.data ?? [], isLoading: query.isLoading, refetch: query.refetch };
}

export function useVehiculeChauffeursAutorises(vehiculeId: string | null) {
  const query = useQuery({
    queryKey: ["vca", vehiculeId],
    enabled: !!vehiculeId,
    queryFn: async () => {
      if (!vehiculeId) return [];
      const { data, error } = await supabase
        .from("vehicule_chauffeurs_autorises")
        .select("*")
        .eq("vehicule_id", vehiculeId);
      if (error) throw error;
      return data as VehiculeChauffeurAutorise[];
    },
  });
  return { autorises: query.data ?? [], isLoading: query.isLoading, refetch: query.refetch };
}

/** Helpers J-30 sur dates de contrôle / révision / assurance */
export type AlerteNiveau = "ok" | "warning" | "expired" | "none";

export function alerteDate(date: string | null, joursAvant = 30): AlerteNiveau {
  if (!date) return "none";
  const d = new Date(date + "T00:00:00").getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffJours = Math.floor((d - today.getTime()) / 86400000);
  if (diffJours < 0) return "expired";
  if (diffJours <= joursAvant) return "warning";
  return "ok";
}

export function vehiculeAUneAlerte(v: Vehicule, joursAvant = 30): boolean {
  return (
    alerteDate(v.date_controle_technique, joursAvant) !== "ok" &&
      alerteDate(v.date_controle_technique, joursAvant) !== "none" ||
    alerteDate(v.date_prochaine_revision, joursAvant) !== "ok" &&
      alerteDate(v.date_prochaine_revision, joursAvant) !== "none" ||
    alerteDate(v.date_expiration_assurance, joursAvant) !== "ok" &&
      alerteDate(v.date_expiration_assurance, joursAvant) !== "none"
  );
}

export const VEHICULE_TYPE_LABEL: Record<Vehicule["type"], string> = {
  VL: "Véhicule léger",
  M3_20: "20 m³",
  poids_lourd: "Poids lourd",
};

export const PROPRIETAIRE_LABEL: Record<Vehicule["proprietaire"], string> = {
  interne: "Interne",
  location: "Location",
  sous_traitance: "Sous-traitance",
};
