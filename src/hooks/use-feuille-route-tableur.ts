/**
 * v0.33 — Hook chargement + auto-save Vue Tableur Feuille de Route.
 *
 * Pattern overlay/debounce repris d'OpportunitesTableurView (v0.29.1) :
 *   - mutation locale immédiate (pas de re-render destructif)
 *   - debounce 800ms avant flush serveur via RPC upsert_feuille_route_ligne
 *   - rollback overlay en cas d'erreur
 *
 * Charge en parallèle pour une fenêtre de N jours :
 *   - affaires actives
 *   - assignations
 *   - feuille_route_lignes (overrides)
 *   - trajets
 *   - profiles (résolution responsable)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  buildDateWindow,
  buildFRTableurRows,
  buildUpsertPatch,
  mergeFRRowOverlay,
  type FRLigneOverride,
  type FROverlayPatch,
  type FRTableurAffaire,
  type FRTableurRow,
  type FRTableurTrajet,
} from "@/lib/feuille-route-tableur-helpers";
import type {
  AssignationForResponsable,
  EmployeForResponsable,
} from "@/lib/feuille-route-helpers";
import type { Employe } from "@/hooks/use-planning-data";

const SAVE_DEBOUNCE_MS = 800;

interface UseFRTableurParams {
  weekStart: Date;
  /** Nombre de jours à afficher (défaut 14). */
  nbDays?: number;
  employes: Employe[];
}

interface UseFRTableurResult {
  loading: boolean;
  error: string | null;
  rows: FRTableurRow[];
  /** Edit local + schedule save 800ms. */
  patchRow: (rowId: string, patch: FROverlayPatch) => void;
  /** Edit champ affaires.typologie_future (UPDATE direct, hors RPC). */
  patchTypologieFuture: (
    affaireId: string,
    value: FROverlayPatch["typologie_future"],
  ) => Promise<void>;
  /** Set état "saving" courant (pour spinner par ligne). */
  savingIds: Set<string>;
  refresh: () => Promise<void>;
}

export function useFeuilleRouteTableur({
  weekStart,
  nbDays = 14,
  employes,
}: UseFRTableurParams): UseFRTableurResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverRows, setServerRows] = useState<FRTableurRow[]>([]);
  const [overlay, setOverlay] = useState<Map<string, FROverlayPatch>>(new Map());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dates = buildDateWindow(weekStart, nbDays);
  const startISO = dates[0];
  const endISO = dates[dates.length - 1];

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        { data: affsData, error: affErr },
        { data: asgsData, error: asgErr },
        { data: overridesData, error: ovErr },
        { data: trajetsData, error: trErr },
        { data: profilesData, error: prErr },
      ] = await Promise.all([
        supabase
          .from("affaires")
          .select(
            "id, numero, nom, lieu, statut, chef_projet_id, charge_affaires_id, typologie_future",
          )
          .in("statut", ["en_cours", "prospect"]),
        supabase
          .from("assignations")
          .select("affaire_id, date, employe_id, est_chef_jour")
          .gte("date", startISO)
          .lte("date", endISO),
        supabase
          .from("feuille_route_lignes")
          .select(
            "id, date, affaire_id, type_operation, horaire_rdv, adresse_override, commentaires, vehicules_ids",
          )
          .gte("date", startISO)
          .lte("date", endISO),
        supabase
          .from("trajets")
          .select("date, affaire_id, vehicule_id")
          .gte("date", startISO)
          .lte("date", endISO),
        supabase.from("profiles").select("id, full_name, est_manutention"),
      ]);

      const firstErr = affErr ?? asgErr ?? ovErr ?? trErr ?? prErr;
      if (firstErr) {
        throw firstErr;
      }

      const affaires: FRTableurAffaire[] = (affsData ?? []).map((a) => ({
        id: a.id,
        numero: a.numero,
        nom: a.nom,
        lieu: a.lieu ?? null,
        statut: a.statut as FRTableurAffaire["statut"],
        chef_projet_id: a.chef_projet_id ?? null,
        charge_affaires_id: a.charge_affaires_id ?? null,
        typologie_future:
          (a.typologie_future as FRTableurAffaire["typologie_future"]) ?? null,
      }));

      const assignations: AssignationForResponsable[] = (asgsData ?? []).map(
        (a) => ({
          affaire_id: a.affaire_id,
          date: a.date,
          employe_id: a.employe_id,
          est_chef_jour: a.est_chef_jour ?? false,
        }),
      );

      const overrides: FRLigneOverride[] = (overridesData ?? []).map((o) => ({
        id: o.id,
        date: o.date,
        affaire_id: o.affaire_id,
        type_operation: o.type_operation ?? null,
        horaire_rdv: o.horaire_rdv ?? null,
        adresse_override: o.adresse_override ?? null,
        commentaires: o.commentaires ?? null,
        vehicules_ids: o.vehicules_ids ?? [],
      }));

      const trajets: FRTableurTrajet[] = (trajetsData ?? []).map((t) => ({
        date: t.date,
        affaire_id: t.affaire_id ?? null,
        vehicule_id: t.vehicule_id ?? null,
      }));

      const profilesMap = new Map<
        string,
        { full_name: string | null; est_manutention: boolean }
      >();
      (profilesData ?? []).forEach((p) => {
        profilesMap.set(p.id, {
          full_name: p.full_name,
          est_manutention: p.est_manutention ?? false,
        });
      });

      const employesParId = new Map<string, EmployeForResponsable>();
      employes.forEach((e) => {
        const pId = (e as Employe & { profile_id?: string | null }).profile_id ?? null;
        const prof = pId ? profilesMap.get(pId) : null;
        employesParId.set(e.id, {
          id: e.id,
          profile_id: pId,
          est_manutention: prof?.est_manutention ?? false,
        });
      });

      const built = buildFRTableurRows({
        dates,
        affaires,
        assignations,
        overrides,
        trajets,
        employes: employes.map((e) => ({
          id: e.id,
          prenom: e.prenom,
          nom: e.nom,
        })),
        employesParId,
        profiles: profilesMap,
      });
      setServerRows(built);
    } catch (e) {
      console.error("[useFeuilleRouteTableur] reload error", e);
      setError((e as Error).message ?? "Erreur de chargement");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startISO, endISO, employes]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Cleanup debounce au démontage
  useEffect(() => {
    const map = debounceRef.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const markSaving = useCallback((id: string, on: boolean) => {
    setSavingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const flushSave = useCallback(
    async (rowId: string, fullPatch: FROverlayPatch) => {
      // rowId est `${date}|${affaire_id}`
      const sep = rowId.indexOf("|");
      const date = rowId.slice(0, sep);
      const affaireId = rowId.slice(sep + 1);
      markSaving(rowId, true);
      try {
        const { error: rpcErr } = await supabase.rpc("upsert_feuille_route_ligne", {
          _date: date,
          _affaire_id: affaireId,
          _patch: buildUpsertPatch(fullPatch) as never,
        });
        if (rpcErr) throw rpcErr;
        // Retire l'overlay : le serveur a confirmé. La prochaine reload récupèrera
        // la valeur côté serveur. Côté UI, on garde l'overlay jusqu'au prochain
        // refresh pour éviter un flicker visuel — le merge donne le même résultat.
        // On nettoie juste pour éviter la croissance mémoire si reload tarde.
        setOverlay((prev) => {
          const next = new Map(prev);
          // On ne nettoie pas immédiatement pour éviter flicker — la valeur serveur
          // (au prochain refresh) écrasera toute façon l'overlay si elle diffère.
          return next;
        });
      } catch (e) {
        console.error("[useFeuilleRouteTableur] save error", e);
        // Rollback overlay
        setOverlay((prev) => {
          const next = new Map(prev);
          next.delete(rowId);
          return next;
        });
      } finally {
        markSaving(rowId, false);
      }
    },
    [markSaving],
  );

  const patchRow = useCallback(
    (rowId: string, patch: FROverlayPatch) => {
      // 1) Optimistic overlay
      setOverlay((prev) => {
        const next = new Map(prev);
        const existing = next.get(rowId) ?? {};
        next.set(rowId, { ...existing, ...patch });
        return next;
      });
      // 2) Schedule save
      const map = debounceRef.current;
      const existing = map.get(rowId);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        map.delete(rowId);
        // On lit l'overlay courant complet (cumul des patches) pour flush
        setOverlay((prev) => {
          const full = prev.get(rowId);
          if (full) void flushSave(rowId, full);
          return prev;
        });
      }, SAVE_DEBOUNCE_MS);
      map.set(rowId, t);
    },
    [flushSave],
  );

  const patchTypologieFuture = useCallback(
    async (affaireId: string, value: FROverlayPatch["typologie_future"]) => {
      // typologie_future vit sur affaires, pas sur la ligne FR.
      // UPDATE direct + reload (impacte potentiellement plusieurs lignes).
      const { error: updErr } = await supabase
        .from("affaires")
        .update({ typologie_future: value })
        .eq("id", affaireId);
      if (updErr) {
        console.error("[useFeuilleRouteTableur] typologie_future error", updErr);
        throw updErr;
      }
      await reload();
    },
    [reload],
  );

  // Lignes finales : merge serveur × overlay
  const rows = serverRows.map((r) => mergeFRRowOverlay(r, overlay.get(r.id)));

  return {
    loading,
    error,
    rows,
    patchRow,
    patchTypologieFuture,
    savingIds,
    refresh: reload,
  };
}

// Re-export pour cohérence d'import
export { addDays, format };
