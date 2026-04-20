import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SwapStatus =
  | "proposee"
  | "acceptee_collegue"
  | "refusee_collegue"
  | "validee_chef"
  | "rejetee_chef"
  | "appliquee"
  | "annulee";

export type SwapType = "delegation" | "echange";

export interface SwapRequestRow {
  id: string;
  type: SwapType;
  statut: SwapStatus;
  motif_demande: string | null;
  collegue_motif: string | null;
  chef_motif: string | null;
  collegue_decide_le: string | null;
  chef_decide_le: string | null;
  appliquee_le: string | null;
  created_at: string;
  from_employe_id: string;
  to_employe_id: string;
  from_assignation_id: string;
  to_assignation_id: string | null;
  from_employe: { prenom: string; nom: string } | null;
  to_employe: { prenom: string; nom: string } | null;
  from_assignation: {
    date: string;
    demi_journee: string;
    heures: number;
    affaire: { numero: string; nom: string } | null;
    metier: { libelle: string; couleur: string } | null;
  } | null;
  to_assignation: {
    date: string;
    demi_journee: string;
    heures: number;
    affaire: { numero: string; nom: string } | null;
    metier: { libelle: string; couleur: string } | null;
  } | null;
}

const SELECT_QUERY =
  "id, type, statut, motif_demande, collegue_motif, chef_motif, collegue_decide_le, chef_decide_le, appliquee_le, created_at, from_employe_id, to_employe_id, from_assignation_id, to_assignation_id, from_employe:employes!swap_requests_from_employe_id_fkey(prenom, nom), to_employe:employes!swap_requests_to_employe_id_fkey(prenom, nom), from_assignation:assignations!swap_requests_from_assignation_id_fkey(date, demi_journee, heures, affaire:affaires(numero, nom), metier:metiers(libelle, couleur)), to_assignation:assignations!swap_requests_to_assignation_id_fkey(date, demi_journee, heures, affaire:affaires(numero, nom), metier:metiers(libelle, couleur))";

interface Options {
  /** Filtrer par employé (utilisé pour /mes-swaps : montre seulement ses swaps) */
  employeId?: string;
  /** Filtrer par statuts */
  statuts?: SwapStatus[];
  /** Limiter aux swaps "à valider par le chef" (acceptee_collegue) */
  chefView?: boolean;
}

export function useMesSwaps(opts: Options = {}) {
  const [rows, setRows] = useState<SwapRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    let q = supabase
      .from("swap_requests")
      .select(SELECT_QUERY)
      .order("created_at", { ascending: false })
      .limit(200);

    if (opts.employeId) {
      q = q.or(`from_employe_id.eq.${opts.employeId},to_employe_id.eq.${opts.employeId}`);
    }
    if (opts.statuts && opts.statuts.length > 0) {
      q = q.in("statut", opts.statuts);
    }
    if (opts.chefView) {
      q = q.in("statut", ["acceptee_collegue"]);
    }

    q.then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as unknown as SwapRequestRow[]);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [opts.employeId, opts.chefView, JSON.stringify(opts.statuts ?? []), tick]);

  return { rows, loading, error, refresh };
}

export const SWAP_STATUS_LABEL: Record<SwapStatus, string> = {
  proposee: "Proposée",
  acceptee_collegue: "Acceptée par le collègue",
  refusee_collegue: "Refusée par le collègue",
  validee_chef: "Validée par le chef",
  rejetee_chef: "Rejetée par le chef",
  appliquee: "Appliquée",
  annulee: "Annulée",
};

export const SWAP_STATUS_COLOR: Record<SwapStatus, string> = {
  proposee: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  acceptee_collegue: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  refusee_collegue: "bg-red-500/15 text-red-700 dark:text-red-400",
  validee_chef: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejetee_chef: "bg-red-500/15 text-red-700 dark:text-red-400",
  appliquee: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  annulee: "bg-muted text-muted-foreground",
};

export const SWAP_IN_PROGRESS_STATUSES: SwapStatus[] = [
  "proposee",
  "acceptee_collegue",
];
