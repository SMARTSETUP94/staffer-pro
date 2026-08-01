import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ChargeDetailRow, ChargeMetier } from "@/lib/charge-atelier";

export interface ChargeAtelierData {
  metiers: ChargeMetier[];
  rows: ChargeDetailRow[];
  affaires: { id: string; numero: string; nom: string; prospect: boolean }[];
}

export const chargeAtelierKey = (from: string, to: string) =>
  ["charge-atelier", from, to] as const;

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

  const [affairesRes, objetsRes, lotsRes, stRes, assignRes] = await Promise.all([
    supabase.from("affaires").select("id, numero, nom, phase, statut").in("id", affaireIds),
    objetIds.length
      ? supabase.from("fabrication_objets").select("id, reference, nom").in("id", objetIds)
      : Promise.resolve({ data: [] }),
    lotIds.length
      ? supabase.from("fabrication_lots").select("id, nom").in("id", lotIds)
      : Promise.resolve({ data: [] }),
    objetIds.length
      ? supabase
          .from("objet_heures_metier")
          .select("objet_id, metier_id, sous_traitance")
          .in("objet_id", objetIds)
          .eq("sous_traitance", true)
      : Promise.resolve({ data: [] }),
    supabase
      .from("assignations")
      .select("id, atelier_planning_id, employe_id, employes(nom, prenom)")
      .in("atelier_planning_id", planIds),
  ]);

  type AffaireRow = { id: string; numero: string | null; nom: string | null; phase: string | null; statut: string | null };
  const affaireById = new Map(
    ((affairesRes.data ?? []) as AffaireRow[]).map((a) => [a.id, a]),
  );
  const objetById = new Map(
    ((objetsRes.data ?? []) as { id: string; reference: string | null; nom: string | null }[]).map(
      (o) => [o.id, o],
    ),
  );
  const lotById = new Map(
    ((lotsRes.data ?? []) as { id: string; nom: string | null }[]).map((l) => [l.id, l]),
  );
  const stSet = new Set(
    ((stRes.data ?? []) as { objet_id: string; metier_id: number }[]).map(
      (s) => `${s.objet_id}|${s.metier_id}`,
    ),
  );

  const nommesParPlan = new Map<string, { id: string; nom: string }[]>();
  type AssignRow = {
    id: string;
    atelier_planning_id: string | null;
    employe_id: string;
    employes: { nom: string | null; prenom: string | null } | null;
  };
  for (const a of (assignRes.data ?? []) as unknown as AssignRow[]) {
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

export function useChargeAtelier(from: string, to: string) {
  return useQuery({
    queryKey: chargeAtelierKey(from, to),
    queryFn: () => fetchChargeAtelier(from, to),
    staleTime: 60_000,
  });
}
