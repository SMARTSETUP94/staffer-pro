import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isBefore, startOfDay } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBusinessError } from "@/lib/business-errors";
import {
  buildHorsPlanningInsert,
  type HorsPlanningInput,
} from "@/lib/hors-planning-helpers";

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

export type FabricationEtapeTypeRow = "be" | "usinage" | "respo_fab" | "finition" | "manutention";

export interface SaisieRow {
  id: string;
  assignation_id: string | null;
  affaire_id: string;
  date: string;
  heure_debut: string | null;
  heure_fin: string | null;
  heures_reelles: number | null;
  duree_pause_minutes: number;
  commentaire: string | null;
  statut: HeureStatut;
  motif_rejet: string | null;
  motif_rejet_lu_le: string | null;
  fabrication_objet_id: string | null;
  fabrication_etape_type: FabricationEtapeTypeRow | null;
  /** v0.32.3 — métier réellement effectué (renseigné pour saisies hors planning). */
  metier_id: number | null;
  /** Étape chantier 4XXX (Montage / Démontage / Permanence / Chargement…). */
  etape_chantier: EtapeChantierRow | null;
}

export type EtapeChantierRow =
  | "Montage"
  | "Démontage"
  | "Rotation"
  | "Permanence"
  | "Finition"
  | "Chargement"
  | "Déchargement"
  | "Traçage";

export const ETAPE_CHANTIER_OPTIONS: readonly EtapeChantierRow[] = [
  "Montage",
  "Démontage",
  "Rotation",
  "Permanence",
  "Finition",
  "Chargement",
  "Déchargement",
  "Traçage",
] as const;

/** Combinaison d'une assignation + sa saisie (s'il y en a une). */
export interface SaisieCombined {
  key: string; // assignation.id ou saisie.id si orpheline
  assignation: AssignationRow | null;
  saisie: SaisieRow | null;
  date: string;
  demi_journee: DemiJournee;
  affaire_id: string;
  affaire_label: string;
  affaire_numero: string | null;
  metier_couleur: string;
  /** v0.32.3 — true si saisie hors planning (assignation_id IS NULL). */
  hors_planning: boolean;
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
  /** v0.32.3 — créer une saisie hors planning (assignation_id = NULL). */
  addHorsPlanning: (input: HorsPlanningInput) => Promise<{ ok: boolean; error?: string; saisieId?: string }>;
  /** v0.32.3 — supprimer une saisie hors planning brouillon (RPC sécurisée). */
  deleteHorsPlanning: (saisieId: string) => Promise<{ ok: boolean; error?: string }>;
}

/** v0.32.3 — projection commune pour SELECT sur heures_saisies (inclut metier_id). */
const SAISIE_SELECT =
  "id, assignation_id, affaire_id, date, heure_debut, heure_fin, heures_reelles, duree_pause_minutes, commentaire, statut, motif_rejet, motif_rejet_lu_le, fabrication_objet_id, fabrication_etape_type, metier_id, etape_chantier";

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

  // v0.32.3 — Cache des affaires + métiers connus pour fournir un label
  // aux saisies hors planning (assignation_id IS NULL).
  // Pour éviter une N+1, on récupère en un seul lookup les affaires/métiers
  // référencées par les saisies orphelines après chargement initial.
  const [affairesById, setAffairesById] = useState<
    Record<string, { numero: string; nom: string; lieu: string | null }>
  >({});
  const [metiersById, setMetiersById] = useState<
    Record<number, { libelle: string; couleur: string }>
  >({});

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
          "id, assignation_id, affaire_id, date, heure_debut, heure_fin, heures_reelles, duree_pause_minutes, commentaire, statut, motif_rejet, motif_rejet_lu_le, fabrication_objet_id, fabrication_etape_type, metier_id",
        )
        .eq("employe_id", employeId)
        .gte("date", startStr)
        .lte("date", endStr),
    ]).then(async ([aRes, sRes]) => {
      if (cancelled) return;
      const newAssign = (aRes.data ?? []) as unknown as AssignationRow[];
      const newSaisies = (sRes.data ?? []) as unknown as SaisieRow[];
      setAssignations(newAssign);
      setSaisies(newSaisies);

      // Lookup orphelines : affaires/métiers non couverts par les assignations
      const knownAffaireIds = new Set(newAssign.map((a) => a.affaire_id));
      const knownMetierIds = new Set<number>();
      const missingAffaireIds = new Set<string>();
      const missingMetierIds = new Set<number>();
      for (const s of newSaisies) {
        if (s.assignation_id) continue;
        if (!knownAffaireIds.has(s.affaire_id)) missingAffaireIds.add(s.affaire_id);
        if (s.metier_id != null && !knownMetierIds.has(s.metier_id)) {
          missingMetierIds.add(s.metier_id);
        }
      }
      const lookups: Promise<unknown>[] = [];
      if (missingAffaireIds.size > 0) {
        lookups.push(
          Promise.resolve(
            supabase
              .from("affaires")
              .select("id, numero, nom, lieu")
              .in("id", Array.from(missingAffaireIds)),
          ).then(({ data }) => {
              if (cancelled || !data) return;
              setAffairesById((prev) => {
                const next = { ...prev };
                for (const a of data as Array<{
                  id: string;
                  numero: string;
                  nom: string;
                  lieu: string | null;
                }>) {
                  next[a.id] = { numero: a.numero, nom: a.nom, lieu: a.lieu };
                }
                return next;
              });
            }),
        );
      }
      if (missingMetierIds.size > 0) {
        lookups.push(
          Promise.resolve(
            supabase
              .from("metiers")
              .select("id, libelle, couleur")
              .in("id", Array.from(missingMetierIds)),
          ).then(({ data }) => {
              if (cancelled || !data) return;
              setMetiersById((prev) => {
                const next = { ...prev };
                for (const m of data as Array<{ id: number; libelle: string; couleur: string }>) {
                  next[m.id] = { libelle: m.libelle, couleur: m.couleur };
                }
                return next;
              });
            }),
        );
      }
      await Promise.all(lookups);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [employeId, startStr, endStr, reloadKey]);

  // v0.41.0a — Refetch automatique au retour sur l'onglet ou au focus fenêtre.
  // Évite que l'employé reste bloqué sur un cache stale pendant qu'un chef
  // saisit/valide ses heures depuis un autre onglet ou une autre session.
  useEffect(() => {
    if (!employeId) return;
    const handler = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        setReloadKey((k) => k + 1);
      }
    };
    window.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
    };
  }, [employeId]);

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
        affaire_numero: a.affaire?.numero ?? null,
        metier_couleur: a.metier?.couleur ?? "#94a3b8",
        hors_planning: false,
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
      // Saisie hors planning (ou assignation supprimée après saisie)
      const key = `s-${s.id}`;
      const aff = affairesById[s.affaire_id];
      const met = s.metier_id != null ? metiersById[s.metier_id] : undefined;
      const isHorsPlanning = s.assignation_id === null;
      byKey.set(key, {
        key,
        assignation: null,
        saisie: s,
        date: s.date,
        demi_journee: "JOURNEE",
        affaire_id: s.affaire_id,
        affaire_label: aff
          ? `${aff.numero} — ${aff.nom}`
          : isHorsPlanning
            ? "(chargement…)"
            : "(assignation supprimée)",
        affaire_numero: aff?.numero ?? null,
        metier_couleur: met?.couleur ?? "#94a3b8",
        hors_planning: isHorsPlanning,
      });
    }
    return Array.from(byKey.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const order = { AM: 0, JOURNEE: 1, PM: 2 };
      return order[a.demi_journee] - order[b.demi_journee];
    });
    // v0.41.0a — affairesById/metiersById doivent figurer dans les deps,
    // sinon le label "(chargement…)" reste figé après lookup async (visible
    // surtout sur les saisies hors planning créées par un chef pour un
    // employé qui n'a pas d'assignation sur l'affaire).
  }, [assignations, saisies, affairesById, metiersById]);

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
        SAISIE_SELECT,
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
            SAISIE_SELECT,
          )
          .maybeSingle();
        if (error) {
          toast.error(...formatBusinessError(error));
          return;
        }
        if (data) {
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
        duree_pause_minutes: patch.duree_pause_minutes ?? 0,
        commentaire: patch.commentaire ?? null,
        fabrication_objet_id: patch.fabrication_objet_id ?? null,
        fabrication_etape_type: patch.fabrication_etape_type ?? null,
        etape_chantier: patch.etape_chantier ?? null,
        statut: "brouillon" as const,
      };
      const { data, error } = await supabase
        .from("heures_saisies")
        .insert(insert)
        .select(
          SAISIE_SELECT,
        )
        .maybeSingle();
      if (error) {
        toast.error(...formatBusinessError(error));
        return;
      }
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

  // v0.32.3 — Créer une saisie hors planning (assignation_id NULL)
  const addHorsPlanning = useCallback(
    async (input: HorsPlanningInput): Promise<{ ok: boolean; error?: string; saisieId?: string }> => {
      if (!employeId) return { ok: false, error: "Employé non résolu" };
      let payload: ReturnType<typeof buildHorsPlanningInsert>;
      try {
        payload = buildHorsPlanningInsert(employeId, input);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Input invalide" };
      }
      const { data, error } = await supabase
        .from("heures_saisies")
        .insert(payload)
        .select(SAISIE_SELECT)
        .maybeSingle();
      if (error || !data) {
        const [msg] = formatBusinessError(error ?? new Error("Insertion échouée"));
        return { ok: false, error: msg };
      }
      // Optimistic update + déclenche le re-render avec la nouvelle saisie
      setSaisies((prev) => [...prev, data as unknown as SaisieRow]);
      // Force un reload pour récupérer affaire/métier label si besoin
      setReloadKey((k) => k + 1);
      return { ok: true, saisieId: (data as { id: string }).id };
    },
    [employeId],
  );

  // v0.32.3 — Suppression d'une saisie hors planning brouillon (RPC sécurisée)
  const deleteHorsPlanning = useCallback(
    async (saisieId: string): Promise<{ ok: boolean; error?: string }> => {
      const { error } = await supabase.rpc("delete_my_hors_planning_saisie", {
        _saisie_id: saisieId,
      });
      if (error) {
        const [msg] = formatBusinessError(error);
        return { ok: false, error: msg };
      }
      setSaisies((prev) => prev.filter((s) => s.id !== saisieId));
      return { ok: true };
    },
    [],
  );

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
    if (error) {
      const [msg] = formatBusinessError(error);
      return { ok: false, error: msg, count: 0 };
    }
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
    addHorsPlanning,
    deleteHorsPlanning,
  };
}
