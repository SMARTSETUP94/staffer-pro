import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { OpportuniteStatut, OpportuniteTaille } from "@/lib/opportunites";
import { isValidCode9XXX } from "@/lib/opportunites-tableur-helpers";

/**
 * v0.28.0 — Hook upsert opportunité (création + édition champ par champ).
 *
 * - Si pas d'affaireId : appelle RPC `create_opportunite` (équivalent NouvelleOpportuniteDialog).
 *   Requiert : code (9XXX valide), client, charge_affaires_id.
 * - Sinon : update partiel `affaires` sur les champs fournis.
 */

export interface UpsertPatch {
  numero?: string;
  client?: string;
  nom?: string;
  charge_affaires_id?: string | null;
  date_opportunite?: string | null;
  taille?: OpportuniteTaille | null;
  statut_opportunite?: OpportuniteStatut | null;
  date_pat?: string | null;
  date_montage?: string | null;
  date_demontage?: string | null;
  notes?: string | null;
}

export interface CreateInput {
  code: string;
  client: string;
  nom?: string;
  charge_affaires_id: string;
  date_opportunite: string;
  taille?: OpportuniteTaille | null;
  notes?: string | null;
}

export type UpsertResult =
  | { kind: "created"; affaireId: string; numero: string }
  | { kind: "updated"; affaireId: string }
  | { kind: "error"; message: string }
  | { kind: "incomplete" };

export function useUpsertOpportunite() {
  const create = useCallback(async (input: CreateInput): Promise<UpsertResult> => {
    if (!isValidCode9XXX(input.code))
      return { kind: "error", message: "Code 9XXX invalide" };
    if (!input.client.trim())
      return { kind: "incomplete" };
    if (!input.charge_affaires_id)
      return { kind: "incomplete" };

    const { data, error } = await supabase.rpc("create_opportunite", {
      _client: input.client.trim(),
      _nom: (input.nom?.trim() || input.client.trim()),
      _code: input.code.trim(),
      _charge_affaires_id: input.charge_affaires_id,
      _taille: input.taille ?? "petit",
      _date_opportunite: input.date_opportunite,
      _commentaires: input.notes?.trim() || undefined,
    });
    if (error) return { kind: "error", message: error.message };
    const affaireId = typeof data === "string" ? data : (data as { id?: string } | null)?.id;
    if (!affaireId) return { kind: "error", message: "ID affaire manquant après création" };
    return { kind: "created", affaireId, numero: input.code };
  }, []);

  const update = useCallback(
    async (affaireId: string, patch: UpsertPatch): Promise<UpsertResult> => {
      const { error } = await supabase
        .from("affaires")
        .update(patch)
        .eq("id", affaireId);
      if (error) return { kind: "error", message: error.message };
      return { kind: "updated", affaireId };
    },
    [],
  );

  return { create, update };
}
