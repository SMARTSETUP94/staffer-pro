import { useEffect } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ChargeDetailRow, ChargeMetier } from "@/lib/charge-atelier";

export interface ChargeAtelierData {
  metiers: ChargeMetier[];
  rows: ChargeDetailRow[];
  affaires: { id: string; numero: string; nom: string; prospect: boolean }[];
}

export const chargeAtelierKey = (from: string, to: string) =>
  ["charge-atelier", from, to] as const;

/** Découpe les listes d'IDs pour éviter les URL trop longues quand il y a beaucoup de chantiers. */
const CHUNK = 200;
function chunks<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function selectIn<T>(
  run: (ids: string[]) => PromiseLike<{ data: T[] | null }>,
  ids: string[],
): Promise<T[]> {
  if (ids.length === 0) return [];
  const parts = await Promise.all(chunks(ids).map((c) => run(c)));
  return parts.flatMap((p) => p.data ?? []);
}

async function fetchChargeAtelier(from: string, to: string): Promise<ChargeAtelierData> {
  const [metiersRes, plansRes] = await Promise.all([
    supabase.from("metiers").select("id, libelle, couleur, ordre, capacite_jour").order("ordre"),
    supabase
      .from("atelier_planning")
      .select("id, date, metier_id, nb_pers, affaire_id, objet_id, lot_id")
      .gte("date", from)
      .lte("date", to)
      .gt("nb_pers", 0),
  ]);

  const metiers = (metiersRes.data ?? []) as ChargeMetier[];
  const plans = plansRes.data ?? [];
  if (plans.length === 0) return { metiers, rows: [], affaires: [] };

  const planIds = plans.map((p) => p.id);
  const affaireIds = [...new Set(plans.map((p) => p.affaire_id))];
  const objetIds = [...new Set(plans.map((p) => p.objet_id).filter(Boolean))] as string[];
  const lotIds = [...new Set(plans.map((p) => p.lot_id).filter(Boolean))] as string[];

  type AffaireRow = {
    id: string; numero: string | null; nom: string | null; phase: string | null; statut: string | null;
  };
  type ObjetRow = { id: string; reference: string | null; nom: string | null };
  type LotRow = { id: string; nom: string | null };
  type StRow = { objet_id: string; metier_id: number };
  type AssignRow = {
    id: string;
    atelier_planning_id: string | null;
    employe_id: string;
    employes: { nom: string | null; prenom: string | null } | null;
  };

  const [affairesData, objetsData, lotsData, stData, assignData] = await Promise.all([
    selectIn<AffaireRow>(
      (ids) => supabase.from("affaires").select("id, numero, nom, phase, statut").in("id", ids),
      affaireIds,
    ),
    selectIn<ObjetRow>(
      (ids) => supabase.from("fabrication_objets").select("id, reference, nom").in("id", ids),
      objetIds,
    ),
    selectIn<LotRow>(
      (ids) => supabase.from("fabrication_lots").select("id, nom").in("id", ids),
      lotIds,
    ),
    selectIn<StRow>(
      (ids) =>
        supabase
          .from("objet_heures_metier")
          .select("objet_id, metier_id, sous_traitance")
          .in("objet_id", ids)
          .eq("sous_traitance", true),
      objetIds,
    ),
    selectIn<AssignRow>(
      (ids) =>
        supabase
          .from("assignations")
          .select("id, atelier_planning_id, employe_id, employes(nom, prenom)")
          .in("atelier_planning_id", ids) as unknown as PromiseLike<{ data: AssignRow[] | null }>,
      planIds,
    ),
  ]);

  const affaireById = new Map(affairesData.map((a) => [a.id, a]));
  const objetById = new Map(objetsData.map((o) => [o.id, o]));
  const lotById = new Map(lotsData.map((l) => [l.id, l]));
  const stSet = new Set(stData.map((s) => `${s.objet_id}|${s.metier_id}`));

  const nommesParPlan = new Map<string, { id: string; nom: string }[]>();
  for (const a of assignData) {
    if (!a.atelier_planning_id) continue;
    const list = nommesParPlan.get(a.atelier_planning_id) ?? [];
    list.push({
      id: a.employe_id,
      nom: `${a.employes?.prenom ?? ""} ${a.employes?.nom ?? ""}`.trim() || "Employé",
    });
    nommesParPlan.set(a.atelier_planning_id, list);
  }

  const isProspect = (a?: AffaireRow) =>
    a?.phase === "opportunite" || a?.statut === "prospect";

  const rows: ChargeDetailRow[] = plans.map((p) => {
    const affaire = affaireById.get(p.affaire_id);
    const objet = p.objet_id ? objetById.get(p.objet_id) : undefined;
    const lot = p.lot_id ? lotById.get(p.lot_id) : undefined;
    return {
      plan_id: p.id,
      date: p.date,
      metier_id: p.metier_id,
      nb_pers: p.nb_pers,
      affaire_id: p.affaire_id,
      affaire_numero: affaire?.numero ?? "—",
      affaire_nom: affaire?.nom ?? "Sans nom",
      prospect: isProspect(affaire),
      objet_id: p.objet_id,
      objet_label: objet
        ? `${objet.reference ? `${objet.reference} — ` : ""}${objet.nom ?? ""}`.trim()
        : null,
      lot_id: p.lot_id,
      lot_label: lot?.nom ?? null,
      sous_traitance: p.objet_id ? stSet.has(`${p.objet_id}|${p.metier_id}`) : false,
      nommes: nommesParPlan.get(p.id) ?? [],
    };
  });

  const affaires = [...affaireById.values()]
    .map((a) => ({
      id: a.id,
      numero: a.numero ?? "—",
      nom: a.nom ?? "Sans nom",
      prospect: isProspect(a),
    }))
    .sort((a, b) => a.numero.localeCompare(b.numero));

  return { metiers, rows, affaires };
}

export const chargeAtelierQueryOptions = (from: string, to: string) => ({
  queryKey: chargeAtelierKey(from, to),
  queryFn: () => fetchChargeAtelier(from, to),
  staleTime: 60_000,
  gcTime: 10 * 60_000,
});

export function useChargeAtelier(from: string, to: string) {
  return useQuery({
    ...chargeAtelierQueryOptions(from, to),
    // Garde la matrice précédente à l'écran pendant le chargement de la fenêtre suivante.
    placeholderData: keepPreviousData,
  });
}

/**
 * Précharge en arrière-plan les fenêtres adjacentes (période précédente / suivante)
 * pour que la navigation soit instantanée.
 */
export function usePrefetchChargeAtelier(windows: { from: string; to: string }[]) {
  const qc = useQueryClient();
  const signature = windows.map((w) => `${w.from}:${w.to}`).join("|");
  useEffect(() => {
    const t = window.setTimeout(() => {
      for (const w of windows) void qc.prefetchQuery(chargeAtelierQueryOptions(w.from, w.to));
    }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, qc]);
}
