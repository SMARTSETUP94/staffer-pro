import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ModeleDevis = { id: string; modele_nom: string | null; modele_categorie: string | null };

/** Modèles actifs + identifiant du modèle par défaut (présélectionné dans « Nouveau devis »). */
export function useModelesDevis(enabled: boolean) {
  return useQuery({
    queryKey: ["devis-modeles-actifs-defaut"],
    enabled,
    queryFn: async () => {
      const [l, d] = await Promise.all([
        supabase.rpc("devis_modeles_lister", { _actifs_seulement: true }),
        supabase.rpc("devis_modele_defaut_id"),
      ]);
      if (l.error) throw l.error;
      return { modeles: (l.data ?? []) as ModeleDevis[], defautId: (d.data as string | null) ?? null };
    },
  });
}
