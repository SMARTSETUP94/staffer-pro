import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProjetRole } from "@/lib/labels";
import type { Charge, EmployeLite, Referent } from "@/lib/equipe-projet";

export type AffaireRoleRow = {
  id: string; affaire_id: string; role: ProjetRole; employe_id: string;
  date_debut: string | null; date_fin: string | null; note: string | null;
};

export function useTypologiePhases() {
  return useQuery({
    queryKey: ["typologie-phases"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("typologie_phases").select("typologie,phases");
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.typologie as string, (r.phases ?? []) as string[]]));
    },
  });
}

export function useEmployesActifs() {
  return useQuery({
    queryKey: ["employes-actifs-lite"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EmployeLite[]> => {
      const { data, error } = await supabase.from("employes").select("id,nom,prenom,actif").eq("actif", true).order("nom");
      if (error) throw error;
      return (data ?? []) as EmployeLite[];
    },
  });
}

export function useRoleReferents() {
  return useQuery({
    queryKey: ["role-referents"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("role_referents").select("id,employe_id,role,niveau");
      if (error) throw error;
      return (data ?? []) as (Referent & { id: string; role: ProjetRole })[];
    },
  });
}

/** Charge réelle / potentielle par (employé, rôle), mêmes chiffres pour tous les utilisateurs. */
export function useChargeRolesProjet() {
  return useQuery({
    queryKey: ["charge-roles-projet"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("charge_roles_projet");
      if (error) return new Map<string, Charge>();
      return new Map((data ?? []).map((r) => [`${r.employe_id}|${r.role}`, { nb_en_cours: r.nb_en_cours, nb_potentielles: r.nb_potentielles }]));
    },
  });
}

export function useAffaireRoles(affaireId: string | undefined) {
  return useQuery({
    queryKey: ["affaire-roles", affaireId],
    enabled: Boolean(affaireId),
    queryFn: async (): Promise<AffaireRoleRow[]> => {
      const { data, error } = await supabase.from("affaire_roles")
        .select("id,affaire_id,role,employe_id,date_debut,date_fin,note").eq("affaire_id", affaireId!);
      if (error) throw error;
      return (data ?? []) as AffaireRoleRow[];
    },
  });
}

export function useAffecterRole() {
  const qc = useQueryClient();
  return async (args: { affaireId: string; role: ProjetRole; employeId: string | null; dateDebut?: string | null; dateFin?: string | null; remplacerDates?: boolean }) => {
    const { error } = await supabase.rpc("app_affecter_role_projet", {
      _affaire_id: args.affaireId, _role: args.role, _employe_id: args.employeId as string,
      _date_debut: args.dateDebut ?? undefined, _date_fin: args.dateFin ?? undefined,
      _remplacer_dates: args.remplacerDates ?? false,
    });
    if (error) throw error;
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["affaire-roles", args.affaireId] }),
      qc.invalidateQueries({ queryKey: ["charge-roles-projet"] }),
      qc.invalidateQueries({ queryKey: ["planning-pilotage"] }),
      qc.invalidateQueries({ queryKey: ["liste-chantiers"] }),
    ]);
    window.dispatchEvent(new Event("affaire-updated"));
  };
}
