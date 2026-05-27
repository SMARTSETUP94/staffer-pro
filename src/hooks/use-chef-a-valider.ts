import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMesAffairesChef } from "@/hooks/use-mes-affaires-chef";
import { useAuth } from "@/lib/auth-context";
import { useCapability } from "@/hooks/use-capability";

export interface HeureAValider {
  id: string;
  affaire_id: string;
  affaire_numero: string;
  affaire_nom: string;
  employe_id: string;
  employe_nom: string;
  date: string;
  heures_reelles: number | null;
  heure_debut: string | null;
  heure_fin: string | null;
  commentaire: string | null;
  statut: string;
}

export interface ObjetAValider {
  id: string;
  affaire_id: string;
  affaire_numero: string;
  affaire_nom: string;
  reference: string;
  nom: string;
  quantite: number;
  statut_chef: "a_faire" | "en_cours" | "bloque" | "fini";
  commentaire_chef: string | null;
}

export function useChefAValider() {
  const { user } = useAuth();
  const canValider = useCapability("heures.valider");
  const { data: affaires } = useMesAffairesChef();
  const affaireIds = (affaires ?? []).map((a) => a.id);

  const heuresQ = useQuery<HeureAValider[]>({
    queryKey: ["chef-a-valider-heures", user?.id, affaireIds.length],
    enabled: canValider && affaireIds.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("heures_saisies")
        .select(
          "id, affaire_id, employe_id, date, heures_reelles, heure_debut, heure_fin, commentaire, statut, affaires(numero,nom), employes(prenom,nom)"
        )
        .eq("statut", "soumis")
        .in("affaire_id", affaireIds)
        .order("date", { ascending: false })
        .limit(200);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.id,
        affaire_id: r.affaire_id,
        affaire_numero: r.affaires?.numero ?? "",
        affaire_nom: r.affaires?.nom ?? "",
        employe_id: r.employe_id,
        employe_nom: r.employes ? `${r.employes.prenom} ${r.employes.nom}` : "",
        date: r.date,
        heures_reelles: r.heures_reelles,
        heure_debut: r.heure_debut,
        heure_fin: r.heure_fin,
        commentaire: r.commentaire,
        statut: r.statut,
      }));
    },
  });

  const objetsQ = useQuery<ObjetAValider[]>({
    queryKey: ["chef-a-valider-objets", user?.id, affaireIds.length],
    enabled: canValider && affaireIds.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fabrication_objets")
        .select("id, affaire_id, reference, nom, quantite, statut_chef, commentaire_chef, archive, affaires(numero,nom)")
        .eq("archive", false)
        .neq("statut_chef", "fini")
        .in("affaire_id", affaireIds)
        .order("reference");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.id,
        affaire_id: r.affaire_id,
        affaire_numero: r.affaires?.numero ?? "",
        affaire_nom: r.affaires?.nom ?? "",
        reference: r.reference,
        nom: r.nom,
        quantite: r.quantite,
        statut_chef: r.statut_chef,
        commentaire_chef: r.commentaire_chef,
      }));
    },
  });

  return {
    heures: heuresQ.data ?? [],
    objets: objetsQ.data ?? [],
    totalCount: (heuresQ.data?.length ?? 0) + (objetsQ.data?.length ?? 0),
    isLoading: heuresQ.isLoading || objetsQ.isLoading,
    refetch: () => {
      heuresQ.refetch();
      objetsQ.refetch();
    },
  };
}
