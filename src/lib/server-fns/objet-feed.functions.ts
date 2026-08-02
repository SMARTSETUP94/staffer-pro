import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  mergeObjetFeed,
  dedupeObjetFeed,
  type RawPhoto,
} from "@/lib/objet-feed";

const PHOTO_BUCKET = "fabrication-photos";
const SIGNED_TTL_SEC = 60 * 60;

/**
 * LOT A — Fil complet d'un objet : événements journal + commentaires + photos,
 * fusionnés et triés côté serveur.
 *
 * Les signed URLs des photos sont générées en **un seul** appel batch
 * (`createSignedUrls`), jamais en boucle (optimisation v0.44.4).
 */
export const getObjetFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      objetId: z.string().uuid(),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [eventsRes, commentairesRes, photosRes] = await Promise.all([
      supabase
        .from("objet_journal_events")
        .select("id, event_type, occurred_at, actor_id, actor_label, metier_id, etape_id, payload")
        .eq("objet_id", data.objetId)
        .order("occurred_at", { ascending: false })
        .limit(data.limit),
      supabase
        .from("objet_commentaires")
        .select("id, content, author_id, etape_id, created_at")
        .eq("objet_id", data.objetId)
        .order("created_at", { ascending: false })
        .limit(data.limit),
      supabase
        .from("fabrication_objets_photos")
        .select(
          "id, storage_path, thumb_path, commentaire, etape_id, uploaded_by, uploaded_at, width, height, size_bytes",
        )
        .eq("objet_id", data.objetId)
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false })
        .limit(data.limit),
    ]);

    if (eventsRes.error) throw new Error(`getObjetFeed events: ${eventsRes.error.message}`);
    if (commentairesRes.error)
      throw new Error(`getObjetFeed commentaires: ${commentairesRes.error.message}`);
    if (photosRes.error) throw new Error(`getObjetFeed photos: ${photosRes.error.message}`);

    const photoRows = photosRes.data ?? [];

    // Signed URLs en un seul round-trip
    const paths = photoRows.flatMap((r) =>
      [r.storage_path, r.thumb_path].filter((p): p is string => !!p),
    );
    const urlByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(paths, SIGNED_TTL_SEC);
      signed?.forEach((s) => {
        if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
      });
    }

    // Libellés d'auteurs (commentaires + photos) en une requête
    const authorIds = [
      ...new Set(
        [
          ...(commentairesRes.data ?? []).map((c) => c.author_id),
          ...photoRows.map((p) => p.uploaded_by),
        ].filter((v): v is string => !!v),
      ),
    ];
    const labelById = new Map<string, string>();
    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", authorIds);
      profs?.forEach((p) => {
        if (p.full_name) labelById.set(p.id, p.full_name);
      });
    }

    const photos: RawPhoto[] = photoRows.map((p) => ({
      ...p,
      uploader_label: p.uploaded_by ? labelById.get(p.uploaded_by) ?? null : null,
      signed_url: p.storage_path ? urlByPath.get(p.storage_path) ?? null : null,
      thumb_url: p.thumb_path ? urlByPath.get(p.thumb_path) ?? null : null,
    }));

    const commentaires = (commentairesRes.data ?? []).map((c) => ({
      ...c,
      author_label: c.author_id ? labelById.get(c.author_id) ?? null : null,
    }));

    const entries = dedupeObjetFeed(
      mergeObjetFeed({ events: eventsRes.data ?? [], commentaires, photos }),
    );

    return { entries, photos };
  });

/**
 * Publication du plan technique.
 * `mode = "lien"` renseigne `plan_url`; `mode = "document"` s'appuie sur un
 * document déjà déposé dans `affaire_documents` (bucket `affaires-photos`).
 * Dans les deux cas on horodate la publication et on log le fil.
 */
export const publishObjetPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      objetId: z.string().uuid(),
      affaireId: z.string().uuid(),
      mode: z.enum(["lien", "document"]),
      url: z.string().max(2000).nullish(),
      documentId: z.string().uuid().nullish(),
      filename: z.string().max(300).nullish(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();

    const { error: upErr } = await supabase
      .from("fabrication_objets")
      .update({
        plan_url: data.mode === "lien" ? data.url ?? null : null,
        plan_publie_le: now,
        plan_publie_par: userId,
      })
      .eq("id", data.objetId);
    if (upErr) throw new Error(`publishObjetPlan: ${upErr.message}`);

    const { error: logErr } = await supabase.from("objet_journal_events").insert({
      objet_id: data.objetId,
      affaire_id: data.affaireId,
      event_type: "plan_publie",
      actor_id: userId,
      payload: {
        mode: data.mode,
        url: data.mode === "lien" ? data.url ?? null : null,
        document_id: data.documentId ?? null,
        filename: data.filename ?? null,
      },
    });
    if (logErr) throw new Error(`publishObjetPlan journal: ${logErr.message}`);

    return { ok: true, publie_le: now };
  });

/** Retire la publication (le plan redevient « non publié », sans blocage). */
export const unpublishObjetPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ objetId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("fabrication_objets")
      .update({ plan_url: null, plan_publie_le: null, plan_publie_par: null })
      .eq("id", data.objetId);
    if (error) throw new Error(`unpublishObjetPlan: ${error.message}`);
    return { ok: true };
  });
