/**
 * v0.29.0 — Hook mutation : INSERT bulk d'assignations + liaison à un objet.
 *
 * Crée N assignations en une fois (1 INSERT batch) puis insère les liens
 * `assignation_objets` correspondants. Si la 2ᵉ étape échoue, on rollback
 * les assignations créées.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { insertAssignationsBatch } from "@/lib/assignation-upsert";
import type { Slot } from "@/lib/bulk-staffer";

export interface BulkObjetAssignPayload {
  affaireId: string;
  objetId: string;
  metierId: number;
  slot: Slot;
  heuresParJour: number;
  cells: Array<{ employe_id: string; date: string }>;
}

export interface BulkObjetAssignResult {
  created: number;
  skipped: number;
}

export function useBulkAssignObjet() {
  const qc = useQueryClient();
  return useMutation<BulkObjetAssignResult, Error, BulkObjetAssignPayload>({
    mutationFn: async (payload) => {
      const { affaireId, objetId, metierId, slot, heuresParJour, cells } = payload;
      if (cells.length === 0) {
        return { created: 0, skipped: 0 };
      }

      const rows = cells.map((c) => ({
        employe_id: c.employe_id,
        affaire_id: affaireId,
        date: c.date,
        metier_id: metierId,
        demi_journee: slot,
        heures: heuresParJour,
      }));

      const { data: inserted, error: errIns } = await insertAssignationsBatch(rows);
      if (errIns) throw new Error(errIns.message);
      const insertedIds = (inserted ?? []).map((r) => r.id);

      if (insertedIds.length === 0) {
        return { created: 0, skipped: cells.length };
      }

      // Liens assignation_objets
      const links = insertedIds.map((aid) => ({
        assignation_id: aid,
        objet_id: objetId,
      }));
      const { error: errLinks } = await supabase
        .from("assignation_objets")
        .insert(links);
      if (errLinks) {
        // rollback : supprime les assignations créées
        await supabase.from("assignations").delete().in("id", insertedIds);
        throw new Error(`Liaison objet échouée : ${errLinks.message}`);
      }

      return {
        created: insertedIds.length,
        skipped: cells.length - insertedIds.length,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning"] });
      qc.invalidateQueries({ queryKey: ["assignations"] });
      qc.invalidateQueries({ queryKey: ["fabrication"] });
    },
  });
}
