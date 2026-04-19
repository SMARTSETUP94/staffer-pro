import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export interface Metier {
  id: number;
  code: string;
  libelle: string;
  couleur: string;
  ordre: number;
}

export interface Employe {
  id: string;
  prenom: string;
  nom: string;
  type_contrat: "CDI" | "Interim" | "CDD" | "Independant";
  sous_type_contrat: string | null;
  agence_interim: string | null;
  metier_principal_id: number;
}

export interface Affaire {
  id: string;
  numero: string;
  nom: string;
  lieu: string | null;
  client: string | null;
  chef_chantier_id: string | null;
}

export interface Assignation {
  id: string;
  date: string;
  demi_journee: "AM" | "PM" | "JOURNEE";
  heures: number;
  affaire_id: string;
  employe_id: string;
  metier_id: number;
  notes: string | null;
}

export interface DevisConsommation {
  affaire_id: string;
  devis_id: string;
  devis_numero: string;
  metier_id: number;
  metier: string;
  couleur: string;
  heures_prevues: number;
  heures_assignees: number;
  heures_restantes: number;
  pct_consomme: number;
}

export interface PlanningData {
  metiers: Metier[];
  employes: Employe[];
  affaires: Affaire[];
  assignations: Assignation[];
  consommation: DevisConsommation[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePlanningData(weekStart: Date, weekEnd: Date): PlanningData {
  const [metiers, setMetiers] = useState<Metier[]>([]);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [affaires, setAffaires] = useState<Affaire[]>([]);
  const [assignations, setAssignations] = useState<Assignation[]>([]);
  const [consommation, setConsommation] = useState<DevisConsommation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(weekEnd, "yyyy-MM-dd");

    Promise.all([
      supabase.from("metiers").select("*").order("ordre"),
      supabase
        .from("employes")
        .select("id, prenom, nom, type_contrat, sous_type_contrat, agence_interim, metier_principal_id")
        .eq("actif", true)
        .eq("non_staffing", false)
        .order("nom"),
      supabase.from("affaires").select("id, numero, nom, lieu, client, chef_chantier_id"),
      supabase
        .from("assignations")
        .select("id, date, demi_journee, heures, affaire_id, employe_id, metier_id, notes")
        .gte("date", startStr)
        .lte("date", endStr),
      supabase.from("v_devis_consommation").select("*"),
    ])
      .then(([mRes, eRes, aRes, asRes, cRes]) => {
        if (cancelled) return;
        if (mRes.error) throw mRes.error;
        if (eRes.error) throw eRes.error;
        if (aRes.error) throw aRes.error;
        if (asRes.error) throw asRes.error;
        if (cRes.error) throw cRes.error;
        setMetiers((mRes.data ?? []) as Metier[]);
        setEmployes((eRes.data ?? []) as Employe[]);
        setAffaires((aRes.data ?? []) as Affaire[]);
        setAssignations((asRes.data ?? []) as Assignation[]);
        setConsommation((cRes.data ?? []) as DevisConsommation[]);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message ?? String(e));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [weekStart.getTime(), weekEnd.getTime(), tick]);

  return {
    metiers,
    employes,
    affaires,
    assignations,
    consommation,
    loading,
    error,
    refresh: () => setTick((t) => t + 1),
  };
}
