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
  /** v0.18.1 — chauffeur compatible véhicule. */
  est_livreur?: boolean;
  /** v0.18.1 — permis détenus (pour filtrage chauffeur véhicule). */
  categories_permis?: ("B" | "C" | "CE" | "D")[] | null;
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
  /** v0.17 — 'opportunite' (9XXX) ou 'signe' (5XXX). Default 'signe' côté DB. */
  phase: "opportunite" | "signe";
}

export interface Assignation {
  id: string;
  date: string;
  demi_journee: "AM" | "PM" | "JOURNEE";
  heures: number;
  affaire_id: string;
  employe_id: string;
  metier_id: number;
  devis_id: string | null;
  notes: string | null;
  statut_confirmation: "non_requise" | "en_attente" | "confirmee" | "refusee";
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
  /** v0.18.1 — heures saisies par les employés et validées par chef/admin */
  heures_reelles_validees: number;
  /** v0.18.1 — heures saisies en attente de validation */
  heures_reelles_soumises: number;
  heures_restantes: number;
  pct_consomme: number;
}

/** v0.15.1 — Lot/devis exposé pour le sélecteur Planning et l'autofill assignation. */
export interface DevisLot {
  id: string;
  affaire_id: string;
  numero: string;
  libelle: string | null;
  statut: "brouillon" | "signe" | "en_cours" | "termine" | "facture" | "cloture";
  date_debut_phase: string | null;
  date_fin_phase: string | null;
  livre_le: string | null;
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

export interface ChefRef {
  id: string;
  prenom: string;
  nom: string;
}

export interface PlanningData {
  metiers: Metier[];
  employes: Employe[];
  affaires: Affaire[];
  assignations: Assignation[];
  consommation: DevisConsommation[];
  absences: Absence[];
  chefsById: Map<string, ChefRef>;
  swapAssignationIds: Set<string>;
  /** v0.15.1 — Tous les devis (lots) des affaires actives, pour sélecteur lot et autofill. */
  devisLots: DevisLot[];
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
  const [chefsById, setChefsById] = useState<Map<string, ChefRef>>(new Map());
  const [swapAssignationIds, setSwapAssignationIds] = useState<Set<string>>(new Set());
  const [devisLots, setDevisLots] = useState<DevisLot[]>([]);
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
        .select("id, prenom, nom, type_contrat, sous_type_contrat, agence_interim, metier_principal_id, est_livreur, categories_permis")
        .eq("actif", true)
        .eq("non_staffing", false)
        .order("nom"),
      supabase.from("affaires").select("id, numero, nom, lieu, client, chef_chantier_id, date_montage, date_demontage, phase"),
      supabase
        .from("assignations")
        .select("id, date, demi_journee, heures, affaire_id, employe_id, metier_id, devis_id, notes, statut_confirmation")
        .gte("date", startStr)
        .lte("date", endStr),
      supabase.from("v_devis_consommation").select("*"),
      // Absences chevauchant la semaine : date_debut <= weekEnd ET date_fin >= weekStart
      supabase
        .from("absences")
        .select("id, employe_id, date_debut, date_fin, type, demi_journee, motif, valide")
        .lte("date_debut", endStr)
        .gte("date_fin", startStr),
      // Tous les employés actifs (incl. non_staffing) pour résoudre les chefs de chantier
      supabase
        .from("employes")
        .select("id, prenom, nom")
        .eq("actif", true),
      // Swaps actifs (en cours de négociation)
      supabase
        .from("swap_requests")
        .select("from_assignation_id, to_assignation_id")
        .in("statut", ["proposee", "acceptee_collegue"]),
      // v0.15.1 — Devis (lots) de toutes les affaires, pour sélecteur lot Planning
      supabase
        .from("devis")
        .select("id, affaire_id, numero, libelle, statut, date_debut_phase, date_fin_phase, livre_le")
        .order("created_at", { ascending: true }),
    ])
      .then(([mRes, eRes, aRes, asRes, cRes, abRes, chefsRes, swapsRes, dvRes]) => {
        if (cancelled) return;
        if (mRes.error) throw mRes.error;
        if (eRes.error) throw eRes.error;
        if (aRes.error) throw aRes.error;
        if (asRes.error) throw asRes.error;
        if (cRes.error) throw cRes.error;
        if (abRes.error) throw abRes.error;
        if (chefsRes.error) throw chefsRes.error;
        if (swapsRes.error) throw swapsRes.error;
        if (dvRes.error) throw dvRes.error;
        setMetiers((mRes.data ?? []) as Metier[]);
        setEmployes((eRes.data ?? []) as Employe[]);
        setAffaires((aRes.data ?? []) as Affaire[]);
        setAssignations((asRes.data ?? []) as Assignation[]);
        setConsommation((cRes.data ?? []) as DevisConsommation[]);
        setAbsences((abRes.data ?? []) as Absence[]);
        const cMap = new Map<string, ChefRef>();
        ((chefsRes.data ?? []) as ChefRef[]).forEach((c) => cMap.set(c.id, c));
        setChefsById(cMap);
        const swapIds = new Set<string>();
        ((swapsRes.data ?? []) as { from_assignation_id: string; to_assignation_id: string | null }[]).forEach((s) => {
          if (s.from_assignation_id) swapIds.add(s.from_assignation_id);
          if (s.to_assignation_id) swapIds.add(s.to_assignation_id);
        });
        setSwapAssignationIds(swapIds);
        setDevisLots((dvRes.data ?? []) as DevisLot[]);
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
    chefsById,
    swapAssignationIds,
    devisLots,
    loading,
    error,
    refresh: () => setTick((t) => t + 1),
  };
}
