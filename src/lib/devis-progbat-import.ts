/**
 * v0.23 Bloc 3 — Import bulk d'objets fabrication depuis un ParseResult Progbat.
 *
 * v0.39.0a-hotfix-import : passe par le RPC transactionnel `import_progbat_atomique`
 * pour éviter toute fuite d'orphelins en cas d'erreur partielle.
 * Avant : INSERT direct sans transaction → orphelins possibles si UPDATE échoue.
 * Maintenant : tout-ou-rien (ROLLBACK PL/pgSQL automatique sur erreur).
 */
import { supabase } from "@/integrations/supabase/client";
import type { ApplicabilityFlags, HeuresParMetier, TypeFinition } from "./devis-parser/compute-flags";

export interface ObjetToImport {
  nom: string;
  reference: string;
  quantite: number;
  heures: HeuresParMetier;
  budgetMateriaux: number;
  typeFinition: TypeFinition;
  flags: ApplicabilityFlags;
  devisId: string | null;
}

export interface ImportProgbatPayload {
  affaireId: string;
  objets: ObjetToImport[];
  /** null = ne pas écraser. number = écrire sur l'affaire. */
  heuresMontage: number | null;
  heuresDemontage: number | null;
}

export interface ImportProgbatConflict {
  reference: string;
  existing_id: string;
  nom: string;
}

export interface ImportProgbatResult {
  insertedObjets: number;
  conflicts: ImportProgbatConflict[];
}

export class ImportProgbatConflictError extends Error {
  conflicts: ImportProgbatConflict[];
  constructor(conflicts: ImportProgbatConflict[]) {
    const refs = conflicts.map((c) => c.reference).join(", ");
    super(`Références déjà existantes sur l'affaire : ${refs}`);
    this.name = "ImportProgbatConflictError";
    this.conflicts = conflicts;
  }
}

export async function importProgbatToAffaire(
  payload: ImportProgbatPayload,
): Promise<ImportProgbatResult> {
  const { affaireId, objets, heuresMontage, heuresDemontage } = payload;

  const objetsPayload = objets.map((o, idx) => ({
    devis_id: o.devisId,
    reference: o.reference || `OBJ-${idx + 1}`,
    nom: o.nom,
    quantite: o.quantite,
    heures_prevues_be: o.heures.be,
    heures_prevues_numerique: o.heures.numerique,
    heures_prevues_bois: o.heures.bois,
    heures_prevues_metal: o.heures.metal,
    heures_prevues_peinture: o.heures.peinture,
    heures_prevues_tapisserie: o.heures.tapisserie,
    heures_prevues_manutention: o.heures.manutention,
    budget_materiaux: o.budgetMateriaux,
    type_finition: o.typeFinition,
    a_dessiner: o.flags.a_dessiner,
    a_usiner: o.flags.a_usiner,
    a_construire: o.flags.a_construire,
    est_brut: o.flags.est_brut,
    a_emballer: o.flags.a_emballer,
  }));

  const { data, error } = await supabase.rpc("import_progbat_atomique", {
    p_affaire_id: affaireId,
    p_objets: objetsPayload,
    p_heures_montage: heuresMontage ?? undefined,
    p_heures_demontage: heuresDemontage ?? undefined,
  });

  if (error) {
    // Détecte le RAISE EXCEPTION 'CONFLICT_REFERENCE: [...]'
    const msg = error.message || "";
    const match = msg.match(/CONFLICT_REFERENCE:\s*(\[.*\])/);
    if (match) {
      try {
        const conflicts = JSON.parse(match[1]) as ImportProgbatConflict[];
        throw new ImportProgbatConflictError(conflicts);
      } catch (parseErr) {
        if (parseErr instanceof ImportProgbatConflictError) throw parseErr;
        // Fallback : on relance l'erreur d'origine
      }
    }
    throw new Error(`Erreur import Progbat : ${error.message}`);
  }

  const result = data as unknown as { inserted_objets: number; conflicts: ImportProgbatConflict[] };
  return {
    insertedObjets: result?.inserted_objets ?? 0,
    conflicts: result?.conflicts ?? [],
  };
}
