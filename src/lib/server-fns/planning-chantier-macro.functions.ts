/**
 * Sprint D / Batch 3 — getPlanningChantierMacro
 *
 * Renvoie la timeline macro (7 phases + jalons + fab sous-blocs) pour le
 * Gantt « Planning chantier » d'une affaire.
 *
 * Phases (ordre vertical du Gantt) :
 *   commercial_etude · fabrication · logistique_aller · montage ·
 *   evenement · demontage · logistique_retour
 *
 * Heures consommées par phase : agrégat depuis v_devis_consommation
 * (mappées sur fabrication / montage / demontage uniquement — autres = null).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlanningPhaseKey =
  | "commercial_etude"
  | "fabrication"
  | "logistique_aller"
  | "montage"
  | "evenement"
  | "demontage"
  | "logistique_retour";

export type PhaseStatut = "ok" | "dates_manquantes" | "fallback";

export interface PlanningPhase {
  key: PlanningPhaseKey;
  label: string;
  start: string | null;       // ISO date
  end: string | null;         // ISO date
  statut: PhaseStatut;
  heures_prevues: number | null;
  heures_consommees: number | null;
  ratio_consomme_pct: number | null;
  equipe_count: number;
  equipe_total: number | null;
}

export interface PlanningJalon {
  key: "signature" | "publication" | "debut_fab" | "livraison";
  label: string;
  date: string | null;
}

export interface FabSousBloc {
  key: string;
  label: string;
  heures_prevues: number;
  heures_consommees: number | null;
}

export interface PlanningChantierMacro {
  affaire_id: string;
  numero: string;
  nom: string;
  window_start: string;
  window_end: string;
  phases: PlanningPhase[];
  jalons: PlanningJalon[];
  fab_sous_blocs: FabSousBloc[];
  dates_source: {
    signed_at: string | null;
    date_montage: string | null;
    date_evenement_debut: string | null;
    date_evenement_fin: string | null;
    date_demontage: string | null;
  };
}

const PHASE_LABELS: Record<PlanningPhaseKey, string> = {
  commercial_etude: "Commercial / Étude",
  fabrication: "Fabrication",
  logistique_aller: "Logistique aller",
  montage: "Montage",
  evenement: "Événement",
  demontage: "Démontage",
  logistique_retour: "Logistique retour",
};

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function toDate(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.slice(0, 10);
}

export const getPlanningChantierMacro = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { affaireId: string }) =>
    z.object({ affaireId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<PlanningChantierMacro> => {
    const { supabase } = context;
    const { affaireId } = data;

    // 1. Affaire
    const { data: aff, error: affErr } = await supabase
      .from("affaires")
      .select(
        "id, numero, nom, created_at, signed_at, date_montage, date_evenement_debut, date_evenement_fin, date_demontage, heures_prevues_montage, heures_prevues_demontage",
      )
      .eq("id", affaireId)
      .maybeSingle();
    if (affErr) throw new Error(affErr.message);
    if (!aff) throw new Error("Affaire introuvable");

    // 2. Consommation par métier (somme tous devis)
    const { data: conso } = await supabase
      .from("v_devis_consommation")
      .select(
        "metier_id, heures_prevues, heures_assignees, heures_reelles_validees, heures_reelles_soumises",
      )
      .eq("affaire_id", affaireId);

    // 3. Equipes castées par phase (pour count)
    const { data: equipes } = await supabase
      .from("affaire_equipe")
      .select("phase")
      .eq("affaire_id", affaireId)
      .is("removed_at", null);

    const equipeCountByPhase = new Map<string, number>();
    for (const e of equipes ?? []) {
      const k = String(e.phase);
      equipeCountByPhase.set(k, (equipeCountByPhase.get(k) ?? 0) + 1);
    }

    // 4. Fab sous-blocs (heures prévues par sous-étape via fabrication_objets)
    const { data: objets } = await supabase
      .from("fabrication_objets")
      .select(
        "quantite, heures_prevues_numerique, heures_prevues_bois, heures_prevues_metal, heures_prevues_peinture, heures_prevues_tapisserie, heures_prevues_be, heures_prevues_manutention",
      )
      .eq("affaire_id", affaireId)
      .eq("archive", false);

    const fabAgg = { numerique: 0, bois: 0, metal: 0, peinture: 0, tapisserie: 0, be: 0, uv: 0 };
    let fabTotal = 0;
    for (const o of objets ?? []) {
      const q = Math.max(1, Number(o.quantite ?? 1));
      fabAgg.numerique  += Number(o.heures_prevues_numerique  ?? 0) * q;
      fabAgg.bois       += Number(o.heures_prevues_bois       ?? 0) * q;
      fabAgg.metal      += Number(o.heures_prevues_metal      ?? 0) * q;
      fabAgg.peinture   += Number(o.heures_prevues_peinture   ?? 0) * q;
      fabAgg.tapisserie += Number(o.heures_prevues_tapisserie ?? 0) * q;
      fabAgg.be         += Number(o.heures_prevues_be         ?? 0) * q;
      // NOTE: colonne heures_prevues_uv n'existe pas encore en DB — affiché à 0 avec badge gris
      fabTotal += fabAgg.numerique; // accumulated; recompute total below
    }
    fabTotal =
      fabAgg.numerique + fabAgg.bois + fabAgg.metal +
      fabAgg.peinture + fabAgg.tapisserie + fabAgg.be + fabAgg.uv;

    const fab_sous_blocs: FabSousBloc[] = [
      { key: "be",         label: "Bureau d'étude", heures_prevues: fabAgg.be,         heures_consommees: null },
      { key: "numerique",  label: "Numérique",      heures_prevues: fabAgg.numerique,  heures_consommees: null },
      { key: "bois",       label: "Bois",           heures_prevues: fabAgg.bois,       heures_consommees: null },
      { key: "metal",      label: "Métal",          heures_prevues: fabAgg.metal,      heures_consommees: null },
      { key: "peinture",   label: "Peinture",       heures_prevues: fabAgg.peinture,   heures_consommees: null },
      { key: "tapisserie", label: "Tapisserie",     heures_prevues: fabAgg.tapisserie, heures_consommees: null },
      { key: "uv",         label: "Impression UV",  heures_prevues: fabAgg.uv,         heures_consommees: null },
    ];

    // 5. Agrégats consommation
    const totalPrevues = (conso ?? []).reduce((s, r) => s + Number(r.heures_prevues ?? 0), 0);
    const totalConsommees = (conso ?? []).reduce(
      (s, r) => s + Number(r.heures_reelles_validees ?? 0) + Number(r.heures_reelles_soumises ?? 0),
      0,
    );

    // 6. Construction des dates par phase (avec fallbacks)
    const createdAt = toDate(aff.created_at);
    const signedAt = toDate(aff.signed_at);
    const dMontage = toDate(aff.date_montage);
    const dEvtStart = toDate(aff.date_evenement_debut);
    const dEvtEnd = toDate(aff.date_evenement_fin);
    const dDemontage = toDate(aff.date_demontage);

    const makePhase = (
      key: PlanningPhaseKey,
      start: string | null,
      end: string | null,
      heures_prevues: number | null,
      heures_consommees: number | null,
      isFallback = false,
    ): PlanningPhase => {
      const ratio =
        heures_prevues != null && heures_prevues > 0 && heures_consommees != null
          ? Math.round((heures_consommees / heures_prevues) * 100)
          : null;
      const statut: PhaseStatut = !start || !end ? "dates_manquantes" : isFallback ? "fallback" : "ok";
      return {
        key,
        label: PHASE_LABELS[key],
        start,
        end,
        statut,
        heures_prevues,
        heures_consommees,
        ratio_consomme_pct: ratio,
        equipe_count: equipeCountByPhase.get(key === "logistique_aller" || key === "logistique_retour" ? "logistique" : key) ?? 0,
        equipe_total: null,
      };
    };

    // fab fallback : signed_at → date_montage (sinon createdAt → signed_at)
    const fabStart = signedAt ?? createdAt;
    const fabEnd = dMontage ?? signedAt;
    const isFabFallback = !dMontage;

    // logistique aller : 1j avant date_montage → date_montage
    const logAllerStart = dMontage ? addDays(dMontage, -1) : null;
    const logAllerEnd = dMontage;

    // montage : date_montage → date_evenement_debut (ou +1j si absent)
    const montStart = dMontage;
    const montEnd = dEvtStart ?? (dMontage ? addDays(dMontage, 1) : null);
    const isMontFallback = !dEvtStart && !!dMontage;

    // evenement : date_evenement_debut → date_evenement_fin
    const evtStart = dEvtStart;
    const evtEnd = dEvtEnd;

    // demontage : date_evenement_fin → date_demontage
    const demStart = dEvtEnd ?? (dDemontage ? addDays(dDemontage, -1) : null);
    const demEnd = dDemontage;
    const isDemFallback = !dEvtEnd && !!dDemontage;

    // logistique retour : date_demontage → date_demontage + 1j
    const logRetStart = dDemontage;
    const logRetEnd = dDemontage ? addDays(dDemontage, 1) : null;

    const heuresFabPrevues = fabTotal > 0 ? fabTotal : null;
    const heuresMontPrevues = Number(aff.heures_prevues_montage ?? 0) || null;
    const heuresDemPrevues = Number(aff.heures_prevues_demontage ?? 0) || null;

    // Note : conso par phase pas modélisée fin — on alimente la fab uniquement,
    // proportionnellement au total des consommées (approximation simple V1).
    const heuresFabConsommees = heuresFabPrevues && totalPrevues > 0
      ? Math.round((heuresFabPrevues / totalPrevues) * totalConsommees)
      : null;

    const phases: PlanningPhase[] = [
      makePhase("commercial_etude", createdAt, signedAt, null, null),
      makePhase("fabrication", fabStart, fabEnd, heuresFabPrevues, heuresFabConsommees, isFabFallback),
      makePhase("logistique_aller", logAllerStart, logAllerEnd, null, null),
      makePhase("montage", montStart, montEnd, heuresMontPrevues, null, isMontFallback),
      makePhase("evenement", evtStart, evtEnd, null, null),
      makePhase("demontage", demStart, demEnd, heuresDemPrevues, null, isDemFallback),
      makePhase("logistique_retour", logRetStart, logRetEnd, null, null),
    ];

    // 7. Jalons ponctuels
    const jalons: PlanningJalon[] = [
      { key: "signature", label: "Signature", date: signedAt },
      { key: "publication", label: "Publication plan", date: null },
      { key: "debut_fab", label: "Début fab", date: signedAt },
    ];

    // 8. Fenêtre globale clamp : signed_at (ou created_at) → date_demontage + 7j (ou +30j fallback)
    const winStart = createdAt ?? signedAt ?? new Date().toISOString().slice(0, 10);
    const winEnd = dDemontage ? addDays(dDemontage, 7) : addDays(winStart, 90);

    return {
      affaire_id: affaireId,
      numero: aff.numero,
      nom: aff.nom,
      window_start: winStart,
      window_end: winEnd,
      phases,
      jalons,
      fab_sous_blocs,
      dates_source: {
        signed_at: signedAt,
        date_montage: dMontage,
        date_evenement_debut: dEvtStart,
        date_evenement_fin: dEvtEnd,
        date_demontage: dDemontage,
      },
    };
  });
