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

/** Durée de validité d'un contrôle technique (années) */
export const CT_VALIDITE_ANNEES = 2;

/**
 * Calcule un niveau d'alerte par rapport à une date d'échéance.
 * - expired : la date est passée
 * - warning : on est dans la fenêtre `joursAvant` avant l'échéance
 * - ok      : encore au-delà de la fenêtre
 * - none    : pas de date renseignée
 */
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

/**
 * Renvoie la date d'expiration du CT (date du dernier contrôle + 2 ans),
 * au format ISO YYYY-MM-DD. `null` si pas de date d'origine.
 */
export function dateExpirationCT(dateControle: string | null): string | null {
  if (!dateControle) return null;
  const d = new Date(dateControle + "T00:00:00");
  d.setFullYear(d.getFullYear() + CT_VALIDITE_ANNEES);
  return d.toISOString().slice(0, 10);
}

/**
 * Alerte spécifique au CT : on calcule sur la date d'expiration
 * (date du dernier contrôle + 2 ans), pas sur la date de contrôle.
 */
export function alerteCT(dateControle: string | null, joursAvant = 30): AlerteNiveau {
  return alerteDate(dateExpirationCT(dateControle), joursAvant);
}

export function vehiculeAUneAlerte(v: Vehicule, joursAvant = 30): boolean {
  const niveaux = [
    alerteCT(v.date_controle_technique, joursAvant),
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
