/**
 * v0.41.0b — Sprint 3b.3 + 3b.4 : helpers historique & stats trajets.
 *
 * - filterTrajets : filtres combinés (dates, véhicule, prestataire, statut, affaire, catégorie).
 * - computeFlotteStats : agrégats (totaux km, sous-traitance, top transporteurs, par catégorie/véhicule).
 *
 * Pure fonctionnel pour faciliter les tests Vitest.
 */
import type { Tables } from "@/integrations/supabase/types";

export type Trajet = Tables<"trajets">;
export type Vehicule = Tables<"vehicules">;

export interface TrajetFilters {
  dateFrom?: string | null; // YYYY-MM-DD
  dateTo?: string | null;
  vehiculeId?: string | null;
  prestataire?: string | null; // partial match (lowercased)
  statut?: Trajet["statut_soustraitance"] | null;
  affaireId?: string | null;
  categorie?: Trajet["categorie"] | null;
  query?: string | null; // free text on adresses + reference
}

export function filterTrajets(trajets: Trajet[], filters: TrajetFilters): Trajet[] {
  const q = filters.query?.trim().toLowerCase() ?? "";
  const presta = filters.prestataire?.trim().toLowerCase() ?? "";
  return trajets.filter((t) => {
    if (filters.dateFrom && t.date < filters.dateFrom) return false;
    if (filters.dateTo && t.date > filters.dateTo) return false;
    if (filters.vehiculeId && t.vehicule_id !== filters.vehiculeId) return false;
    if (filters.statut && t.statut_soustraitance !== filters.statut) return false;
    if (filters.affaireId && t.affaire_id !== filters.affaireId) return false;
    if (filters.categorie && t.categorie !== filters.categorie) return false;
    if (presta) {
      const p = (t.prestataire ?? "").toLowerCase();
      if (!p.includes(presta)) return false;
    }
    if (q) {
      const blob = [t.reference, t.adresse_depart, t.adresse_arrivee, t.notes, t.prestataire]
        .filter(Boolean).join(" ").toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

export interface FlotteStats {
  totalTrajets: number;
  totalKm: number;
  totalSousTraites: number;
  totalConfirmes: number;
  totalEurEngages: number;
  parCategorie: { categorie: Trajet["categorie"]; count: number; km: number }[];
  parStatut: { statut: Trajet["statut_soustraitance"]; count: number }[];
  topTransporteurs: { prestataire: string; count: number; km: number }[];
  parVehicule: { vehiculeId: string; nom: string; count: number; km: number }[];
}

const CATEGORIES: Trajet["categorie"][] = [
  "pose", "depose", "livraison_fourniture", "recuperation_materiel", "autre",
];
const STATUTS: Trajet["statut_soustraitance"][] = [
  "non", "a_sous_traiter", "devis_envoye", "confirme",
];

export function computeFlotteStats(
  trajets: Trajet[],
  vehicules: Vehicule[],
  tarifsParPresta: Map<string, number> = new Map(),
): FlotteStats {
  const vehById = new Map(vehicules.map((v) => [v.id, v]));
  const totalKm = trajets.reduce((s, t) => s + (t.kilometrage ?? 0), 0);
  const sousTraites = trajets.filter((t) => t.statut_soustraitance !== "non");
  const confirmes = trajets.filter((t) => t.statut_soustraitance === "confirme");

  // € engagés : tarif_km × km pour les confirmés (si tarif disponible)
  let totalEur = 0;
  for (const t of confirmes) {
    if (!t.kilometrage || !t.prestataire) continue;
    const tarif = tarifsParPresta.get(t.prestataire.toLowerCase());
    if (tarif) totalEur += tarif * t.kilometrage;
  }

  const parCategorie = CATEGORIES.map((cat) => {
    const sub = trajets.filter((t) => t.categorie === cat);
    return {
      categorie: cat,
      count: sub.length,
      km: sub.reduce((s, t) => s + (t.kilometrage ?? 0), 0),
    };
  }).filter((r) => r.count > 0);

  const parStatut = STATUTS.map((s) => ({
    statut: s,
    count: trajets.filter((t) => t.statut_soustraitance === s).length,
  })).filter((r) => r.count > 0);

  const transpoMap = new Map<string, { count: number; km: number }>();
  for (const t of sousTraites) {
    const p = (t.prestataire ?? "").trim();
    if (!p) continue;
    const cur = transpoMap.get(p) ?? { count: 0, km: 0 };
    cur.count += 1;
    cur.km += t.kilometrage ?? 0;
    transpoMap.set(p, cur);
  }
  const topTransporteurs = Array.from(transpoMap.entries())
    .map(([prestataire, v]) => ({ prestataire, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const vehMap = new Map<string, { count: number; km: number }>();
  for (const t of trajets) {
    if (!t.vehicule_id) continue;
    const cur = vehMap.get(t.vehicule_id) ?? { count: 0, km: 0 };
    cur.count += 1;
    cur.km += t.kilometrage ?? 0;
    vehMap.set(t.vehicule_id, cur);
  }
  const parVehicule = Array.from(vehMap.entries())
    .map(([vehiculeId, v]) => ({
      vehiculeId,
      nom: vehById.get(vehiculeId)?.nom ?? "Véhicule supprimé",
      ...v,
    }))
    .sort((a, b) => b.km - a.km)
    .slice(0, 10);

  return {
    totalTrajets: trajets.length,
    totalKm,
    totalSousTraites: sousTraites.length,
    totalConfirmes: confirmes.length,
    totalEurEngages: totalEur,
    parCategorie,
    parStatut,
    topTransporteurs,
    parVehicule,
  };
}

export const CATEGORIE_LABEL: Record<Trajet["categorie"], string> = {
  pose: "Pose",
  depose: "Dépose",
  livraison_fourniture: "Livraison",
  recuperation_materiel: "Récupération",
  autre: "Autre",
};

export const STATUT_LABEL: Record<Trajet["statut_soustraitance"], string> = {
  non: "Interne",
  a_sous_traiter: "À sous-traiter",
  devis_envoye: "Devis envoyé",
  confirme: "Confirmé",
};
