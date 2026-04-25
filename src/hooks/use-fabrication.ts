import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FabricationEtapeType = "be" | "respo_fab" | "finition" | "manutention";
export type FabricationEtapeStatut = "a_faire" | "en_cours" | "termine" | "non_applicable";
export type FabricationFinitionType = "peinture" | "tapisserie" | "autre" | "aucune";

export const ETAPE_LABELS: Record<FabricationEtapeType, string> = {
  be: "BE",
  respo_fab: "Respo Fab",
  finition: "Finition",
  manutention: "Manutention",
};

export const STATUT_LABELS: Record<FabricationEtapeStatut, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  termine: "Terminé",
  non_applicable: "Non applicable",
};

export const STATUT_ICONS: Record<FabricationEtapeStatut, string> = {
  a_faire: "⬜",
  en_cours: "🔄",
  termine: "✅",
  non_applicable: "—",
};

export const FINITION_LABELS: Record<FabricationFinitionType, string> = {
  peinture: "Peinture",
  tapisserie: "Tapisserie",
  autre: "Autre",
  aucune: "Aucune",
};

/** Mapping étape → flag rôle profile pour filtrer les assignees éligibles */
export const ETAPE_TO_FLAG: Record<FabricationEtapeType, "est_chef_projet" | "est_respo_fab" | "est_finition" | "est_manutention" | "est_bureau_etude"> = {
  be: "est_bureau_etude",
  respo_fab: "est_respo_fab",
  finition: "est_finition",
  manutention: "est_manutention",
};

export interface FabricationEtape {
  id: string;
  objet_id: string;
  type_etape: FabricationEtapeType;
  statut: FabricationEtapeStatut;
  assignee_id: string | null;
  assignee_name: string | null;
  validateur_id: string | null;
  date_debut: string | null;
  date_fin: string | null;
  commentaire: string | null;
}

export interface FabricationObjet {
  id: string;
  affaire_id: string;
  devis_id: string | null;
  reference: string;
  nom: string;
  quantite: number;
  respo_fab_id: string | null;
  respo_fab_name: string | null;
  type_finition: FabricationFinitionType;
  commentaire: string | null;
  ordre: number;
  archive: boolean;
  created_at: string;
  etapes: FabricationEtape[];
}

export interface ProfileRole {
  id: string;
  full_name: string | null;
  email: string;
  est_chef_projet: boolean;
  est_respo_fab: boolean;
  est_finition: boolean;
  est_manutention: boolean;
}

/**
 * Hook : liste des objets de fabrication d'une affaire avec leurs 4 étapes.
 */
export function useFabricationObjets(affaireId: string | undefined) {
  const [objets, setObjets] = useState<FabricationObjet[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!affaireId) {
      setObjets([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: objs, error: objErr } = await supabase
      .from("fabrication_objets")
      .select("id, affaire_id, devis_id, reference, nom, quantite, respo_fab_id, type_finition, commentaire, ordre, archive, created_at")
      .eq("affaire_id", affaireId)
      .eq("archive", false)
      .order("ordre", { ascending: true })
      .order("created_at", { ascending: true });

    if (objErr || !objs) {
      setObjets([]);
      setLoading(false);
      return;
    }

    const ids = objs.map((o) => o.id);
    const { data: etapes } = ids.length
      ? await supabase
          .from("fabrication_etapes")
          .select("id, objet_id, type_etape, statut, assignee_id, validateur_id, date_debut, date_fin, commentaire")
          .in("objet_id", ids)
      : { data: [] as never[] };

    // Fetch profile names for respo_fab and assignees
    const profileIds = new Set<string>();
    objs.forEach((o) => o.respo_fab_id && profileIds.add(o.respo_fab_id));
    (etapes ?? []).forEach((e) => e.assignee_id && profileIds.add(e.assignee_id));

    const { data: profiles } = profileIds.size
      ? await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", Array.from(profileIds))
      : { data: [] as { id: string; full_name: string | null; email: string }[] };

    const nameMap = new Map<string, string>();
    (profiles ?? []).forEach((p) => {
      nameMap.set(p.id, p.full_name || p.email || p.id.slice(0, 8));
    });

    const merged: FabricationObjet[] = objs.map((o) => ({
      ...o,
      respo_fab_name: o.respo_fab_id ? nameMap.get(o.respo_fab_id) ?? null : null,
      etapes: (etapes ?? [])
        .filter((e) => e.objet_id === o.id)
        .map((e) => ({
          ...e,
          assignee_name: e.assignee_id ? nameMap.get(e.assignee_id) ?? null : null,
        }))
        .sort((a, b) => {
          const order: FabricationEtapeType[] = ["be", "respo_fab", "finition", "manutention"];
          return order.indexOf(a.type_etape) - order.indexOf(b.type_etape);
        }),
    }));

    setObjets(merged);
    setLoading(false);
  }, [affaireId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { objets, loading, reload };
}

/**
 * Hook : profils avec leurs flags rôles fabrication (pour dropdowns assignees).
 */
export function useProfilesWithRoles() {
  const [profiles, setProfiles] = useState<ProfileRole[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, est_chef_projet, est_respo_fab, est_finition, est_manutention")
      .order("full_name", { ascending: true, nullsFirst: false });
    setProfiles((data ?? []) as ProfileRole[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { profiles, loading, reload };
}

/** Calcule l'avancement d'un objet (étapes terminées ou non applicables / total). */
export function calcAvancementObjet(objet: FabricationObjet): number {
  if (!objet.etapes.length) return 0;
  const done = objet.etapes.filter((e) => e.statut === "termine" || e.statut === "non_applicable").length;
  return Math.round((done / objet.etapes.length) * 100);
}

/** Calcule l'avancement global d'une affaire. */
export function calcAvancementAffaire(objets: FabricationObjet[]): number {
  const allEtapes = objets.flatMap((o) => o.etapes);
  if (!allEtapes.length) return 0;
  const done = allEtapes.filter((e) => e.statut === "termine" || e.statut === "non_applicable").length;
  return Math.round((done / allEtapes.length) * 100);
}
