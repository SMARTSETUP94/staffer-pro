/**
 * Bloc 10.3 — Fiche opportunité enrichie.
 *
 * Server functions pour la route `/opportunites/$affaireId`.
 * - `getOpportuniteFiche` : agrège affaire + jalons + actions + équipe + devis + commentaires
 * - `updateOpportuniteFields` : patch partiel champs commerciaux (brief)
 * - `addOpportuniteAction` : INSERT timeline d'actions
 * - `updateJalonStatus` : MAJ statut d'un jalon (date_atteinte / date_prevue)
 *
 * Sécurité : `requireSupabaseAuth` ; RLS Supabase applique le scope (admin = tout,
 * chargé d'affaires = ses propres opps via `charge_affaires_id`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OPP_ACTION_TYPES = [
  "email_envoye",
  "email_recu",
  "rdv_planifie",
  "rdv_realise",
  "relance_tel",
  "relance_email",
  "note_interne",
  "devis_envoye",
  "echantillon_presente",
  "autre",
] as const;
export type OppActionType = (typeof OPP_ACTION_TYPES)[number];

const OPP_JALON_ETAPES = [
  "qualification",
  "devis_envoye",
  "negociation",
  "signature",
] as const;
export type OppJalonEtape = (typeof OPP_JALON_ETAPES)[number];

export interface OppAction {
  id: string;
  affaire_id: string;
  type: OppActionType;
  date: string;
  auteur_id: string | null;
  auteur_nom: string | null;
  texte: string;
  prochaine_action_due_le: string | null;
  created_at: string;
}

export interface OppJalon {
  id: string;
  affaire_id: string;
  etape: OppJalonEtape;
  date_prevue: string | null;
  date_atteinte: string | null;
  ordre: number;
  notes: string | null;
}

export interface OppDevisBrief {
  id: string;
  numero: string;
  libelle: string | null;
  statut: string;
  montant_ht: number | null;
  date_signature: string | null;
  updated_at: string;
}

export interface OppEquipeMembre {
  id: string;
  employe_id: string;
  nom: string;
  prenom: string;
  role_terrain: string | null;
  added_at: string;
}

export interface OppCommentaire {
  id: string;
  body: string;
  author_id: string;
  author_nom: string | null;
  created_at: string;
}

export interface OpportuniteFicheData {
  affaire: {
    id: string;
    numero: string;
    code_opportunite: string | null;
    nom: string;
    client: string | null;
    lieu: string | null;
    notes: string | null;
    phase: string;
    statut_opportunite: string | null;
    taille: string | null;
    typologie_future: string | null;
    date_opportunite: string | null;
    date_pat: string | null;
    date_evenement_debut: string | null;
    date_evenement_fin: string | null;
    charge_affaires_id: string | null;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
  };
  jalons: OppJalon[];
  actions: OppAction[];
  equipe: OppEquipeMembre[];
  devis: OppDevisBrief[];
  commentaires: OppCommentaire[];
}

export const getOpportuniteFiche = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { affaireId: string }) =>
    z.object({ affaireId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { affaireId } = data;

    const [
      affaireRes,
      jalonsRes,
      actionsRes,
      equipeRes,
      devisRes,
      commentairesRes,
    ] = await Promise.all([
      supabase
        .from("affaires")
        .select(
          "id, numero, code_opportunite, nom, client, lieu, notes, phase, statut_opportunite, taille, typologie_future, date_opportunite, date_pat, date_evenement_debut, date_evenement_fin, charge_affaires_id, archived_at, created_at, updated_at",
        )
        .eq("id", affaireId)
        .maybeSingle(),
      supabase
        .from("opportunite_jalons")
        .select("*")
        .eq("affaire_id", affaireId)
        .order("ordre", { ascending: true }),
      supabase
        .from("opportunite_actions")
        .select(
          "id, affaire_id, type, date, auteur_id, texte, prochaine_action_due_le, created_at",
        )
        .eq("affaire_id", affaireId)
        .order("date", { ascending: false })
        .limit(30),
      supabase
        .from("affaire_equipe")
        .select(
          "id, employe_id, role_terrain, added_at, employes(nom, prenom)",
        )
        .eq("affaire_id", affaireId)
        .eq("phase", "commercial_etude")
        .is("removed_at", null),
      supabase
        .from("devis")
        .select(
          "id, numero, libelle, statut, montant_ht, date_signature, updated_at",
        )
        .eq("affaire_id", affaireId)
        .eq("archive", false)
        .order("updated_at", { ascending: false }),
      supabase
        .from("affaire_commentaires")
        .select("id, body, author_id, created_at")
        .eq("affaire_id", affaireId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (affaireRes.error) throw new Error(affaireRes.error.message);
    if (!affaireRes.data) throw new Error("Opportunité introuvable");

    // Résolution des noms d'auteurs (actions + commentaires) en un seul fetch
    const authorIds = new Set<string>();
    (actionsRes.data ?? []).forEach((a) => a.auteur_id && authorIds.add(a.auteur_id));
    (commentairesRes.data ?? []).forEach((c) => c.author_id && authorIds.add(c.author_id));
    const authorMap = new Map<string, string>();
    if (authorIds.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", Array.from(authorIds));
      (profs ?? []).forEach((p) => {
        const full = (p as { full_name?: string | null }).full_name;
        const email = (p as { email?: string | null }).email;
        authorMap.set(p.id as string, full ?? email ?? "");
      });
    }

    const equipe: OppEquipeMembre[] = (equipeRes.data ?? []).map((m) => {
      const emp = (m as { employes: { nom: string; prenom: string } | null }).employes;
      return {
        id: m.id as string,
        employe_id: m.employe_id as string,
        nom: emp?.nom ?? "",
        prenom: emp?.prenom ?? "",
        role_terrain: (m.role_terrain as string | null) ?? null,
        added_at: m.added_at as string,
      };
    });

    return {
      affaire: affaireRes.data,
      jalons: (jalonsRes.data ?? []) as OppJalon[],
      actions: (actionsRes.data ?? []).map((a) => ({
        ...a,
        auteur_nom: a.auteur_id ? authorMap.get(a.auteur_id) ?? null : null,
      })) as OppAction[],
      equipe,
      devis: (devisRes.data ?? []) as OppDevisBrief[],
      commentaires: (commentairesRes.data ?? []).map((c) => ({
        ...c,
        author_nom: authorMap.get(c.author_id as string) ?? null,
      })) as OppCommentaire[],
    } as OpportuniteFicheData;
  });

export const UPDATE_FIELDS_SCHEMA = z.object({
  nom: z.string().min(1).max(255).optional(),
  client: z.string().max(255).nullable().optional(),
  lieu: z.string().max(255).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  typologie_future: z.string().max(50).nullable().optional(),
  taille: z.enum(["tres_petit", "petit", "moyen", "gros", "tres_gros"]).nullable().optional(),
  date_pat: z.string().nullable().optional(),
  date_evenement_debut: z.string().nullable().optional(),
  date_evenement_fin: z.string().nullable().optional(),
  charge_affaires_id: z.string().uuid().nullable().optional(),
});
export const UPDATE_FIELDS_INPUT_SCHEMA = z.object({
  affaireId: z.string().uuid(),
  patch: UPDATE_FIELDS_SCHEMA,
});
const UPDATE_FIELDS = UPDATE_FIELDS_SCHEMA;

export const updateOpportuniteFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { affaireId: string; patch: z.infer<typeof UPDATE_FIELDS> }) =>
    z.object({ affaireId: z.string().uuid(), patch: UPDATE_FIELDS }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("affaires")
      .update(data.patch)
      .eq("id", data.affaireId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const ADD_ACTION_SCHEMA = z.object({
  affaireId: z.string().uuid(),
  type: z.enum(OPP_ACTION_TYPES),
  texte: z.string().min(1).max(2000),
  date: z.string().optional(),
  prochaine_action_due_le: z.string().nullable().optional(),
});
const ADD_ACTION = ADD_ACTION_SCHEMA;

export const addOpportuniteAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof ADD_ACTION>) => ADD_ACTION.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      affaire_id: data.affaireId,
      type: data.type,
      texte: data.texte,
      auteur_id: userId,
      date: data.date ?? new Date().toISOString(),
      prochaine_action_due_le: data.prochaine_action_due_le ?? null,
    };
    const { data: row, error } = await supabase
      .from("opportunite_actions")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const UPDATE_JALON_SCHEMA = z.object({
  affaireId: z.string().uuid(),
  etape: z.enum(OPP_JALON_ETAPES),
  date_prevue: z.string().nullable().optional(),
  date_atteinte: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
const UPDATE_JALON = UPDATE_JALON_SCHEMA;

export const updateJalonStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof UPDATE_JALON>) => UPDATE_JALON.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: {
      date_prevue?: string | null;
      date_atteinte?: string | null;
      notes?: string | null;
    } = {};
    if (data.date_prevue !== undefined) patch.date_prevue = data.date_prevue;
    if (data.date_atteinte !== undefined) patch.date_atteinte = data.date_atteinte;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await supabase
      .from("opportunite_jalons")
      .update(patch)
      .eq("affaire_id", data.affaireId)
      .eq("etape", data.etape);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
