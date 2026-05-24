/**
 * Sprint B / B3 — useHeritageSaisieHeures
 *
 * Wrapper React Query autour de la RPC `resolve_saisie_heures` (livrée Sprint A).
 *
 * Logique cascade (côté SQL) :
 *   N3 (fabrication_objet_equipe) → N2 (affaire_equipe/phase) → N1 (assignations) → N0 (hors-planning)
 *
 * Retourne : niveau (0..3), source, autorisee, role_terrain, phase, objet_id, details (Json).
 *
 * Performance : ~3ms / appel (benchmark Sprint A). Cache 60s (la saisie change rarement
 * dans un même slot pendant une session).
 *
 * Gating : le composant appelant doit gérer `equipes_3_niveaux_lecture` —
 * tant que le flag est off, on peut quand même appeler la RPC (elle existe
 * indépendamment) mais le bandeau UI doit rester invisible.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HeritageNiveau = 0 | 1 | 2 | 3;
export type HeritageSource =
  | "fabrication_objet_equipe"
  | "affaire_equipe"
  | "assignations"
  | "hors_planning";

export interface HeritageSaisieResult {
  niveau: HeritageNiveau;
  source: HeritageSource;
  autorisee: boolean;
  role_terrain: string | null;
  phase: string | null;
  objet_id: string | null;
  details: unknown;
}

export interface HeritageSaisieInput {
  employeId: string | null | undefined;
  affaireId: string | null | undefined;
  date: string | null | undefined; // ISO yyyy-MM-dd
  objetId?: string | null;
}

export function useHeritageSaisieHeures(input: HeritageSaisieInput) {
  const { employeId, affaireId, date, objetId } = input;
  const enabled = !!employeId && !!affaireId && !!date;

  return useQuery<HeritageSaisieResult | null>({
    queryKey: ["heritage-saisie", employeId, affaireId, date, objetId ?? null],
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resolve_saisie_heures", {
        p_employe_id: employeId!,
        p_affaire_id: affaireId!,
        p_date: date!,
        ...(objetId ? { p_objet_id: objetId } : {}),
      });
      if (error) {
        console.warn("[useHeritageSaisieHeures]", error.message);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        niveau: row.niveau as HeritageNiveau,
        source: row.source as HeritageSource,
        autorisee: row.autorisee,
        role_terrain: row.role_terrain ?? null,
        phase: row.phase ?? null,
        objet_id: row.objet_id ?? null,
        details: row.details,
      };
    },
  });
}
