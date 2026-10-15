import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type EtapeLogistique = Database["public"]["Tables"]["affaire_etapes_logistiques"]["Row"] & {
  affaire: { id: string; numero: string; nom: string; client: string | null; lieu: string | null } | null;
  vehicule: { id: string; nom: string; immatriculation: string | null } | null;
};
export type EtapeInsert = Database["public"]["Tables"]["affaire_etapes_logistiques"]["Insert"];

const SELECT = "*, affaire:affaires(id,numero,nom,client,lieu), vehicule:vehicules(id,nom,immatriculation)";

/** Étapes logistiques chevauchant [from, to] (dates ISO), optionnellement d'une seule affaire. */
export function useEtapesLogistiques(from: string, to: string, affaireId?: string, refetchMs?: number) {
  return useQuery({
    queryKey: ["etapes-logistiques", from, to, affaireId ?? null],
    refetchInterval: refetchMs,
    queryFn: async () => {
      let q = supabase
        .from("affaire_etapes_logistiques")
        .select(SELECT)
        .lte("date_debut", to)
        .or(`date_fin.gte.${from},and(date_fin.is.null,date_debut.gte.${from})`)
        .neq("statut", "annule")
        .order("date_debut")
        .order("heure_debut", { nullsFirst: true });
      if (affaireId) q = q.eq("affaire_id", affaireId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as EtapeLogistique[];
    },
  });
}

/** Toutes les étapes d'une affaire (fiche logistique). */
export function useEtapesAffaire(affaireId: string) {
  return useQuery({
    queryKey: ["etapes-logistiques", "affaire", affaireId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affaire_etapes_logistiques")
        .select(SELECT)
        .eq("affaire_id", affaireId)
        .order("date_debut");
      if (error) throw error;
      return (data ?? []) as unknown as EtapeLogistique[];
    },
  });
}

export function useInvalidateEtapes() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["etapes-logistiques"] });
}

export function useVehiculesActifs() {
  return useQuery({
    queryKey: ["vehicules-actifs-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicules").select("id,nom,immatriculation,type").eq("actif", true).order("nom");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAffairesPourLogistique() {
  return useQuery({
    queryKey: ["affaires-logistique-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affaires").select("id,numero,nom,phase").is("archived_at", null).order("numero", { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}
