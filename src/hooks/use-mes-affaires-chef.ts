import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

/** Affaires sur lesquelles l'utilisateur connecté est chef à n'importe quel titre. */
export interface AffaireChef {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  lieu: string | null;
  date_debut: string | null;
  date_fin_prevue: string | null;
  statut: string;
  phase: string;
  mes_roles: string[];
}

export function useMesAffairesChef() {
  const { user } = useAuth();
  return useQuery<AffaireChef[]>({
    queryKey: ["mes-affaires-chef", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      // Récupère l'employe_id du user
      const { data: emp } = await supabase
        .from("employes")
        .select("id")
        .eq("profile_id", user!.id)
        .maybeSingle();
      if (!emp?.id) return [];

      const { data, error } = await supabase.rpc("mes_affaires_chef", {
        _employe_id: emp.id,
      });
      if (error) throw error;
      // RPC retourne (affaire, mes_roles[]) — on aplatit
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((row) => ({
        id: row.affaire?.id ?? row.id,
        numero: row.affaire?.numero ?? row.numero,
        nom: row.affaire?.nom ?? row.nom,
        client: row.affaire?.client ?? row.client,
        lieu: row.affaire?.lieu ?? row.lieu,
        date_debut: row.affaire?.date_debut ?? row.date_debut,
        date_fin_prevue: row.affaire?.date_fin_prevue ?? row.date_fin_prevue,
        statut: row.affaire?.statut ?? row.statut,
        phase: row.affaire?.phase ?? row.phase,
        mes_roles: row.mes_roles ?? [],
      }));
    },
  });
}

/** Set des affaire_id (utile pour filtrer côté client). */
export function useMesAffairesChefIds(): { ids: Set<string>; isLoading: boolean } {
  const { data, isLoading } = useMesAffairesChef();
  return { ids: new Set((data ?? []).map((a) => a.id)), isLoading };
}
