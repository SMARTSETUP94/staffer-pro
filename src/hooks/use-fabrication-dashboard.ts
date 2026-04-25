import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FabricationEtapeStatut, FabricationEtapeType } from "./use-fabrication";

export interface DashEtape {
  id: string;
  objet_id: string;
  type_etape: FabricationEtapeType;
  statut: FabricationEtapeStatut;
  assignee_id: string | null;
  assignee_name: string | null;
  date_debut: string | null;
  date_fin: string | null;
}

export interface DashObjet {
  id: string;
  reference: string;
  nom: string;
  affaire_id: string;
  affaire_numero: string;
  affaire_nom: string;
  chef_projet_id: string | null;
  chef_projet_name: string | null;
  charge_affaires_id: string | null;
  charge_affaires_name: string | null;
  date_demontage: string | null;
  etapes: DashEtape[];
}

export interface DashAffaire {
  id: string;
  numero: string;
  nom: string;
  date_demontage: string | null;
  chef_projet_id: string | null;
  chef_projet_name: string | null;
  charge_affaires_id: string | null;
  charge_affaires_name: string | null;
  objets_count: number;
  total_etapes_actives: number;
  pret_a_livrer: boolean;
}

interface UseFabricationDashboardResult {
  loading: boolean;
  objets: DashObjet[];
  affaires: DashAffaire[];
  reload: () => void;
}

/**
 * Charge tous les objets fabrication non archivés des affaires en phase "signe"
 * et statut "en_cours" pour alimenter le dashboard global.
 */
export function useFabricationDashboard(): UseFabricationDashboardResult {
  const [loading, setLoading] = useState(true);
  const [objets, setObjets] = useState<DashObjet[]>([]);
  const [affaires, setAffaires] = useState<DashAffaire[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      // 1. Affaires actives en phase signée
      const { data: affs } = await supabase
        .from("affaires")
        .select("id, numero, nom, date_demontage, chef_projet_id, charge_affaires_id, phase, statut")
        .eq("phase", "signe")
        .in("statut", ["en_cours", "prospect"]);

      if (cancelled) return;
      if (!affs || affs.length === 0) {
        setObjets([]);
        setAffaires([]);
        setLoading(false);
        return;
      }

      const affIds = affs.map((a) => a.id);

      // 2. Objets non archivés de ces affaires
      const { data: objs } = await supabase
        .from("fabrication_objets")
        .select("id, reference, nom, affaire_id")
        .in("affaire_id", affIds)
        .eq("archive", false)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      const objIds = (objs ?? []).map((o) => o.id);

      // 3. Étapes de tous ces objets
      const { data: etapes } = objIds.length
        ? await supabase
            .from("fabrication_etapes")
            .select("id, objet_id, type_etape, statut, assignee_id, date_debut, date_fin")
            .in("objet_id", objIds)
        : { data: [] as never[] };

      if (cancelled) return;

      // 4. Profils (chefs projet, chargés affaires, assignees)
      const profileIds = new Set<string>();
      affs.forEach((a) => {
        if (a.chef_projet_id) profileIds.add(a.chef_projet_id);
        if (a.charge_affaires_id) profileIds.add(a.charge_affaires_id);
      });
      (etapes ?? []).forEach((e) => e.assignee_id && profileIds.add(e.assignee_id));

      const { data: profs } = profileIds.size
        ? await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", Array.from(profileIds))
        : { data: [] as { id: string; full_name: string | null; email: string }[] };

      if (cancelled) return;
      const nameMap = new Map<string, string>();
      (profs ?? []).forEach((p) => nameMap.set(p.id, p.full_name || p.email));

      const affMap = new Map(affs.map((a) => [a.id, a]));

      // 5. Construire DashObjet[]
      const dashObjets: DashObjet[] = (objs ?? []).map((o) => {
        const a = affMap.get(o.affaire_id);
        return {
          id: o.id,
          reference: o.reference,
          nom: o.nom,
          affaire_id: o.affaire_id,
          affaire_numero: a?.numero ?? "?",
          affaire_nom: a?.nom ?? "",
          chef_projet_id: (a?.chef_projet_id as string | null) ?? null,
          chef_projet_name: a?.chef_projet_id ? (nameMap.get(a.chef_projet_id) ?? null) : null,
          charge_affaires_id: (a?.charge_affaires_id as string | null) ?? null,
          charge_affaires_name: a?.charge_affaires_id
            ? (nameMap.get(a.charge_affaires_id) ?? null)
            : null,
          date_demontage: (a?.date_demontage as string | null) ?? null,
          etapes: (etapes ?? [])
            .filter((e) => e.objet_id === o.id)
            .map((e) => ({
              id: e.id,
              objet_id: e.objet_id,
              type_etape: e.type_etape as FabricationEtapeType,
              statut: e.statut as FabricationEtapeStatut,
              assignee_id: (e.assignee_id as string | null) ?? null,
              assignee_name: e.assignee_id ? (nameMap.get(e.assignee_id) ?? null) : null,
              date_debut: (e.date_debut as string | null) ?? null,
              date_fin: (e.date_fin as string | null) ?? null,
            })),
        };
      });

      // 6. Construire DashAffaire[] avec détection "prêt à livrer"
      const objsByAff = new Map<string, DashObjet[]>();
      dashObjets.forEach((o) => {
        if (!objsByAff.has(o.affaire_id)) objsByAff.set(o.affaire_id, []);
        objsByAff.get(o.affaire_id)!.push(o);
      });

      const dashAffaires: DashAffaire[] = affs
        .filter((a) => objsByAff.has(a.id))
        .map((a) => {
          const objsAff = objsByAff.get(a.id) ?? [];
          const allEtapes = objsAff.flatMap((o) => o.etapes);
          const manuts = allEtapes.filter((e) => e.type_etape === "manutention");
          const pret =
            manuts.length > 0 &&
            manuts.every((e) => e.statut === "termine" || e.statut === "non_applicable");
          const totalEtapesActives = allEtapes.filter(
            (e) => e.statut !== "termine" && e.statut !== "non_applicable",
          ).length;
          return {
            id: a.id,
            numero: a.numero,
            nom: a.nom,
            date_demontage: (a.date_demontage as string | null) ?? null,
            chef_projet_id: (a.chef_projet_id as string | null) ?? null,
            chef_projet_name: a.chef_projet_id ? (nameMap.get(a.chef_projet_id) ?? null) : null,
            charge_affaires_id: (a.charge_affaires_id as string | null) ?? null,
            charge_affaires_name: a.charge_affaires_id
              ? (nameMap.get(a.charge_affaires_id) ?? null)
              : null,
            objets_count: objsAff.length,
            total_etapes_actives: totalEtapesActives,
            pret_a_livrer: pret,
          };
        });

      setObjets(dashObjets);
      setAffaires(dashAffaires);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return { loading, objets, affaires, reload };
}

/** Calcule la charge par assignee pour un type d'étape donné. */
export function computeChargeByAssignee(
  objets: DashObjet[],
  type: FabricationEtapeType,
): Array<{ assignee_id: string; assignee_name: string; count: number }> {
  const map = new Map<string, { assignee_id: string; assignee_name: string; count: number }>();
  for (const o of objets) {
    for (const e of o.etapes) {
      if (e.type_etape !== type) continue;
      if (e.statut === "termine" || e.statut === "non_applicable") continue;
      if (!e.assignee_id) continue;
      const cur = map.get(e.assignee_id);
      if (cur) cur.count += 1;
      else
        map.set(e.assignee_id, {
          assignee_id: e.assignee_id,
          assignee_name: e.assignee_name ?? "?",
          count: 1,
        });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

/** Liste les étapes a_faire sans assignee, groupées par type. */
export function listUnassignedEtapes(objets: DashObjet[]) {
  const result: Record<
    FabricationEtapeType,
    Array<{
      etape_id: string;
      objet_id: string;
      objet_ref: string;
      objet_nom: string;
      affaire_id: string;
      affaire_label: string;
    }>
  > = {
    be: [],
    respo_fab: [],
    finition: [],
    manutention: [],
  };
  for (const o of objets) {
    for (const e of o.etapes) {
      if (e.statut !== "a_faire") continue;
      if (e.assignee_id) continue;
      result[e.type_etape].push({
        etape_id: e.id,
        objet_id: o.id,
        objet_ref: o.reference,
        objet_nom: o.nom,
        affaire_id: o.affaire_id,
        affaire_label: `${o.affaire_numero} — ${o.affaire_nom}`,
      });
    }
  }
  return result;
}

/** Hook utilitaire : étapes assignées à l'utilisateur connecté toutes affaires confondues. */
export function useMesEtapesFabrication() {
  const [loading, setLoading] = useState(true);
  const [etapes, setEtapes] = useState<
    Array<{
      etape_id: string;
      type_etape: FabricationEtapeType;
      statut: FabricationEtapeStatut;
      objet_id: string;
      objet_ref: string;
      objet_nom: string;
      affaire_id: string;
      affaire_numero: string;
      affaire_nom: string;
      date_demontage: string | null;
    }>
  >([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) {
        setEtapes([]);
        setLoading(false);
        return;
      }

      const { data: rawEtapes } = await supabase
        .from("fabrication_etapes")
        .select("id, type_etape, statut, objet_id")
        .eq("assignee_id", user.id)
        .in("statut", ["a_faire", "en_cours"]);

      if (cancelled) return;
      if (!rawEtapes || rawEtapes.length === 0) {
        setEtapes([]);
        setLoading(false);
        return;
      }

      const objIds = rawEtapes.map((e) => e.objet_id);
      const { data: objs } = await supabase
        .from("fabrication_objets")
        .select("id, reference, nom, affaire_id, archive")
        .in("id", objIds);

      if (cancelled) return;
      const visibleObjs = (objs ?? []).filter((o) => !o.archive);
      const affIds = Array.from(new Set(visibleObjs.map((o) => o.affaire_id)));
      const { data: affs } = affIds.length
        ? await supabase
            .from("affaires")
            .select("id, numero, nom, date_demontage")
            .in("id", affIds)
        : { data: [] as { id: string; numero: string; nom: string; date_demontage: string | null }[] };

      if (cancelled) return;
      const affMap = new Map((affs ?? []).map((a) => [a.id, a]));
      const objMap = new Map(visibleObjs.map((o) => [o.id, o]));

      const merged = rawEtapes
        .filter((e) => objMap.has(e.objet_id))
        .map((e) => {
          const o = objMap.get(e.objet_id)!;
          const a = affMap.get(o.affaire_id);
          return {
            etape_id: e.id,
            type_etape: e.type_etape as FabricationEtapeType,
            statut: e.statut as FabricationEtapeStatut,
            objet_id: o.id,
            objet_ref: o.reference,
            objet_nom: o.nom,
            affaire_id: o.affaire_id,
            affaire_numero: a?.numero ?? "?",
            affaire_nom: a?.nom ?? "",
            date_demontage: (a?.date_demontage as string | null) ?? null,
          };
        })
        .sort((a, b) => {
          // Tri par date démontage proche (urgent d'abord), puis ref
          const da = a.date_demontage ?? "9999-12-31";
          const db = b.date_demontage ?? "9999-12-31";
          if (da !== db) return da.localeCompare(db);
          return a.objet_ref.localeCompare(b.objet_ref);
        });

      setEtapes(merged);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return useMemo(
    () => ({ etapes, loading, reload: () => setReloadKey((k) => k + 1) }),
    [etapes, loading],
  );
}
