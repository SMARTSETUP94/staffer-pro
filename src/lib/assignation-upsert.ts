/**
 * Source unique d'écriture dans `public.assignations`.
 *
 * Tous les chemins de staffing manuel (popup planning, bulk multi-cellules,
 * Par chantier, drag-to-duplicate, édition cellule objet…) doivent passer
 * par ces helpers afin de garantir :
 *  - audit `created_by = auth.uid()` posé sur CHAQUE création
 *  - `created_by` jamais réécrit en update (immuable après création)
 *  - une seule formule à toucher si on ajoute un nouveau champ commun
 *
 * Le helper miroir côté heures est `src/lib/heures-upsert.ts`. Garde-fou
 * Vitest : `src/lib/__tests__/assignation-source-unique-guard.test.ts`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type AssignationInsert = Tables["assignations"]["Insert"];
export type AssignationUpdate = Tables["assignations"]["Update"];

/** Insert client : on accepte tous les champs SAUF `created_by` (injecté ici). */
export type AssignationInsertInput = Omit<AssignationInsert, "created_by">;

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Insère UNE assignation et retourne son id.
 * `created_by` est posé automatiquement (= auth user courant).
 */
export async function insertAssignation(row: AssignationInsertInput) {
  const userId = await getCurrentUserId();
  return supabase
    .from("assignations")
    .insert({ ...row, created_by: userId } as AssignationInsert)
    .select("id")
    .single();
}

/**
 * Insère un LOT d'assignations.
 * Chaque ligne reçoit `created_by` = auth user courant.
 */
export async function insertAssignationsBatch(rows: AssignationInsertInput[]) {
  if (rows.length === 0) {
    return { error: null, data: [] as { id: string }[] };
  }
  const userId = await getCurrentUserId();
  const stamped = rows.map((r) => ({ ...r, created_by: userId })) as AssignationInsert[];
  return supabase.from("assignations").insert(stamped);
}

/**
 * Met à jour une assignation existante par id.
 * Strip défensif : on n'autorise pas la réécriture de `created_by`.
 */
export async function updateAssignation(id: string, patch: AssignationUpdate) {
  const { created_by: _drop, ...safe } = patch as AssignationUpdate & {
    created_by?: unknown;
  };
  return supabase.from("assignations").update(safe).eq("id", id);
}

/**
 * Met à jour un lot d'assignations via WHERE id IN (...).
 * Utilisé pour déplacements drag-and-drop, changements de slot en masse…
 */
export async function updateAssignationsByIds(ids: string[], patch: AssignationUpdate) {
  if (ids.length === 0) return { error: null, data: null };
  const { created_by: _drop, ...safe } = patch as AssignationUpdate & {
    created_by?: unknown;
  };
  return supabase.from("assignations").update(safe).in("id", ids);
}
