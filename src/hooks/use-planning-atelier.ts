import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { insertAssignation } from "@/lib/assignation-upsert";
import type { GrilleCell, GrilleLot, GrilleMetier, GrilleObjet } from "@/lib/grille-fabrication";
import type { NommageRow, PlanRow } from "@/lib/planning-atelier";

export interface PlanningAtelierData {
  metiers: GrilleMetier[];
  objets: GrilleObjet[];
  lots: GrilleLot[];
  cells: GrilleCell[];
  plans: PlanRow[];
  /** Assignations de l'affaire sur la fenêtre (nommage). */
  nommages: NommageRow[];
}

export const planningAtelierKey = (affaireId: string, from: string, to: string) =>
  ["planning-atelier", affaireId, from, to] as const;

async function fetchPlanningAtelier(
  affaireId: string,
  from: string,
  to: string,
): Promise<PlanningAtelierData> {
  const [metiersRes, objetsRes, lotsRes, plansRes, nommagesRes] = await Promise.all([
    supabase.from("metiers").select("id, code, libelle, ordre, couleur").order("ordre"),
    supabase
      .from("fabrication_objets")
      .select("id, reference, nom, ordre, lot_id")
      .eq("affaire_id", affaireId)
      .eq("archive", false)
      .order("ordre"),
    supabase
      .from("fabrication_lots")
      .select("id, nom, ordre, couleur")
      .eq("affaire_id", affaireId)
      .order("ordre"),
    supabase
      .from("atelier_planning")
      .select("id, objet_id, lot_id, metier_id, date, nb_pers")
      .eq("affaire_id", affaireId)
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("assignations")
      .select("id, atelier_planning_id, employe_id, affaire_id, date")
      .eq("affaire_id", affaireId)
      .gte("date", from)
      .lte("date", to),
  ]);

  const objets = (objetsRes.data ?? []) as GrilleObjet[];
  const objetIds = objets.map((o) => o.id);

  const cellsRes = objetIds.length
    ? await supabase
        .from("objet_heures_metier")
        .select("id, objet_id, metier_id, heures_prevues, origine, note, sous_traitance")
        .in("objet_id", objetIds)
    : { data: [] as unknown[] };

  return {
    metiers: (metiersRes.data ?? []) as GrilleMetier[],
    objets,
    lots: (lotsRes.data ?? []) as GrilleLot[],
    cells: ((cellsRes.data ?? []) as GrilleCell[]).map((c) => ({
      ...c,
      heures_prevues: Number(c.heures_prevues ?? 0),
    })),
    plans: ((plansRes.data ?? []) as PlanRow[]).map((p) => ({
      ...p,
      nb_pers: Number(p.nb_pers ?? 0),
    })),
    nommages: (nommagesRes.data ?? []) as NommageRow[],
  };
}

export interface SetPersInput {
  existing: PlanRow | null;
  objet_id: string | null;
  lot_id: string | null;
  metier_id: number;
  date: string;
  nb_pers: number;
}

export function usePlanningAtelier(affaireId: string, from: string, to: string) {
  const qc = useQueryClient();
  const key = planningAtelierKey(affaireId, from, to);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchPlanningAtelier(affaireId, from, to),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["planning-atelier", affaireId] });
  };

  /** Écrit l'effectif d'une cellule (0 ou vide ⇒ suppression de la ligne). */
  const setPers = useMutation({
    mutationFn: async (input: SetPersInput) => {
      const { existing, nb_pers, ...scope } = input;
      if (nb_pers <= 0) {
        if (!existing) return;
        const { error } = await supabase.from("atelier_planning").delete().eq("id", existing.id);
        if (error) throw error;
        return;
      }
      if (existing) {
        const { error } = await supabase
          .from("atelier_planning")
          .update({ nb_pers })
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("atelier_planning").insert({
        affaire_id: affaireId,
        objet_id: scope.objet_id,
        lot_id: scope.lot_id,
        metier_id: scope.metier_id,
        date: scope.date,
        nb_pers,
        created_by: userRes.user?.id ?? null,
      });
      if (error) throw error;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PlanningAtelierData>(key);
      if (prev) {
        const plans = prev.plans.filter((p) => p.id !== input.existing?.id);
        if (input.nb_pers > 0) {
          plans.push({
            id: input.existing?.id ?? `optimistic-${input.date}-${input.metier_id}-${Math.random()}`,
            objet_id: input.objet_id,
            lot_id: input.lot_id,
            metier_id: input.metier_id,
            date: input.date,
            nb_pers: input.nb_pers,
          });
        }
        qc.setQueryData<PlanningAtelierData>(key, { ...prev, plans });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: invalidate,
  });

  /** « Poser une période » : upsert d'un effectif sur N jours ouvrés. */
  const poserPeriode = useMutation({
    mutationFn: async (input: {
      objet_id: string | null;
      lot_id: string | null;
      metier_id: number;
      dates: string[];
      nb_pers: number;
    }) => {
      if (input.dates.length === 0) return;
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id ?? null;

      let existingQuery = supabase
        .from("atelier_planning")
        .select("id, date")
        .eq("affaire_id", affaireId)
        .eq("metier_id", input.metier_id)
        .in("date", input.dates);
      existingQuery = input.objet_id
        ? existingQuery.eq("objet_id", input.objet_id)
        : existingQuery.is("objet_id", null).eq("lot_id", input.lot_id ?? "");
      const { data: existing, error: exErr } = await existingQuery;
      if (exErr) throw exErr;

      const byDate = new Map((existing ?? []).map((r) => [r.date, r.id]));
      const toInsert = input.dates
        .filter((d) => !byDate.has(d))
        .map((date) => ({
          affaire_id: affaireId,
          objet_id: input.objet_id,
          lot_id: input.lot_id,
          metier_id: input.metier_id,
          date,
          nb_pers: input.nb_pers,
          created_by: userId,
        }));
      const toUpdate = [...byDate.values()];

      if (toInsert.length) {
        const { error } = await supabase.from("atelier_planning").insert(toInsert);
        if (error) throw error;
      }
      if (toUpdate.length) {
        const { error } = await supabase
          .from("atelier_planning")
          .update({ nb_pers: input.nb_pers })
          .in("id", toUpdate);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  /**
   * Nommage (temps 2) : crée l'assignation via la source unique
   * `assignation-upsert.ts`, puis alimente `assignation_objets`.
   */
  const nommer = useMutation({
    mutationFn: async (input: {
      plan: PlanRow;
      employe_id: string;
      /** Objets à rattacher (l'objet de la ligne, ou tous ceux du lot). */
      objetIds: string[];
    }) => {
      const { data, error } = await insertAssignation({
        affaire_id: affaireId,
        employe_id: input.employe_id,
        date: input.plan.date,
        demi_journee: "JOURNEE",
        metier_id: input.plan.metier_id,
        atelier_planning_id: input.plan.id,
      });
      if (error) throw error;
      const assignationId = data?.id;
      if (assignationId && input.objetIds.length > 0) {
        const { data: userRes } = await supabase.auth.getUser();
        const { error: linkErr } = await supabase.from("assignation_objets").insert(
          input.objetIds.map((objet_id) => ({
            assignation_id: assignationId,
            objet_id,
            created_by: userRes.user?.id ?? null,
          })),
        );
        if (linkErr) throw linkErr;
      }
    },
    onSuccess: invalidate,
  });

  const denommer = useMutation({
    mutationFn: async (assignationId: string) => {
      const { error } = await supabase.from("assignations").delete().eq("id", assignationId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { query, setPers, poserPeriode, nommer, denommer, invalidate };
}

/** Assignations de la journée toutes affaires confondues (détection de conflit). */
export function useAssignationsDuJour(date: string | null) {
  return useQuery({
    queryKey: ["assignations-jour", date],
    enabled: !!date,
    queryFn: async (): Promise<(NommageRow & { affaire_numero: string | null })[]> => {
      const { data, error } = await supabase
        .from("assignations")
        .select("id, atelier_planning_id, employe_id, affaire_id, date, affaires(numero)")
        .eq("date", date!);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const { affaires, ...rest } = r as NommageRow & { affaires: { numero: string } | null };
        return { ...rest, affaire_numero: affaires?.numero ?? null };
      });
    },
  });
}

/** Employés d'un métier disponibles à une date (hors absents validés). */
export function useEmployesDisponibles(metierId: number | null, date: string | null) {
  return useQuery({
    queryKey: ["employes-disponibles", metierId, date],
    enabled: metierId != null && !!date,
    queryFn: async () => {
      const [empRes, metRes, absRes] = await Promise.all([
        supabase
          .from("employes")
          .select("id, nom, prenom, metier_principal_id, metiers_secondaires, type_contrat")
          .eq("actif", true)
          .eq("non_staffing", false)
          .order("nom"),
        supabase.from("employe_metiers").select("employe_id, metier_id").eq("metier_id", metierId!),
        supabase
          .from("absences")
          .select("employe_id, date_debut, date_fin, valide")
          .lte("date_debut", date!)
          .gte("date_fin", date!),
      ]);
      if (empRes.error) throw empRes.error;
      const secondaires = new Set((metRes.data ?? []).map((m) => m.employe_id));
      const employes = (empRes.data ?? []).filter(
        (e) =>
          e.metier_principal_id === metierId ||
          (e.metiers_secondaires ?? []).includes(metierId!) ||
          secondaires.has(e.id),
      );
      return { employes, absences: absRes.data ?? [] };
    },
  });
}

