import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export interface ChefDashboardData {
  todayDateStr: string;
  chantiersActifs: { affaire_id: string; numero: string; nom: string; nb_personnes: number }[];
  presents: number;
  absentsValides: number;
  heuresAValider: number;
  contratsEnAttente: number;
}

export function useChefDashboard() {
  return useQuery<ChefDashboardData>({
    queryKey: ["chef-dashboard"],
    refetchInterval: 90_000,
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");

      const [
        { data: assigsToday },
        { data: absencesToday },
        { count: heuresCount },
        { count: contratsCount },
      ] = await Promise.all([
        supabase
          .from("assignations")
          .select("affaire_id, employe_id, affaires(numero,nom)")
          .eq("date", today),
        supabase
          .from("absences")
          .select("id")
          .eq("valide", true)
          .lte("date_debut", today)
          .gte("date_fin", today),
        supabase
          .from("heures_saisies")
          .select("id", { count: "exact", head: true })
          .eq("statut", "soumis"),
        supabase
          .from("contrats_intermittents")
          .select("id", { count: "exact", head: true })
          .in("statut", ["a_signer_employe", "a_signer_employeur"]),
      ]);

      const byAffaire = new Map<string, { affaire_id: string; numero: string; nom: string; employes: Set<string> }>();
      const presentsSet = new Set<string>();
      for (const a of assigsToday ?? []) {
        const affaireId = a.affaire_id as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aff: any = a.affaires;
        if (!byAffaire.has(affaireId)) {
          byAffaire.set(affaireId, {
            affaire_id: affaireId,
            numero: aff?.numero ?? "",
            nom: aff?.nom ?? "",
            employes: new Set(),
          });
        }
        byAffaire.get(affaireId)!.employes.add(a.employe_id as string);
        presentsSet.add(a.employe_id as string);
      }

      return {
        todayDateStr: today,
        chantiersActifs: Array.from(byAffaire.values())
          .map((c) => ({ affaire_id: c.affaire_id, numero: c.numero, nom: c.nom, nb_personnes: c.employes.size }))
          .sort((a, b) => a.numero.localeCompare(b.numero)),
        presents: presentsSet.size,
        absentsValides: absencesToday?.length ?? 0,
        heuresAValider: heuresCount ?? 0,
        contratsEnAttente: contratsCount ?? 0,
      };
    },
  });
}
