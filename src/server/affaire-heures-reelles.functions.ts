/**
 * Sprint C / A2 — Heures réelles par affaire pour l'onglet Équipe.
 *
 * Lecture agrégée de `heures_saisies` (JOIN employes) avec triplet par
 * (employé × phase × métier) :
 *   - validées  (statut = 'valide')
 *   - à valider (statut = 'soumis')
 *   - rejetées  (statut = 'rejete')
 *
 * Le statut 'brouillon' est ignoré (compte personnel non transmis).
 *
 * "phase" est dérivée de `fabrication_etape_type` quand renseignée
 * (BE / num / bois / metal / peint / tap / manut) ; sinon 'autre'.
 * Le client agrège ensuite par employé (somme tous phases/métiers) et permet
 * un filtrage UI par phase + métier.
 *
 * Sécurité : RLS s'applique via le client authentifié. Pas de bypass.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface HeuresReellesRow {
  employe_id: string;
  nom: string;
  prenom: string;
  type_contrat: string | null;
  metier_id: number | null;
  phase: string | null; // fabrication_etape_type ou null
  validees: number;
  soumises: number;
  rejetees: number;
}

export const getAffaireHeuresReelles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { affaireId: string }) =>
    z.object({ affaireId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<HeuresReellesRow[]> => {
    const { supabase } = context;

    // Lecture brute des saisies non-brouillon, JOIN employés via employe_id.
    const { data: rows, error } = await supabase
      .from("heures_saisies")
      .select(
        "employe_id, heures_reelles, statut, metier_id, fabrication_etape_type, employes:employes!heures_saisies_employe_id_fkey(id, nom, prenom, type_contrat)",
      )
      .eq("affaire_id", data.affaireId)
      .in("statut", ["valide", "soumis", "rejete"]);

    if (error) throw new Error(error.message);

    type Raw = {
      employe_id: string;
      heures_reelles: number | null;
      statut: "valide" | "soumis" | "rejete";
      metier_id: number | null;
      fabrication_etape_type: string | null;
      employes: {
        id: string;
        nom: string;
        prenom: string;
        type_contrat: string | null;
      } | null;
    };

    // Agrégation par (employe_id × phase × metier_id).
    const map = new Map<string, HeuresReellesRow>();
    for (const r of (rows ?? []) as unknown as Raw[]) {
      if (!r.employes) continue;
      const phase = r.fabrication_etape_type ?? null;
      const metierId = r.metier_id ?? null;
      const key = `${r.employe_id}::${phase ?? ""}::${metierId ?? ""}`;
      let row = map.get(key);
      if (!row) {
        row = {
          employe_id: r.employe_id,
          nom: r.employes.nom,
          prenom: r.employes.prenom,
          type_contrat: r.employes.type_contrat,
          metier_id: metierId,
          phase,
          validees: 0,
          soumises: 0,
          rejetees: 0,
        };
        map.set(key, row);
      }
      const h = Number(r.heures_reelles ?? 0);
      if (r.statut === "valide") row.validees += h;
      else if (r.statut === "soumis") row.soumises += h;
      else if (r.statut === "rejete") row.rejetees += h;
    }
    return Array.from(map.values());
  });
