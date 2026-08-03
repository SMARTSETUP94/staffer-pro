/**
 * LOT 8 — Exécution de l'import planning (écritures Supabase, idempotentes).
 *
 * Règles d'idempotence :
 *  - objets      : dédoublonnage sur (affaire_id, nom normalisé)
 *  - heures      : upsert sur (objet_id, metier_id) — remplace ou cumule
 *  - planning    : dédoublonnage sur (affaire_id, objet_id, metier_id, date)
 *  - assignations: dédoublonnage sur (employe_id, date, affaire_id) puis
 *                  écriture EXCLUSIVEMENT via `assignation-upsert.ts`
 */
import { supabase } from "@/integrations/supabase/client";
import { insertAssignationsBatch } from "@/lib/assignation-upsert";
import { normLabel } from "@/lib/imports/planning-xlsx";
import type { HeuresConflictMode, PlanningPlan } from "@/lib/imports/planning-plan";

export interface ApplyOptions {
  /** Créer les affaires absentes de la base (sinon leurs lignes sont ignorées). */
  createAffaires: boolean;
  /** Comportement quand une ligne d'heures existe déjà pour (objet, métier). */
  heuresMode: HeuresConflictMode;
  /** Écrire les affectations nominatives résolues. */
  withAffectations: boolean;
  /** Mettre à jour les champs de montage depuis l'onglet Livraisons. */
  withMontage: boolean;
}

export interface ApplyReport {
  affairesCreees: number;
  affairesIgnorees: string[];
  affairesMisesAJour: number;
  objetsCrees: number;
  objetsExistants: number;
  heuresCreees: number;
  heuresMisesAJour: number;
  planningCree: number;
  planningMisAJour: number;
  assignationsCreees: number;
  assignationsExistantes: number;
  erreurs: string[];
}

const chunk = <T,>(arr: T[], size = 200): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

function makeReference(nom: string, used: Set<string>): string {
  const base = (nom || "OBJ").trim().slice(0, 40) || "OBJ";
  let ref = base;
  let i = 2;
  while (used.has(normLabel(ref))) {
    ref = `${base} (${i++})`;
  }
  used.add(normLabel(ref));
  return ref;
}

export async function applyPlanningImport(plan: PlanningPlan, opts: ApplyOptions): Promise<ApplyReport> {
  const report: ApplyReport = {
    affairesCreees: 0,
    affairesIgnorees: [],
    affairesMisesAJour: 0,
    objetsCrees: 0,
    objetsExistants: 0,
    heuresCreees: 0,
    heuresMisesAJour: 0,
    planningCree: 0,
    planningMisAJour: 0,
    assignationsCreees: 0,
    assignationsExistantes: 0,
    erreurs: [],
  };

  /* ------------------------------------------------------------- 1. affaires */
  const affaireIdByCode = new Map<string, string>();
  for (const a of plan.affaires) {
    if (a.existingId) {
      affaireIdByCode.set(a.code, a.existingId);
      continue;
    }
    if (!opts.createAffaires) {
      report.affairesIgnorees.push(a.code);
      continue;
    }
    const { data, error } = await supabase
      .from("affaires")
      .insert({ numero: a.code, nom: a.nom })
      .select("id")
      .single();
    if (error || !data) {
      report.erreurs.push(`Affaire ${a.code} : ${error?.message ?? "création impossible"}`);
      continue;
    }
    affaireIdByCode.set(a.code, data.id);
    report.affairesCreees += 1;
  }

  /* ----------------------------------------------------- 2. champs de montage */
  if (opts.withMontage) {
    for (const a of plan.affaires) {
      const id = affaireIdByCode.get(a.code);
      if (!id || !a.montage) continue;
      const m = a.montage;
      const patch: AffaireUpdate = {};
      if (m.date_montage) patch.date_montage = m.date_montage;
      if (m.date_demontage) patch.date_demontage = m.date_demontage;
      if (m.montage_nb_techniciens != null) patch.montage_nb_techniciens = m.montage_nb_techniciens;
      if (m.montage_travail_nuit) patch.montage_travail_nuit = true;
      if (m.montage_nb_semi != null) patch.montage_nb_semi = m.montage_nb_semi;
      if (m.montage_nb_20m3 != null) patch.montage_nb_20m3 = m.montage_nb_20m3;
      if (m.montage_nature_prestation) patch.montage_nature_prestation = m.montage_nature_prestation;
      if (m.montage_notes) patch.montage_notes = m.montage_notes;
      if (Object.keys(patch).length === 0) continue;
      const { error } = await supabase.from("affaires").update(patch).eq("id", id);

      if (error) report.erreurs.push(`Montage ${a.code} : ${error.message}`);
      else report.affairesMisesAJour += 1;
    }
  }

  const affaireIds = [...affaireIdByCode.values()];
  if (affaireIds.length === 0) return report;

  /* --------------------------------------------------------------- 3. objets */
  const existingObjets: { id: string; affaire_id: string; nom: string; reference: string }[] = [];
  for (const ids of chunk(affaireIds)) {
    const { data, error } = await supabase
      .from("fabrication_objets")
      .select("id, affaire_id, nom, reference")
      .in("affaire_id", ids);
    if (error) report.erreurs.push(`Lecture objets : ${error.message}`);
    else existingObjets.push(...(data ?? []));
  }

  const objetKey = (affaireId: string, nom: string) => `${affaireId}::${normLabel(nom)}`;
  const objetIdByKey = new Map<string, string>();
  const refsByAffaire = new Map<string, Set<string>>();
  for (const o of existingObjets) {
    objetIdByKey.set(objetKey(o.affaire_id, o.nom), o.id);
    if (!refsByAffaire.has(o.affaire_id)) refsByAffaire.set(o.affaire_id, new Set());
    refsByAffaire.get(o.affaire_id)!.add(normLabel(o.reference));
  }

  const toInsertObjets: { affaire_id: string; nom: string; reference: string }[] = [];
  for (const o of plan.objets) {
    const affaireId = affaireIdByCode.get(o.code);
    if (!affaireId) continue;
    const key = objetKey(affaireId, o.nom);
    if (objetIdByKey.has(key)) {
      report.objetsExistants += 1;
      continue;
    }
    if (!refsByAffaire.has(affaireId)) refsByAffaire.set(affaireId, new Set());
    const reference = makeReference(o.nom, refsByAffaire.get(affaireId)!);
    toInsertObjets.push({ affaire_id: affaireId, nom: o.nom, reference });
    objetIdByKey.set(key, "");
  }

  for (const batch of chunk(toInsertObjets, 100)) {
    const { data, error } = await supabase
      .from("fabrication_objets")
      .insert(batch)
      .select("id, affaire_id, nom");
    if (error) {
      report.erreurs.push(`Création objets : ${error.message}`);
      continue;
    }
    for (const o of data ?? []) {
      objetIdByKey.set(objetKey(o.affaire_id, o.nom), o.id);
      report.objetsCrees += 1;
    }
  }

  const resolveObjetId = (code: string, element: string): string | null => {
    const affaireId = affaireIdByCode.get(code);
    if (!affaireId) return null;
    const id = objetIdByKey.get(objetKey(affaireId, element));
    return id || null;
  };

  /* ---------------------------------------------------------------- 4. heures */
  const objetIds = [...new Set([...objetIdByKey.values()].filter(Boolean))];
  const existingHeures = new Map<string, { id: string; heures_prevues: number }>();
  for (const ids of chunk(objetIds)) {
    const { data, error } = await supabase
      .from("objet_heures_metier")
      .select("id, objet_id, metier_id, heures_prevues")
      .in("objet_id", ids);
    if (error) report.erreurs.push(`Lecture heures : ${error.message}`);
    for (const h of data ?? []) {
      existingHeures.set(`${h.objet_id}::${h.metier_id}`, {
        id: h.id,
        heures_prevues: Number(h.heures_prevues ?? 0),
      });
    }
  }

  const heuresRows: {
    objet_id: string;
    metier_id: number;
    heures_prevues: number;
    origine: string;
    note: string | null;
    sous_traitance: boolean;
  }[] = [];
  for (const h of plan.heures) {
    const objetId = resolveObjetId(h.code, h.element);
    if (!objetId) continue;
    const prev = existingHeures.get(`${objetId}::${h.metierId}`);
    const heures = prev && opts.heuresMode === "cumulate" ? prev.heures_prevues + h.heures : h.heures;
    if (prev) report.heuresMisesAJour += 1;
    else report.heuresCreees += 1;
    heuresRows.push({
      objet_id: objetId,
      metier_id: h.metierId,
      heures_prevues: heures,
      origine: h.origine,
      note: h.note,
      sous_traitance: h.sousTraitance,
    });
  }
  for (const batch of chunk(heuresRows, 100)) {
    const { error } = await supabase
      .from("objet_heures_metier")
      .upsert(batch, { onConflict: "objet_id,metier_id" });
    if (error) report.erreurs.push(`Écriture heures : ${error.message}`);
  }

  /* -------------------------------------------------------------- 5. planning */
  const dates = [...new Set(plan.planning.map((p) => p.date))].sort();
  const planningIdByKey = new Map<string, { id: string; nb_pers: number }>();
  if (dates.length > 0) {
    for (const ids of chunk(affaireIds)) {
      const { data, error } = await supabase
        .from("atelier_planning")
        .select("id, affaire_id, objet_id, metier_id, date, nb_pers")
        .in("affaire_id", ids)
        .gte("date", dates[0]!)
        .lte("date", dates[dates.length - 1]!);
      if (error) report.erreurs.push(`Lecture planning : ${error.message}`);
      for (const p of data ?? []) {
        planningIdByKey.set(`${p.affaire_id}::${p.objet_id ?? ""}::${p.metier_id}::${p.date}`, {
          id: p.id,
          nb_pers: p.nb_pers,
        });
      }
    }
  }

  const planningInserts: {
    affaire_id: string; objet_id: string; metier_id: number; date: string; nb_pers: number; note: string | null;
  }[] = [];
  /** clé plan → id atelier_planning, pour rattacher les assignations. */
  const planningIdByPlanKey = new Map<string, string>();

  for (const p of plan.planning) {
    const affaireId = affaireIdByCode.get(p.code);
    const objetId = resolveObjetId(p.code, p.element);
    if (!affaireId || !objetId) continue;
    const dbKey = `${affaireId}::${objetId}::${p.metierId}::${p.date}`;
    const planKey = `${p.code}::${normLabel(p.element)}::${p.metierId}::${p.date}`;
    const existing = planningIdByKey.get(dbKey);
    if (existing) {
      planningIdByPlanKey.set(planKey, existing.id);
      if (existing.nb_pers !== p.nbPers || p.note) {
        const { error } = await supabase
          .from("atelier_planning")
          .update({ nb_pers: p.nbPers, note: p.note })
          .eq("id", existing.id);
        if (error) report.erreurs.push(`Planning ${p.date} : ${error.message}`);
        else report.planningMisAJour += 1;
      }
      continue;
    }
    planningInserts.push({
      affaire_id: affaireId,
      objet_id: objetId,
      metier_id: p.metierId,
      date: p.date,
      nb_pers: p.nbPers,
      note: p.note,
    });
  }

  for (const batch of chunk(planningInserts, 100)) {
    const { data, error } = await supabase
      .from("atelier_planning")
      .insert(batch)
      .select("id, affaire_id, objet_id, metier_id, date");
    if (error) {
      report.erreurs.push(`Création planning : ${error.message}`);
      continue;
    }
    report.planningCree += (data ?? []).length;
    for (const row of data ?? []) {
      const affaireCode = [...affaireIdByCode.entries()].find(([, id]) => id === row.affaire_id)?.[0];
      const objetNom = existingObjetNom(objetIdByKey, row.objet_id, row.affaire_id);
      if (affaireCode && objetNom) {
        planningIdByPlanKey.set(`${affaireCode}::${objetNom}::${row.metier_id}::${row.date}`, row.id);
      }
    }
  }

  /* ---------------------------------------------------------- 6. affectations */
  if (opts.withAffectations && plan.affectations.length > 0) {
    const employeIds = [...new Set(plan.affectations.map((a) => a.employeId))];
    const existing = new Set<string>();
    for (const ids of chunk(employeIds)) {
      const { data, error } = await supabase
        .from("assignations")
        .select("id, employe_id, affaire_id, date")
        .in("employe_id", ids)
        .gte("date", dates[0] ?? "1900-01-01")
        .lte("date", dates[dates.length - 1] ?? "2999-12-31");
      if (error) report.erreurs.push(`Lecture assignations : ${error.message}`);
      for (const a of data ?? []) existing.add(`${a.employe_id}::${a.affaire_id}::${a.date}`);
    }

    const rows: Parameters<typeof insertAssignationsBatch>[0] = [];
    const objetIdsForRow: string[] = [];
    for (const a of plan.affectations) {
      const affaireId = affaireIdByCode.get(a.code);
      const objetId = resolveObjetId(a.code, a.element);
      if (!affaireId || !objetId) continue;
      const dedup = `${a.employeId}::${affaireId}::${a.date}`;
      if (existing.has(dedup)) {
        report.assignationsExistantes += 1;
        continue;
      }
      existing.add(dedup);
      const planKey = `${a.code}::${normLabel(a.element)}::${a.metierId}::${a.date}`;
      rows.push({
        affaire_id: affaireId,
        employe_id: a.employeId,
        metier_id: a.metierId,
        date: a.date,
        demi_journee: "JOURNEE",
        heures: 8,
        atelier_planning_id: planningIdByPlanKey.get(planKey) ?? null,
      });
      objetIdsForRow.push(objetId);
    }

    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const objetsBatch = objetIdsForRow.slice(i, i + 100);
      const { data, error } = await insertAssignationsBatch(batch);
      if (error) {
        report.erreurs.push(`Création assignations : ${error.message}`);
        continue;
      }
      const created = data ?? [];
      report.assignationsCreees += created.length;
      const links = created
        .map((row, idx) => ({ assignation_id: row.id, objet_id: objetsBatch[idx] }))
        .filter((l): l is { assignation_id: string; objet_id: string } => Boolean(l.objet_id));
      if (links.length > 0) {
        const { error: linkError } = await supabase.from("assignation_objets").insert(links);
        if (linkError) report.erreurs.push(`Liaison objets : ${linkError.message}`);
      }
    }
  }

  return report;
}

/** Retrouve le nom normalisé d'un objet depuis l'index (affaireId::nom → id). */
function existingObjetNom(
  index: Map<string, string>,
  objetId: string | null,
  affaireId: string,
): string | null {
  if (!objetId) return null;
  for (const [key, id] of index) {
    if (id === objetId && key.startsWith(`${affaireId}::`)) return key.slice(affaireId.length + 2);
  }
  return null;
}
