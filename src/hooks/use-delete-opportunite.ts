/**
 * v0.28.1 — Hook suppression opportunité (Kanban + Tableur).
 *
 * Effectue un DELETE sur `affaires`. Le trigger BDD bloque les opportunités
 * signées/terminées et le RLS limite à chef/admin. Sur erreur trigger,
 * on retourne un message FR clair.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DeleteResult {
  ok: boolean;
  error?: string;
}

export function useDeleteOpportunite() {
  const [pending, setPending] = useState(false);

  async function remove(affaireId: string): Promise<DeleteResult> {
    setPending(true);
    try {
      const { error } = await supabase.from("affaires").delete().eq("id", affaireId);
      if (error) {
        const msg = error.message || "";
        if (msg.includes("Impossible de supprimer une opportunité")) {
          // Message FR du trigger — déjà actionnable
          return { ok: false, error: msg };
        }
        if (msg.toLowerCase().includes("violates row-level security")) {
          return {
            ok: false,
            error: "Vous n'avez pas les droits pour supprimer cette opportunité.",
          };
        }
        return { ok: false, error: msg || "Suppression impossible." };
      }
      return { ok: true };
    } finally {
      setPending(false);
    }
  }

  return { remove, pending };
}
