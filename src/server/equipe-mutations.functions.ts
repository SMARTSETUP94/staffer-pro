/**
 * Sprint C / C1 — Mutations CRUD équipes 3 niveaux (édition manuelle Casting).
 *
 * 4 server functions :
 *   - upsertAffaireEquipeMember     (N2 : affaire_equipe)
 *   - removeAffaireEquipeMember     (N2, avec cascade L3 optionnelle)
 *   - upsertObjetEquipeMember       (N3 : fabrication_objet_equipe)
 *   - removeObjetEquipeMember       (N3)
 *
 * Décisions tranchées :
 *   D1 — pas d'auto-propagation L2 → L3 sur upsert (laisse vide).
 *   D2 — retrait L2 propose cascade L3 explicite (paramètre cascadeObjets).
 *   D3 — notes / role_terrain : champs texte libres (max 200 chars), édités
 *        dans la même mutation upsert.
 *
 * Sécurité : capability check serveur (`affaire.team.manage` pour L2,
 * `objet.team.manage` pour L3) via `current_user_has_capability`. RLS prend
 * le relais ensuite (le client authentifié est utilisé pour les écritures).
 *
 * Idempotent : upsert sur (affaire_id, employe_id, phase) ou (objet_id, employe_id),
 * réactive un removed_at NULL si la ligne existait en soft-delete.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  upsertAffaireEquipeSchema,
  removeAffaireEquipeSchema,
  upsertObjetEquipeSchema,
  removeObjetEquipeSchema,
} from "@/lib/equipe-mutations-schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaCtx = any;

async function assertCap(supabase: SupaCtx, cap: string) {
  const { data, error } = await supabase.rpc("current_user_has_capability", {
    _cap_key: cap,
  });
  if (error) throw new Error(`cap check failed: ${error.message}`);
  if (!data) throw new Error(`Accès refusé : capability ${cap} requise`);
}

/* ──────────────────────────────────────────────────────────────────── */
/* N2 — upsertAffaireEquipeMember                                       */
/* ──────────────────────────────────────────────────────────────────── */
export const upsertAffaireEquipeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    affaireId: string;
    employeId: string;
    phase: "commercial_etude" | "fabrication" | "montage" | "demontage";
    roleTerrain?: string | null;
    notes?: string | null;
  }) => upsertAffaireEquipeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCap(supabase, "affaire.team.manage");

    const { data: row, error } = await supabase
      .from("affaire_equipe")
      .upsert(
        {
          affaire_id: data.affaireId,
          employe_id: data.employeId,
          phase: data.phase,
          role_terrain: data.roleTerrain ?? null,
          notes: data.notes ?? null,
          added_by: userId,
          removed_at: null,
          removed_by: null,
        },
        { onConflict: "affaire_id,employe_id,phase" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row?.id as string };
  });

/* ──────────────────────────────────────────────────────────────────── */
/* N2 — removeAffaireEquipeMember (cascade L3 optionnelle)              */
/* ──────────────────────────────────────────────────────────────────── */
export const removeAffaireEquipeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    affaireId: string;
    employeId: string;
    phase: "commercial_etude" | "fabrication" | "montage" | "demontage";
    cascadeObjets?: boolean;
  }) => removeAffaireEquipeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCap(supabase, "affaire.team.manage");

    // Soft delete N2
    const { error: n2Err } = await supabase
      .from("affaire_equipe")
      .update({ removed_at: new Date().toISOString(), removed_by: userId })
      .eq("affaire_id", data.affaireId)
      .eq("employe_id", data.employeId)
      .eq("phase", data.phase)
      .is("removed_at", null);
    if (n2Err) throw new Error(n2Err.message);

    let cascaded = 0;
    if (data.cascadeObjets) {
      // Récupère tous les objets de l'affaire
      const { data: objs } = await supabase
        .from("fabrication_objets")
        .select("id")
        .eq("affaire_id", data.affaireId);
      const objetIds = (objs ?? []).map((o) => o.id as string);
      if (objetIds.length > 0) {
        const { data: removed, error: n3Err } = await supabase
          .from("fabrication_objet_equipe")
          .update({ removed_at: new Date().toISOString(), removed_by: userId })
          .eq("employe_id", data.employeId)
          .in("objet_id", objetIds)
          .is("removed_at", null)
          .select("id");
        if (n3Err) throw new Error(n3Err.message);
        cascaded = removed?.length ?? 0;
      }
    }

    return { ok: true, cascaded_n3: cascaded };
  });

/* ──────────────────────────────────────────────────────────────────── */
/* N3 — upsertObjetEquipeMember                                          */
/* ──────────────────────────────────────────────────────────────────── */
export const upsertObjetEquipeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { objetId: string; employeId: string; notes?: string | null }) =>
    z
      .object({
        objetId: z.string().uuid(),
        employeId: z.string().uuid(),
        notes: NOTES,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCap(supabase, "objet.team.manage");

    // Pré-requis du trigger enforce_objet_equipe_strict : la personne
    // doit être en N2 fabrication. On garantit cela ici (cohérent avec
    // sync_equipes_from_plan v2 N2-bis).
    const { data: obj, error: objErr } = await supabase
      .from("fabrication_objets")
      .select("affaire_id")
      .eq("id", data.objetId)
      .single();
    if (objErr || !obj) throw new Error(objErr?.message ?? "Objet introuvable");

    const { error: n2Err } = await supabase
      .from("affaire_equipe")
      .upsert(
        {
          affaire_id: obj.affaire_id as string,
          employe_id: data.employeId,
          phase: "fabrication",
          added_by: userId,
          removed_at: null,
          removed_by: null,
        },
        { onConflict: "affaire_id,employe_id,phase" },
      );
    if (n2Err) throw new Error(`N2 prereq: ${n2Err.message}`);

    const { data: row, error } = await supabase
      .from("fabrication_objet_equipe")
      .upsert(
        {
          objet_id: data.objetId,
          employe_id: data.employeId,
          notes: data.notes ?? null,
          added_by: userId,
          removed_at: null,
          removed_by: null,
        },
        { onConflict: "objet_id,employe_id" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row?.id as string };
  });

/* ──────────────────────────────────────────────────────────────────── */
/* N3 — removeObjetEquipeMember                                          */
/* ──────────────────────────────────────────────────────────────────── */
export const removeObjetEquipeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { objetId: string; employeId: string }) =>
    z
      .object({
        objetId: z.string().uuid(),
        employeId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCap(supabase, "objet.team.manage");

    const { data: removed, error } = await supabase
      .from("fabrication_objet_equipe")
      .update({ removed_at: new Date().toISOString(), removed_by: userId })
      .eq("objet_id", data.objetId)
      .eq("employe_id", data.employeId)
      .is("removed_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return { ok: true, deleted: removed?.length ?? 0 };
  });

/* ──────────────────────────────────────────────────────────────────── */
/* Helper : liste des employés actifs (pour picker)                      */
/* ──────────────────────────────────────────────────────────────────── */
export const listAllActiveEmployes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("employes")
      .select("id, nom, prenom, type_contrat, metier_principal_id")
      .eq("actif", true)
      .eq("non_staffing", false)
      .order("nom", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((e) => ({
      id: e.id as string,
      nom: e.nom as string,
      prenom: e.prenom as string,
      type_contrat: (e.type_contrat as string) ?? "CDI",
      metier_principal_id: (e.metier_principal_id as number) ?? null,
    }));
  });
