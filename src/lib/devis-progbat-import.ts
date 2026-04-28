/**
 * v0.23 Bloc 3 — Import bulk d'objets fabrication depuis un ParseResult Progbat.
 *
 * Insère les ObjetCandidat sélectionnés dans `fabrication_objets` (le trigger
 * `create_fabrication_etapes_for_objet` v0.22 crée automatiquement les 5 étapes).
 * Met à jour `affaires.heures_prevues_montage` / `heures_prevues_demontage` si
 * les checkbox correspondantes sont cochées.
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

export interface ImportProgbatResult {
  insertedObjets: number;
}

export async function importProgbatToAffaire(
  payload: ImportProgbatPayload,
): Promise<ImportProgbatResult> {
  const { affaireId, objets, heuresMontage, heuresDemontage } = payload;

  // 1. Bulk insert objets fabrication
  let insertedObjets = 0;
  if (objets.length > 0) {
    const rows = objets.map((o, idx) => ({
      affaire_id: affaireId,
      devis_id: o.devisId,
      reference: o.reference || `OBJ-${idx + 1}`,
      nom: o.nom,
      quantite: o.quantite,
      ordre: idx,
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
    const { error } = await supabase.from("fabrication_objets").insert(rows);
    if (error) throw new Error(`Erreur insert objets : ${error.message}`);
    insertedObjets = rows.length;
  }

  // 2. UPDATE affaire heures chantier (uniquement si cochés)
  if (heuresMontage !== null || heuresDemontage !== null) {
    const updates: { heures_prevues_montage?: number; heures_prevues_demontage?: number } = {};
    if (heuresMontage !== null) updates.heures_prevues_montage = heuresMontage;
    if (heuresDemontage !== null) updates.heures_prevues_demontage = heuresDemontage;
    const { error } = await supabase.from("affaires").update(updates).eq("id", affaireId);
    if (error) throw new Error(`Erreur update affaire : ${error.message}`);
  }

  return { insertedObjets };
}
