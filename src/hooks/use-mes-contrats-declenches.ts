import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, format } from "date-fns";
import { useAuth } from "@/lib/auth-context";

export interface ContratChefRow {
  id: string;
  date_debut: string;
  date_fin: string;
  statut: string;
  employee_id: string;
  employe_nom: string | null;
  employe_telephone: string | null;
  chantier_numero: string | null;
  chantier_nom: string | null;
  created_at: string;
}

export function useMesContratsDeclenches() {
  const { user } = useAuth();
  return useQuery<ContratChefRow[]>({
    queryKey: ["mes-contrats-declenches", user?.id],
    enabled: !!user?.id,
    refetchInterval: 90_000,
    queryFn: async () => {
      const sinceDate = format(addDays(new Date(), -60), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("contrats_intermittents")
        .select(`
          id, date_debut, date_fin, statut, employee_id, created_at,
          employes:employee_id (nom, prenom, telephone, mobile),
          affaires:chantier_id (numero, nom)
        `)
        .eq("created_by", user!.id)
        .gte("date_debut", sinceDate)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.id,
        date_debut: r.date_debut,
        date_fin: r.date_fin,
        statut: r.statut,
        employee_id: r.employee_id,
        employe_nom: r.employes ? `${r.employes.prenom ?? ""} ${r.employes.nom ?? ""}`.trim() : null,
        employe_telephone: r.employes?.mobile ?? r.employes?.telephone ?? null,
        chantier_numero: r.affaires?.numero ?? null,
        chantier_nom: r.affaires?.nom ?? null,
        created_at: r.created_at,
      }));
    },
  });
}
