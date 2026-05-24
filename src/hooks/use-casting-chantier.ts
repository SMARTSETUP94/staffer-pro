/**
 * Sprint B / B2 — useCastingChantier
 *
 * Hook React Query qui appelle getCastingChantier (serverFn) et expose le
 * casting (équipe niveau 2) d'une affaire, groupé par phase.
 *
 * Gating : le composant appelant doit lui-même gérer le feature flag
 * `equipes_3_niveaux_lecture` via useFeatureFlag.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getCastingChantier,
  type CastingChantierData,
} from "@/server/casting-chantier.functions";

export function useCastingChantier(affaireId: string | null | undefined) {
  const fn = useServerFn(getCastingChantier);
  return useQuery<CastingChantierData>({
    queryKey: ["casting-chantier", affaireId],
    enabled: !!affaireId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    queryFn: () => fn({ data: { affaireId: affaireId! } }),
  });
}
