import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Vehicule = Tables<"vehicules">;
export type AdresseFavorite = Tables<"adresses_favorites">;
export type VehiculeChauffeurAutorise = Tables<"vehicule_chauffeurs_autorises">;
export type Trajet = Tables<"trajets">;

export function useVehicules() {
  const [vehicules, setVehicules] = useState<Vehicule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("vehicules")
      .select("*")
      .order("nom", { ascending: true });
    if (!error) setVehicules((data as Vehicule[]) ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { vehicules, isLoading, refetch };
}

export function useAdressesFavorites() {
  const [adresses, setAdresses] = useState<AdresseFavorite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("adresses_favorites")
      .select("*")
      .order("nom", { ascending: true });
    if (!error) setAdresses((data as AdresseFavorite[]) ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { adresses, isLoading, refetch };
}

export function useVehiculeChauffeursAutorises(vehiculeId: string | null) {
  const [autorises, setAutorises] = useState<VehiculeChauffeurAutorise[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!vehiculeId) {
      setAutorises([]);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from("vehicule_chauffeurs_autorises")
      .select("*")
      .eq("vehicule_id", vehiculeId);
    if (!error) setAutorises((data as VehiculeChauffeurAutorise[]) ?? []);
    setIsLoading(false);
  }, [vehiculeId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { autorises, isLoading, refetch };
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
  const niveaux = [
    alerteDate(v.date_controle_technique, joursAvant),
    alerteDate(v.date_prochaine_revision, joursAvant),
    alerteDate(v.date_expiration_assurance, joursAvant),
  ];
  return niveaux.some((n) => n === "warning" || n === "expired");
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
