import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isBefore, startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export type DemiJournee = "AM" | "PM" | "JOURNEE";
export type HeureStatut = "brouillon" | "soumis" | "valide" | "rejete";

export interface AssignationRow {
  id: string;
  date: string;
  demi_journee: DemiJournee;
  heures: number;
  notes: string | null;
  affaire_id: string;
  affaire: { numero: string; nom: string; lieu: string | null } | null;
  metier: { libelle: string; couleur: string } | null;
}

export type FabricationEtapeTypeRow = "be" | "respo_fab" | "finition" | "manutention";

export interface SaisieRow {
  id: string;
  assignation_id: string | null;
  affaire_id: string;
  date: string;
  heure_debut: string | null;
  heure_fin: string | null;
  heures_reelles: number | null;
  commentaire: string | null;
  statut: HeureStatut;
  motif_rejet: string | null;
  motif_rejet_lu_le: string | null;
  fabrication_objet_id: string | null;
  fabrication_etape_type: FabricationEtapeTypeRow | null;
}

/** Combinaison d'une assignation + sa saisie (s'il y en a une). */
export interface SaisieCombined {
  key: string; // assignation.id ou saisie.id si orpheline
  assignation: AssignationRow | null;
  saisie: SaisieRow | null;
  date: string;
  demi_journee: DemiJournee;
  affaire_id: string;
  affaire_label: string;
  metier_couleur: string;
}

interface UseMesHeuresOptions {
  weekStart: Date;
  /** Si fourni, override l'employé connecté (pour preview admin). */
  employeIdOverride?: string | null;
}

interface UseMesHeuresResult {
  loading: boolean;
  employeId: string | null;
  employeNom: string;
  rows: SaisieCombined[];
  rejectedNotAcked: SaisieRow[];
  totalHeuresPrevues: number;
  totalHeuresSaisies: number;
  hasBlockingRejet: boolean;
  reload: () => void;
  upsertSaisie: (row: SaisieCombined, patch: Partial<SaisieRow>) => Promise<void>;
  submitWeek: () => Promise<{ ok: boolean; error?: string; count: number }>;
  acknowledgeRejet: (saisieId: string) => Promise<void>;
}

export function useMesHeures({ weekStart, employeIdOverride }: UseMesHeuresOptions): UseMesHeuresResult {
  const [employeId, setEmployeId] = useState<string | null>(null);
  const [employeNom, setEmployeNom] = useState<string>("");
  const [assignations, setAssignations] = useState<AssignationRow[]>([]);
  const [saisies, setSaisies] = useState<SaisieRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  // Anti-rejeu : mémorise les assignation_id pour lesquels un autofill est en cours
  // ou a déjà été tenté pendant cette session, afin d'éviter les insertions multiples
  // (double-render React, requêtes en parallèle, etc.) avant que la table ne soit rechargée.
  const autofillInFlight = useRef<Set<string>>(new Set());

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const startStr = format(weekStart, "yyyy-MM-dd");
  const endStr = format(weekEnd, "yyyy-MM-dd");

  // Résoudre l'employé
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (employeIdOverride) {
        const { data } = await supabase
          .from("employes")
          .select("id, prenom, nom")
          .eq("id", employeIdOverride)
          .maybeSingle();
        if (!cancelled && data) {
          setEmployeId(data.id);
          setEmployeNom(`${data.prenom} ${data.nom}`);
        }
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("employes")
        .select("id, prenom, nom")
        .eq("profile_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        if (data) {
          setEmployeId(data.id);
          setEmployeNom(`${data.prenom} ${data.nom}`);
        } else {
          setEmployeId(null);
          setLoading(false);
        }
      }
    }
    run();
    return () => { cancelled = true; };
  }, [employeIdOverride]);

  // Charger assignations + saisies de la semaine
  useEffect(() => {
    if (!employeId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase
        .from("assignations")
        .select(
          "id, date, demi_journee, heures, notes, affaire_id, affaire:affaires(numero, nom, lieu), metier:metiers(libelle, couleur)",
        )
        .eq("employe_id", employeId)
        .gte("date", startStr)
        .lte("date", endStr)
        .order("date"),
      supabase
        .from("heures_saisies")
        .select(
          "id, assignation_id, affaire_id, date, heure_debut, heure_fin, heures_reelles, commentaire, statut, motif_rejet, motif_rejet_lu_le, fabrication_objet_id, fabrication_etape_type",
        )
        .eq("employe_id", employeId)
        .gte("date", startStr)
        .lte("date", endStr),
    ]).then(([aRes, sRes]) => {
      if (cancelled) return;
      setAssignations((aRes.data ?? []) as unknown as AssignationRow[]);
      setSaisies((sRes.data ?? []) as unknown as SaisieRow[]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [employeId, startStr, endStr, reloadKey]);

  // Combiner assignations + saisies
  const rows = useMemo<SaisieCombined[]>(() => {
    const byKey = new Map<string, SaisieCombined>();
    for (const a of assignations) {
      const key = `a-${a.id}`;
      byKey.set(key, {
        key,
        assignation: a,
        saisie: null,
        date: a.date,
        demi_journee: a.demi_journee,
        affaire_id: a.affaire_id,
        affaire_label: a.affaire ? `${a.affaire.numero} — ${a.affaire.nom}` : "—",
        metier_couleur: a.metier?.couleur ?? "#94a3b8",
      });
    }
    for (const s of saisies) {
      // Si la saisie a un assignation_id qu'on a déjà → on la fusionne (immutable)
      if (s.assignation_id) {
        const k = `a-${s.assignation_id}`;
        const existing = byKey.get(k);
        if (existing) {
          byKey.set(k, { ...existing, saisie: s });
          continue;
        }
      }
      // Sinon, saisie orpheline (ex: assignation supprimée après saisie)
      const key = `s-${s.id}`;
      byKey.set(key, {
        key,
        assignation: null,
        saisie: s,
        date: s.date,
        demi_journee: "JOURNEE",
        affaire_id: s.affaire_id,
        affaire_label: "(assignation supprimée)",
        metier_couleur: "#94a3b8",
      });
    }
    return Array.from(byKey.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const order = { AM: 0, JOURNEE: 1, PM: 2 };
      return order[a.demi_journee] - order[b.demi_journee];
    });
  }, [assignations, saisies]);

  // Pré-remplissage automatique des jours passés (J-1 et avant) sans saisie
  useEffect(() => {
    if (!employeId || loading) return;
    const today = startOfDay(new Date());
    const toAutofill = rows.filter((r) => {
      if (!r.assignation) return false;
      if (r.saisie) return false;
      // Anti-rejeu : ignorer si déjà en cours d'insertion
      if (autofillInFlight.current.has(r.assignation.id)) return false;
      const d = startOfDay(new Date(r.date));
      return isBefore(d, today);
    });
    if (toAutofill.length === 0) return;
    // Marque ces assignations comme "en cours" avant l'INSERT pour bloquer un re-trigger
    for (const r of toAutofill) autofillInFlight.current.add(r.assignation!.id);
    const inserts = toAutofill.map((r) => ({
      employe_id: employeId,
      assignation_id: r.assignation!.id,
      affaire_id: r.affaire_id,
      date: r.date,
      heures_reelles: Number(r.assignation!.heures),
      statut: "brouillon" as const,
    }));
    supabase
      .from("heures_saisies")
      .upsert(inserts, {
        onConflict: "employe_id,assignation_id",
        ignoreDuplicates: true,
      })
      .select(
        "id, assignation_id, affaire_id, date, heure_debut, heure_fin, heures_reelles, commentaire, statut, motif_rejet, motif_rejet_lu_le, fabrication_objet_id, fabrication_etape_type",
      )
      .then(({ data }) => {
        if (data && data.length > 0) {
          setSaisies((prev) => {
            // Dédup défensive : ne pas ajouter une saisie déjà présente
            const existingIds = new Set(prev.map((s) => s.id));
            const fresh = (data as unknown as SaisieRow[]).filter((s) => !existingIds.has(s.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }
      });
  }, [rows, employeId, loading]);

  const upsertSaisie = useCallback(
    async (row: SaisieCombined, patch: Partial<SaisieRow>) => {
      if (!employeId) return;
      // Si la saisie existe déjà → UPDATE
      if (row.saisie) {
        const next = { ...row.saisie, ...patch };
        const { data, error } = await supabase
          .from("heures_saisies")
          .update(patch)
          .eq("id", row.saisie.id)
          .select(
            "id, assignation_id, affaire_id, date, heure_debut, heure_fin, heures_reelles, commentaire, statut, motif_rejet, motif_rejet_lu_le, fabrication_objet_id, fabrication_etape_type",
          )
          .maybeSingle();
        if (!error && data) {
          setSaisies((prev) => prev.map((s) => (s.id === next.id ? (data as unknown as SaisieRow) : s)));
        }
        return;
      }
      // Sinon → INSERT brouillon
      if (!row.assignation) return;
      const insert = {
        employe_id: employeId,
        assignation_id: row.assignation.id,
        affaire_id: row.affaire_id,
        date: row.date,
        heures_reelles: patch.heures_reelles ?? Number(row.assignation.heures),
        heure_debut: patch.heure_debut ?? null,
        heure_fin: patch.heure_fin ?? null,
        commentaire: patch.commentaire ?? null,
        fabrication_objet_id: patch.fabrication_objet_id ?? null,
        fabrication_etape_type: patch.fabrication_etape_type ?? null,
        statut: "brouillon" as const,
      };
      const { data } = await supabase
        .from("heures_saisies")
        .insert(insert)
        .select(
          "id, assignation_id, affaire_id, date, heure_debut, heure_fin, heures_reelles, commentaire, statut, motif_rejet, motif_rejet_lu_le, fabrication_objet_id, fabrication_etape_type",
        )
        .maybeSingle();
      if (data) {
        setSaisies((prev) => [...prev, data as unknown as SaisieRow]);
      }
    },
    [employeId],
  );

  const rejectedNotAcked = useMemo(
    () => saisies.filter((s) => s.statut === "rejete" && s.motif_rejet && !s.motif_rejet_lu_le),
    [saisies],
  );

  const hasBlockingRejet = rejectedNotAcked.length > 0;

  const acknowledgeRejet = useCallback(async (saisieId: string) => {
    // Passe par la RPC SECURITY DEFINER (l'employé n'a plus le droit d'UPDATE direct sur statut='rejete')
    const { data, error } = await supabase.rpc("acknowledge_heures_rejet", {
      _saisie_id: saisieId,
    });
    if (error || !data) return;
    const updated = data as unknown as SaisieRow;
    setSaisies((prev) => prev.map((s) => (s.id === saisieId ? updated : s)));
  }, []);

  const submitWeek = useCallback(async () => {
    if (!employeId) return { ok: false, error: "Employé non résolu", count: 0 };
    if (hasBlockingRejet) {
      return { ok: false, error: "Vous devez prendre connaissance des motifs de rejet d'abord.", count: 0 };
    }
    // Tous les brouillons de la semaine → soumis
    const toSubmit = saisies.filter((s) => s.statut === "brouillon");
    if (toSubmit.length === 0) {
      return { ok: false, error: "Aucune saisie en brouillon à soumettre.", count: 0 };
    }
    // Filtre : on ne soumet que les saisies avec heures_reelles > 0
    const valid = toSubmit.filter((s) => Number(s.heures_reelles ?? 0) > 0);
    if (valid.length === 0) {
      return { ok: false, error: "Aucune saisie valide (heures > 0).", count: 0 };
    }
    const ids = valid.map((s) => s.id);
    const { error } = await supabase
      .from("heures_saisies")
      .update({ statut: "soumis" })
      .in("id", ids);
    if (error) return { ok: false, error: error.message, count: 0 };
    setReloadKey((k) => k + 1);
    return { ok: true, count: valid.length };
  }, [employeId, saisies, hasBlockingRejet]);

  const totalHeuresPrevues = useMemo(
    () => assignations.reduce((acc, a) => acc + Number(a.heures || 0), 0),
    [assignations],
  );
  const totalHeuresSaisies = useMemo(
    () => saisies.reduce((acc, s) => acc + Number(s.heures_reelles ?? 0), 0),
    [saisies],
  );

  return {
    loading,
    employeId,
    employeNom,
    rows,
    rejectedNotAcked,
    totalHeuresPrevues,
    totalHeuresSaisies,
    hasBlockingRejet,
    reload: () => setReloadKey((k) => k + 1),
    upsertSaisie,
    submitWeek,
    acknowledgeRejet,
  };
}
