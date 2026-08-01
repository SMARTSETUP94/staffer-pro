import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Journal d'un objet — lecture timeline.
 * Sprint A partiel : event_types limités (pas personne_assignee / personne_retiree /
 * presence_modifiee, alimentés en Sprint B avec affaire_equipe / objet_equipe).
 */
export const getObjetJournal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      objetId: z.string().uuid(),
      limit: z.number().min(1).max(500).default(100),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: events, error } = await supabase
      .from("objet_journal_events")
      .select("id, event_type, occurred_at, actor_id, actor_label, metier_id, etape_id, payload")
      .eq("objet_id", data.objetId)
      .order("occurred_at", { ascending: false })
      .limit(data.limit);

    if (error) throw new Error(`getObjetJournal: ${error.message}`);
    return { events: events ?? [] };
  });

/** Insertion manuelle d'un événement journal (admin/chef seulement, usage rare). */
export const logObjetJournalEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      objetId: z.string().uuid(),
      affaireId: z.string().uuid(),
      eventType: z.enum([
        "journal_started",
        "etape_validee",
        "etape_invalidee",
        "etape_statut_change",
        "photo_uploaded",
        "photo_supprimee",
        "commentaire",
        "commentaire_supprime",
        "identite_modifiee",
        "plan_republie",
      ]),
      etapeId: z.string().uuid().nullish(),
      metierId: z.number().int().nullish(),
      payload: z.record(z.string(), z.any()).default({}),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("objet_journal_events").insert({
      objet_id: data.objetId,
      affaire_id: data.affaireId,
      event_type: data.eventType,
      etape_id: data.etapeId ?? null,
      metier_id: data.metierId ?? null,
      actor_id: userId,
      payload: data.payload,
    });
    if (error) throw new Error(`logObjetJournalEvent: ${error.message}`);
    return { ok: true };
  });
