import { useEffect, useState } from "react";
import { eachDayOfInterval, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Trajet, Vehicule } from "./use-vehicules";
import { aPermisCompatible, type Permis } from "@/lib/permis";

export function useTrajetsWeek(weekStart: Date, weekEnd: Date) {
  const [trajets, setTrajets] = useState<Trajet[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("trajets")
      .select("*")
      .gte("date", format(weekStart, "yyyy-MM-dd"))
      .lte("date", format(weekEnd, "yyyy-MM-dd"))
      .order("date")
      .order("heure_depart");
    if (!error) setTrajets((data as Trajet[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.getTime(), weekEnd.getTime()]);

  return { trajets, loading, refresh };
}

export function getDaysOfWeek(weekStart: Date, weekEnd: Date) {
  return eachDayOfInterval({ start: weekStart, end: weekEnd });
}

/**
 * Filtre les chauffeurs compatibles pour un véhicule donné.
 * v0.18.1 : ajout du filtrage par catégorie de permis (B / C / CE / D).
 *
 * - Sans véhicule : tout employé actif `est_livreur=true`
 * - VL / M3_20 : permis B (ou C / CE) requis
 * - Poids lourd : permis C ou CE requis ET autorisation explicite si présente dans
 *   `vehicule_chauffeurs_autorises` (le trigger DB exige cette autorisation pour les PL).
 *
 * `categories_permis` peut être absent pour rétrocompatibilité (anciennes fiches sans
 * permis renseigné) — dans ce cas on accepte tout livreur actif (comportement v0.18).
 */
export function getCompatibleChauffeurs<
  T extends {
    id: string;
    est_livreur: boolean;
    actif: boolean;
    categories_permis?: Permis[] | null;
  },
>(vehicule: Vehicule | null, livreurs: T[], autorisesIds: Set<string>): T[] {
  const baseLivreurs = livreurs.filter((l) => l.actif && l.est_livreur);
  if (!vehicule) return baseLivreurs;

  const filtreParPermis = (l: T) => {
    // Tolérance : si pas de permis renseigné, on n'exclut pas (rétrocompat v0.18)
    if (!l.categories_permis || l.categories_permis.length === 0) return true;
    return aPermisCompatible(vehicule.type, l.categories_permis);
  };

  if (vehicule.type === "poids_lourd") {
    return baseLivreurs.filter((l) => autorisesIds.has(l.id) && filtreParPermis(l));
  }
  return baseLivreurs.filter(filtreParPermis);
}

/**
 * v0.18.1 — Variante enrichie : retourne TOUS les livreurs actifs avec leur statut
 * de compatibilité pour le véhicule donné. Permet à l'UI d'afficher les non
 * autorisés en grisé avec une raison plutôt que de les masquer (UX plus claire :
 * "pourquoi Alberto n'apparaît pas ?" → réponse : "il n'est pas autorisé sur ce PL").
 *
 * Statut :
 * - "ok"            : compatible et autorisé, sélectionnable
 * - "permis_ko"     : permis incompatible avec le type véhicule
 * - "non_autorise"  : permis OK mais pas dans la liste des autorisés (PL uniquement)
 */
export type ChauffeurStatut = "ok" | "permis_ko" | "non_autorise";

export interface ChauffeurAvecStatut<T> {
  employe: T;
  statut: ChauffeurStatut;
  raison: string | null;
}

export function getChauffeursAvecStatut<
  T extends {
    id: string;
    est_livreur: boolean;
    actif: boolean;
    categories_permis?: Permis[] | null;
  },
>(
  vehicule: Vehicule | null,
  livreurs: T[],
  autorisesIds: Set<string>,
): ChauffeurAvecStatut<T>[] {
  const baseLivreurs = livreurs.filter((l) => l.actif && l.est_livreur);
  if (!vehicule) {
    return baseLivreurs.map((l) => ({ employe: l, statut: "ok", raison: null }));
  }

  return baseLivreurs.map<ChauffeurAvecStatut<T>>((l) => {
    const aPermis =
      !l.categories_permis ||
      l.categories_permis.length === 0 ||
      aPermisCompatible(vehicule.type, l.categories_permis);

    if (!aPermis) {
      return { employe: l, statut: "permis_ko", raison: "Permis non compatible" };
    }

    if (vehicule.type === "poids_lourd" && !autorisesIds.has(l.id)) {
      return {
        employe: l,
        statut: "non_autorise",
        raison: "À autoriser sur ce PL",
      };
    }

    return { employe: l, statut: "ok", raison: null };
  });
}
