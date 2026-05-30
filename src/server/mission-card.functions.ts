/**
 * Bloc 9 Lot 9.1 — Server functions cartes mission pose.
 *
 * Trois RPC :
 *   - getMesMissions  : liste des (affaire × phase) de l'utilisateur
 *                       (fenêtre J-7 → J+30, phase IN montage/demontage)
 *   - getCarteMission : détail d'une carte mission donnée + events
 *   - recordMissionEvent : journalise un événement (RLS = self only via
 *                          la policy mission_events_insert_self).
 *                          Si type='probleme' → notif chef (admin client).
 *
 * Décisions Bloc 9 :
 *   Q1 ✅ pas de filtre métier (les poseurs sont sur tous les métiers)
 *   Q2 ✅ pas de saisie chef sur mission_events (V1 employé self only)
 *   Q4 ✅ fallback notif chef = ligne dans table `notifications` + toast
 *          côté client. Pas de canal push (PWA phase 2).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Types exposés
// ---------------------------------------------------------------------------

export type MissionPhase = "montage" | "demontage";

export interface MissionTeamMember {
  employe_id: string;
  nom: string;
  prenom: string;
  nb_demi_jours: number;
}

export interface MissionListItem {
  affaire_id: string;
  affaire_numero: string;
  affaire_nom: string;
  client: string | null;
  lieu: string | null;
  phase: MissionPhase;
  date_debut: string;          // YYYY-MM-DD min assignation
  date_fin: string;            // YYYY-MM-DD max assignation
  nb_demi_jours: number;       // total demi-journées (employé en scope=mine, équipe en scope=team)
  chef_chantier_id: string | null;
  statut: "passee" | "en_cours" | "a_venir";
  /** Présent en scope=team : équipe assignée avec leurs ½j */
  equipe?: MissionTeamMember[];
}

export interface MissionEvent {
  id: string;
  type: "arrivee" | "depart" | "probleme" | "photo" | "message";
  occurred_at: string;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  photo_doc_id: string | null;
}

export interface CarteMissionDetail {
  // affaire
  affaire_id: string;
  affaire_numero: string;
  affaire_nom: string;
  client: string | null;
  lieu: string | null;
  acces_livraison: string | null;
  code_acces: string | null;
  consignes_tenue: string | null;
  contact_site_nom: string | null;
  contact_site_tel: string | null;
  // mission
  phase: MissionPhase;
  date_debut: string;
  date_fin: string;
  date_evenement_debut: string | null;
  date_evenement_fin: string | null;
  // assignations de l'employé sur cette mission
  assignations: {
    id: string;
    date: string;
    demi_journee: "AM" | "PM" | "JOURNEE";
    heures: number;
    metier_id: number | null;
    metier_libelle: string | null;
    statut_confirmation: string;
  }[];
  // équipe sur la phase
  equipe: {
    employe_id: string;
    nom: string;
    prenom: string;
    role_terrain: string | null;
    est_moi: boolean;
  }[];
  // chef
  chef_chantier: {
    id: string;
    nom: string | null;
    prenom: string | null;
    telephone: string | null;
  } | null;
  // events de l'employé sur cette mission
  events: MissionEvent[];
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function statutFromDates(debut: string, fin: string, today = new Date()): MissionListItem["statut"] {
  const t = today.toISOString().slice(0, 10);
  if (fin < t) return "passee";
  if (debut > t) return "a_venir";
  return "en_cours";
}

// ---------------------------------------------------------------------------
// 1) getMesMissions ---------------------------------------------------------
// ---------------------------------------------------------------------------

export const getMesMissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Résoudre employe_id depuis profile_id (= auth.uid())
    const { data: emp } = await supabase
      .from("employes")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    if (!emp) return { missions: [] as MissionListItem[] };

    // Fenêtre J-7 → J+30
    const today = new Date();
    const debut = new Date(today); debut.setDate(debut.getDate() - 7);
    const fin = new Date(today); fin.setDate(fin.getDate() + 30);
    const debutStr = debut.toISOString().slice(0, 10);
    const finStr = fin.toISOString().slice(0, 10);

    // Q1 : PAS de filtre métier — toutes les assignations phase montage/demontage
    const { data: rows, error } = await supabase
      .from("assignations")
      .select(
        "affaire_id, phase, date, demi_journee, affaire:affaires(id, numero, nom, client, lieu, chef_chantier_id)",
      )
      .eq("employe_id", emp.id)
      .in("phase", ["montage", "demontage"])
      .gte("date", debutStr)
      .lte("date", finStr);

    if (error) throw new Error(error.message);

    // Agréger par (affaire_id, phase)
    type Agg = {
      affaire_id: string;
      phase: MissionPhase;
      affaire: { id: string; numero: string; nom: string; client: string | null; lieu: string | null; chef_chantier_id: string | null } | null;
      dates: Set<string>;
      nb_demi_jours: number;
    };
    const map = new Map<string, Agg>();

    for (const r of rows ?? []) {
      if (!r.phase || (r.phase !== "montage" && r.phase !== "demontage")) continue;
      const key = `${r.affaire_id}::${r.phase}`;
      let agg = map.get(key);
      if (!agg) {
        agg = {
          affaire_id: r.affaire_id,
          phase: r.phase as MissionPhase,
          // @ts-ignore supabase relation typing varies
          affaire: r.affaire,
          dates: new Set(),
          nb_demi_jours: 0,
        };
        map.set(key, agg);
      }
      agg.dates.add(r.date);
      agg.nb_demi_jours += r.demi_journee === "JOURNEE" ? 2 : 1;
    }

    const missions: MissionListItem[] = [];
    for (const agg of map.values()) {
      if (!agg.affaire) continue;
      const sorted = [...agg.dates].sort();
      const dDebut = sorted[0]!;
      const dFin = sorted[sorted.length - 1]!;
      missions.push({
        affaire_id: agg.affaire_id,
        affaire_numero: agg.affaire.numero,
        affaire_nom: agg.affaire.nom,
        client: agg.affaire.client,
        lieu: agg.affaire.lieu,
        phase: agg.phase,
        date_debut: dDebut,
        date_fin: dFin,
        nb_demi_jours: agg.nb_demi_jours,
        chef_chantier_id: agg.affaire.chef_chantier_id,
        statut: statutFromDates(dDebut, dFin),
      });
    }

    missions.sort((a, b) => a.date_debut.localeCompare(b.date_debut));
    return { missions };
  });

// ---------------------------------------------------------------------------
// 2) getCarteMission --------------------------------------------------------
// ---------------------------------------------------------------------------

export const getCarteMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { affaireId: string; phase: MissionPhase }) =>
    z.object({
      affaireId: z.string().uuid(),
      phase: z.enum(["montage", "demontage"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { affaireId, phase } = data;

    const { data: emp } = await supabase
      .from("employes")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    if (!emp) throw new Error("Profil employé introuvable");

    // Affaire (RLS filtre l'accès)
    const { data: aff, error: affErr } = await supabase
      .from("affaires")
      .select(
        "id, numero, nom, client, lieu, acces_livraison, code_acces, consignes_tenue, contact_site_nom, contact_site_tel, chef_chantier_id, date_evenement_debut, date_evenement_fin",
      )
      .eq("id", affaireId)
      .maybeSingle();
    if (affErr || !aff) throw new Error(affErr?.message ?? "Affaire introuvable");

    // Assignations de l'employé sur cette mission
    const { data: assigs } = await supabase
      .from("assignations")
      .select(
        "id, date, demi_journee, heures, statut_confirmation, metier_id, metier:metiers(libelle)",
      )
      .eq("employe_id", emp.id)
      .eq("affaire_id", affaireId)
      .eq("phase", phase)
      .order("date");

    const dates = (assigs ?? []).map((a) => a.date).sort();
    if (dates.length === 0) {
      throw new Error("Aucune mission sur cette affaire/phase");
    }
    const dDebut = dates[0]!;
    const dFin = dates[dates.length - 1]!;

    // Équipe de la phase (tous les employés assignés)
    const { data: teamRows } = await supabase
      .from("assignations")
      .select("employe_id, employe:employes(id, nom, prenom)")
      .eq("affaire_id", affaireId)
      .eq("phase", phase);

    const seen = new Set<string>();
    const equipe: CarteMissionDetail["equipe"] = [];
    for (const r of teamRows ?? []) {
      if (seen.has(r.employe_id)) continue;
      seen.add(r.employe_id);
      // @ts-ignore supabase relation typing
      const e = r.employe;
      if (!e) continue;
      equipe.push({
        employe_id: e.id,
        nom: e.nom,
        prenom: e.prenom,
        role_terrain: null,
        est_moi: e.id === emp.id,
      });
    }

    // Chef chantier
    let chef: CarteMissionDetail["chef_chantier"] = null;
    if (aff.chef_chantier_id) {
      const { data: c } = await supabase
        .from("employes")
        .select("id, nom, prenom, telephone")
        .eq("profile_id", aff.chef_chantier_id)
        .maybeSingle();
      if (c) chef = { id: c.id, nom: c.nom, prenom: c.prenom, telephone: c.telephone };
    }

    // Events de l'employé sur cette mission
    const { data: events } = await supabase
      .from("mission_events")
      .select("id, type, occurred_at, note, latitude, longitude, photo_doc_id")
      .eq("affaire_id", affaireId)
      .eq("employe_id", emp.id)
      .eq("phase", phase)
      .order("occurred_at", { ascending: false });

    const detail: CarteMissionDetail = {
      affaire_id: aff.id,
      affaire_numero: aff.numero,
      affaire_nom: aff.nom,
      client: aff.client,
      lieu: aff.lieu,
      acces_livraison: aff.acces_livraison,
      code_acces: aff.code_acces,
      consignes_tenue: aff.consignes_tenue,
      contact_site_nom: aff.contact_site_nom,
      contact_site_tel: aff.contact_site_tel,
      phase,
      date_debut: dDebut,
      date_fin: dFin,
      date_evenement_debut: aff.date_evenement_debut,
      date_evenement_fin: aff.date_evenement_fin,
      assignations: (assigs ?? []).map((a) => ({
        id: a.id,
        date: a.date,
        demi_journee: a.demi_journee as "AM" | "PM" | "JOURNEE",
        heures: Number(a.heures),
        metier_id: (a as { metier_id: number | null }).metier_id ?? null,
        // @ts-ignore supabase relation typing
        metier_libelle: a.metier?.libelle ?? null,
        statut_confirmation: a.statut_confirmation,
      })),
      equipe,
      chef_chantier: chef,
      events: (events ?? []) as MissionEvent[],
    };

    return detail;
  });

// ---------------------------------------------------------------------------
// 3) recordMissionEvent -----------------------------------------------------
// ---------------------------------------------------------------------------

const SEVERITIES = ["info", "warning", "urgent", "bloque"] as const;
export type ProblemeSeverity = (typeof SEVERITIES)[number];

const RecordEventSchema = z.object({
  affaireId: z.string().uuid(),
  phase: z.enum(["montage", "demontage"]),
  type: z.enum(["arrivee", "depart", "probleme", "photo", "message"]),
  note: z.string().max(2000).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  photoDocId: z.string().uuid().optional().nullable(),
  severity: z.enum(SEVERITIES).optional().nullable(),
});

const SEVERITY_LABEL: Record<ProblemeSeverity, string> = {
  info: "Info",
  warning: "Attention",
  urgent: "Urgent",
  bloque: "Bloqué",
};

const SEVERITY_PREFIX: Record<ProblemeSeverity, string> = {
  info: "ℹ️",
  warning: "⚠️",
  urgent: "🚨",
  bloque: "⛔",
};

export const recordMissionEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof RecordEventSchema>) => RecordEventSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: emp } = await supabase
      .from("employes")
      .select("id, nom, prenom")
      .eq("profile_id", userId)
      .maybeSingle();
    if (!emp) throw new Error("Profil employé introuvable");

    // Encode severity dans la note (pas de migration nécessaire)
    let storedNote = data.note ?? null;
    if (data.type === "probleme" && data.severity) {
      const tag = `[${data.severity.toUpperCase()}]`;
      storedNote = storedNote ? `${tag} ${storedNote}` : tag;
    }

    const { data: inserted, error } = await supabase
      .from("mission_events")
      .insert({
        affaire_id: data.affaireId,
        employe_id: emp.id,
        phase: data.phase,
        type: data.type,
        note: storedNote,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        photo_doc_id: data.photoDocId ?? null,
        created_by: userId,
      })
      .select("id, occurred_at")
      .single();

    if (error) throw new Error(error.message);

    let chefName: string | null = null;
    if (data.type === "probleme") {
      const { data: aff } = await supabaseAdmin
        .from("affaires")
        .select("numero, nom, chef_chantier_id")
        .eq("id", data.affaireId)
        .maybeSingle();
      if (aff?.chef_chantier_id) {
        const sev = data.severity ?? "warning";
        const prefix = SEVERITY_PREFIX[sev];
        await supabaseAdmin.from("notifications").insert({
          user_id: aff.chef_chantier_id,
          type: "mission_probleme",
          titre: `${prefix} ${SEVERITY_LABEL[sev]} — ${aff.numero}`,
          message: `${emp.prenom} ${emp.nom} a signalé un problème en ${data.phase} sur ${aff.nom}${data.note ? ` : ${data.note.slice(0, 140)}` : "."}`,
          lien: `/affaires/${data.affaireId}`,
          metadata: {
            affaire_id: data.affaireId,
            phase: data.phase,
            mission_event_id: inserted.id,
            employe_id: emp.id,
            severity: sev,
          },
          lu: false,
        });
        const { data: chef } = await supabaseAdmin
          .from("employes")
          .select("prenom, nom")
          .eq("profile_id", aff.chef_chantier_id)
          .maybeSingle();
        if (chef) chefName = [chef.prenom, chef.nom].filter(Boolean).join(" ").trim() || null;
      }
    }

    return { id: inserted.id, occurred_at: inserted.occurred_at, chefName };
  });
