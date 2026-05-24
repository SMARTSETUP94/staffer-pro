/**
 * Sprint B / B2 — getCastingChantier
 *
 * Lecture du "Casting du chantier" niveau 2 (affaire_equipe).
 * Retourne les membres par phase pour une affaire donnée.
 *
 * Phases attendues : 'commercial_etude', 'fabrication', 'montage', 'demontage'.
 *
 * RLS : la table affaire_equipe a ses propres policies — lecture via auth.uid()
 * de l'utilisateur courant (le client supabase venant du middleware utilise la
 * publishable key + bearer token utilisateur, donc RLS s'applique normalement).
 * La RPC SECURITY DEFINER sync_equipes_from_plan ne bypass RLS que pour les
 * writes effectués DANS la transaction de publication.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CastingPhase =
  | "commercial_etude"
  | "fabrication"
  | "montage"
  | "demontage";

export interface CastingMembre {
  id: string;
  employe_id: string;
  nom: string;
  prenom: string;
  role_terrain: string | null;
  notes: string | null;
  added_at: string;
}

export interface CastingChantierData {
  affaire_id: string;
  phases: Record<CastingPhase, CastingMembre[]>;
  total: number;
}

const EMPTY_PHASES = (): Record<CastingPhase, CastingMembre[]> => ({
  commercial_etude: [],
  fabrication: [],
  montage: [],
  demontage: [],
});

export const getCastingChantier = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { affaireId: string }) =>
    z.object({ affaireId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CastingChantierData> => {
    const { supabase } = context;

    const { data: rows, error } = await supabase
      .from("affaire_equipe")
      .select(
        "id, employe_id, phase, role_terrain, notes, added_at, employes!inner(nom, prenom)",
      )
      .eq("affaire_id", data.affaireId)
      .is("removed_at", null)
      .order("added_at", { ascending: true });

    if (error) throw new Error(error.message);

    const phases = EMPTY_PHASES();
    let total = 0;

    for (const r of rows ?? []) {
      const ph = r.phase as CastingPhase;
      if (!(ph in phases)) continue;
      const emp = (r as { employes: { nom: string; prenom: string } | null }).employes;
      phases[ph].push({
        id: r.id,
        employe_id: r.employe_id,
        nom: emp?.nom ?? "",
        prenom: emp?.prenom ?? "",
        role_terrain: r.role_terrain,
        notes: r.notes,
        added_at: r.added_at,
      });
      total += 1;
    }

    return { affaire_id: data.affaireId, phases, total };
  });
