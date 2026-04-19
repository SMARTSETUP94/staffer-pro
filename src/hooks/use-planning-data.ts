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
  date_montage: string | null;
  date_demontage: string | null;
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

export type AbsenceType = "conges" | "formation" | "arret_maladie" | "rtt" | "autre";

export interface Absence {
  id: string;
  employe_id: string;
  date_debut: string;
  date_fin: string;
  type: AbsenceType;
  demi_journee: "AM" | "PM" | "JOURNEE" | null;
  motif: string | null;
  valide: boolean;
}

export interface PlanningData {
  metiers: Metier[];
  employes: Employe[];
  affaires: Affaire[];
  assignations: Assignation[];
  consommation: DevisConsommation[];
  absences: Absence[];
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
  const [absences, setAbsences] = useState<Absence[]>([]);
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
      // Absences chevauchant la semaine : date_debut <= weekEnd ET date_fin >= weekStart
      supabase
        .from("absences")
        .select("id, employe_id, date_debut, date_fin, type, demi_journee, motif, valide")
        .lte("date_debut", endStr)
        .gte("date_fin", startStr),
    ])
      .then(([mRes, eRes, aRes, asRes, cRes, abRes]) => {
        if (cancelled) return;
        if (mRes.error) throw mRes.error;
        if (eRes.error) throw eRes.error;
        if (aRes.error) throw aRes.error;
        if (asRes.error) throw asRes.error;
        if (cRes.error) throw cRes.error;
        if (abRes.error) throw abRes.error;
        setMetiers((mRes.data ?? []) as Metier[]);
        setEmployes((eRes.data ?? []) as Employe[]);
        setAffaires((aRes.data ?? []) as Affaire[]);
        setAssignations((asRes.data ?? []) as Assignation[]);
        setConsommation((cRes.data ?? []) as DevisConsommation[]);
        setAbsences((abRes.data ?? []) as Absence[]);
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
    absences,
    loading,
    error,
    refresh: () => setTick((t) => t + 1),
  };
}
