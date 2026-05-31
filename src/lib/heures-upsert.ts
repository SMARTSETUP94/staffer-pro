/**
 * v0.52 — Helper unifié d'upsert dans `heures_saisies`.
 *
 * SOURCE UNIQUE pour les 4 surfaces de saisie (MesHeuresGrid,
 * SaisirPourEmployeDialog, BulkSaisieDialog, /missions/$affaireId/$phase).
 * Toute évolution de schéma ou de règle métier sur la saisie d'heures DOIT
 * passer par ce module afin d'éviter la divergence entre surfaces.
 *
 * Voir mem://constraints/heures-saisie-source-unique pour la garde-fou.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/integrations/supabase/client";

export type HeuresStatut = "brouillon" | "soumis" | "valide" | "rejete";

export interface HeuresUpsertInput {
  employe_id: string;
  date: string; // yyyy-MM-dd
  affaire_id: string;
  heure_debut?: string | null;
  heure_fin?: string | null;
  duree_pause_minutes?: number | null;
  heures_reelles: number;
  heures_nuit?: number | null;
  commentaire?: string | null;
  etape_chantier?: string | null;
  fabrication_objet_id?: string | null;
  fabrication_etape_type?: string | null;
  phase_montage_demontage?: string | null;
  assignation_id?: string | null;
  metier_id?: number | null;
  statut: HeuresStatut;
  /** Renseigné par l'appelant si statut = 'valide' (chef/admin). */
  valide_par?: string | null;
  /** Renseigné par l'appelant si saisie soumise par l'employé lui-même. */
  saisi_par?: string | null;
  saisi_par_chef?: boolean | null;
}

/**
 * Construit le payload normalisé pour `heures_saisies`. Garantit que TOUS
 * les champs sont alimentés (ou explicitement `null`) pour éviter qu'une
 * surface oublie un champ silencieusement.
 */
export function buildHeuresSaisiePayload(input: HeuresUpsertInput): Record<string, unknown> {
  const isValide = input.statut === "valide";
  const payload: Record<string, unknown> = {
    employe_id: input.employe_id,
    date: input.date,
    affaire_id: input.affaire_id,
    heure_debut: input.heure_debut ?? null,
    heure_fin: input.heure_fin ?? null,
    duree_pause_minutes: input.duree_pause_minutes ?? 0,
    heures_reelles: input.heures_reelles,
    heures_nuit: input.heures_nuit ?? 0,
    commentaire: input.commentaire ?? null,
    etape_chantier: input.etape_chantier ?? null,
    fabrication_objet_id: input.fabrication_objet_id ?? null,
    fabrication_etape_type: input.fabrication_etape_type ?? null,
    statut: input.statut,
  };
  // Champs optionnels remontés seulement s'ils ont une valeur définie
  if (input.phase_montage_demontage !== undefined) {
    payload.phase_montage_demontage = input.phase_montage_demontage;
  }
  if (input.assignation_id !== undefined) payload.assignation_id = input.assignation_id;
  if (input.metier_id !== undefined) payload.metier_id = input.metier_id;
  if (input.saisi_par !== undefined) payload.saisi_par = input.saisi_par;
  if (input.saisi_par_chef !== undefined) payload.saisi_par_chef = input.saisi_par_chef;
  if (isValide) {
    payload.valide_par = input.valide_par ?? null;
    payload.valide_le = new Date().toISOString();
  }
  return payload;
}

type AnyClient = SupabaseClient<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface UpsertOptions {
  /**
   * Si fourni, court-circuite la recherche par (employe,date,affaire).
   * `null` force un INSERT, un UUID force un UPDATE sur cette ligne.
   */
  existingId?: string | null;
  /** Colonnes à retourner après l'upsert (default `*`). */
  selectColumns?: string;
}

/**
 * UPSERT principal : cherche une ligne (employe_id, date, affaire_id) si
 * `existingId` n'est pas fourni, puis UPDATE ou INSERT en conséquence.
 *
 * Retourne `{ data, error }` à la Supabase pour rester drop-in.
 */
export async function upsertHeuresSaisie(
  client: AnyClient,
  input: HeuresUpsertInput,
  opts: UpsertOptions = {},
) {
  const select = opts.selectColumns ?? "*";
  let existingId = opts.existingId;
  if (existingId === undefined) {
    const { data, error } = await client
      .from("heures_saisies")
      .select("id")
      .eq("employe_id", input.employe_id)
      .eq("date", input.date)
      .eq("affaire_id", input.affaire_id)
      .maybeSingle();
    if (error) return { data: null, error };
    existingId = (data as { id: string } | null)?.id ?? null;
  }
  const payload = buildHeuresSaisiePayload(input);
  if (existingId) {
    return client
      .from("heures_saisies")
      .update(payload)
      .eq("id", existingId)
      .select(select)
      .maybeSingle();
  }
  return client.from("heures_saisies").insert(payload).select(select).maybeSingle();
}

/**
 * UPDATE patch ciblé sur une ligne existante (sans reconstruire le payload
 * complet). Utilisé par `useMesHeures.upsertSaisie` pour les édits partiels
 * (ex: ajout d'un commentaire) où on ne veut PAS écraser les autres colonnes.
 */
export async function patchHeuresSaisie(
  client: AnyClient,
  id: string,
  patch: Record<string, unknown>,
  opts: { selectColumns?: string } = {},
) {
  const select = opts.selectColumns ?? "*";
  return client.from("heures_saisies").update(patch).eq("id", id).select(select).maybeSingle();
}

/** INSERT direct (pour les surfaces qui savent déjà qu'aucune ligne n'existe). */
export async function insertHeuresSaisie(
  client: AnyClient,
  input: HeuresUpsertInput,
  opts: { selectColumns?: string } = {},
) {
  const select = opts.selectColumns ?? "*";
  const payload = buildHeuresSaisiePayload(input);
  return client.from("heures_saisies").insert(payload).select(select).maybeSingle();
}

/** Export du client par défaut pour les appelants qui veulent l'omettre. */
export const defaultHeuresClient = defaultClient;
