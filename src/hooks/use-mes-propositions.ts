import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ConfirmationStatus = "non_requise" | "en_attente" | "confirmee" | "refusee";

export interface PropositionRow {
  id: string;
  date: string;
  demi_journee: "AM" | "PM" | "JOURNEE";
  heures: number;
  notes: string | null;
  statut_confirmation: ConfirmationStatus;
  confirmee_le: string | null;
  refusee_le: string | null;
  motif_refus: string | null;
  employe_id: string;
  affaire_id: string;
  metier_id: number;
  affaire: { numero: string; nom: string; lieu: string | null; client: string | null } | null;
  metier: { libelle: string; couleur: string } | null;
}

const SELECT =
  "id, date, demi_journee, heures, notes, statut_confirmation, confirmee_le, refusee_le, motif_refus, employe_id, affaire_id, metier_id, affaire:affaires(numero, nom, lieu, client), metier:metiers(libelle, couleur)";

export function useMesPropositions(employeId: string | null) {
  const [rows, setRows] = useState<PropositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!employeId) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    supabase
      .from("assignations")
      .select(SELECT)
      .eq("employe_id", employeId)
      .neq("statut_confirmation", "non_requise")
      .order("date")
      .limit(500)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setLoading(false);
          return;
        }
        setRows((data ?? []) as unknown as PropositionRow[]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [employeId, tick]);

  return { rows, loading, error, refresh };
}

export const CONFIRMATION_LABEL: Record<ConfirmationStatus, string> = {
  non_requise: "Confirmée d'office",
  en_attente: "En attente",
  confirmee: "Confirmée",
  refusee: "Refusée",
};

export const CONFIRMATION_COLOR: Record<ConfirmationStatus, string> = {
  non_requise: "bg-muted text-muted-foreground",
  en_attente: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  confirmee: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  refusee: "bg-red-500/15 text-red-700 dark:text-red-400",
};
