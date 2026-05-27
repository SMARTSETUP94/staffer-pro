import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FabricationEtapeType = "be" | "usinage" | "respo_fab" | "finition" | "manutention";
export type FabricationEtapeStatut = "a_faire" | "en_cours" | "termine" | "non_applicable";
export type FabricationFinitionType = "peinture" | "tapisserie" | "autre" | "aucune";

export const ETAPE_LABELS: Record<FabricationEtapeType, string> = {
  be: "BE",
  usinage: "Usinage Numérique",
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
export const ETAPE_TO_FLAG: Record<FabricationEtapeType, "est_chef_projet" | "est_respo_fab" | "est_finition" | "est_manutention" | "est_bureau_etude" | "est_usinage_numerique"> = {
  be: "est_bureau_etude",
  usinage: "est_usinage_numerique",
  respo_fab: "est_respo_fab",
  finition: "est_finition",
  manutention: "est_manutention",
};

/** Ordre canonique des 5 étapes (BE → Usinage → Respo Fab → Finition → Manutention) */
export const ETAPES_ORDER: FabricationEtapeType[] = ["be", "usinage", "respo_fab", "finition", "manutention"];

/** Métiers du devis Progbat (pour heures prévues par métier) */
export type FabMetier = "be" | "numerique" | "bois" | "metal" | "peinture" | "tapisserie" | "manutention";
export const FAB_METIERS: FabMetier[] = ["be", "numerique", "bois", "metal", "peinture", "tapisserie", "manutention"];
export const FAB_METIER_LABELS: Record<FabMetier, string> = {
  be: "BE",
  numerique: "Usinage Num",
  bois: "Bois",
  metal: "Métal",
  peinture: "Peinture",
  tapisserie: "Tapisserie",
  manutention: "Manutention",
};

/** Mapping métier devis → étape fabrication (mirror SQL etape_for_metier) */
export function etapeForMetier(metier: FabMetier): FabricationEtapeType | null {
  switch (metier) {
    case "be": return "be";
    case "numerique": return "usinage";
    case "bois": return "respo_fab";
    case "metal": return "respo_fab";
    case "peinture": return "finition";
    case "tapisserie": return "finition";
    case "manutention": return "manutention";
    default: return null;
  }
}

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
  a_dessiner: boolean;
  a_usiner: boolean;
  a_construire: boolean;
  est_brut: boolean;
  a_emballer: boolean;
  // v0.22 — heures prévues par métier (issues du devis)
  heures_prevues_be: number;
  heures_prevues_numerique: number;
  heures_prevues_bois: number;
  heures_prevues_metal: number;
  heures_prevues_peinture: number;
  heures_prevues_tapisserie: number;
  heures_prevues_manutention: number;
  budget_materiaux: number;
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
  est_bureau_etude: boolean;
  est_usinage_numerique: boolean;
  /** L3a — true si le profil possède la capability `casting.edit_phase_fabrication`. */
  has_cap_fab_edit: boolean;
}

/**
 * L3a — Double-filtre fabrication : un profil n'est éligible à une étape que si
 * il a le flag métier ET la capability `casting.edit_phase_fabrication`.
 * Garde-fou contre une incohérence DB (ex: flag activé mais rôle sans cap).
 */
export function isEligibleForEtape(
  p: ProfileRole,
  etape: FabricationEtapeType,
): boolean {
  const flag = ETAPE_TO_FLAG[etape];
  return Boolean(p[flag]) && p.has_cap_fab_edit;
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
      .select("id, affaire_id, devis_id, reference, nom, quantite, respo_fab_id, type_finition, commentaire, ordre, archive, created_at, a_dessiner, a_usiner, a_construire, est_brut, a_emballer, heures_prevues_be, heures_prevues_numerique, heures_prevues_bois, heures_prevues_metal, heures_prevues_peinture, heures_prevues_tapisserie, heures_prevues_manutention, budget_materiaux")
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
      heures_prevues_be: Number(o.heures_prevues_be ?? 0),
      heures_prevues_numerique: Number(o.heures_prevues_numerique ?? 0),
      heures_prevues_bois: Number(o.heures_prevues_bois ?? 0),
      heures_prevues_metal: Number(o.heures_prevues_metal ?? 0),
      heures_prevues_peinture: Number(o.heures_prevues_peinture ?? 0),
      heures_prevues_tapisserie: Number(o.heures_prevues_tapisserie ?? 0),
      heures_prevues_manutention: Number(o.heures_prevues_manutention ?? 0),
      budget_materiaux: Number(o.budget_materiaux ?? 0),
      respo_fab_name: o.respo_fab_id ? nameMap.get(o.respo_fab_id) ?? null : null,
      etapes: (etapes ?? [])
        .filter((e) => e.objet_id === o.id)
        .map((e) => ({
          ...e,
          assignee_name: e.assignee_id ? nameMap.get(e.assignee_id) ?? null : null,
        }))
        .sort((a, b) => ETAPES_ORDER.indexOf(a.type_etape) - ETAPES_ORDER.indexOf(b.type_etape)),
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
    const [profilesQ, capsQ] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, email, est_chef_projet, est_respo_fab, est_finition, est_manutention, est_bureau_etude, est_usinage_numerique",
        )
        .order("full_name", { ascending: true, nullsFirst: false }),
      // L3a — Profils ayant la cap `casting.edit_phase_fabrication`
      // via au moins un de leurs rôles (jointure user_roles × role_capabilities).
      supabase
        .from("user_roles")
        .select("user_id, role_capabilities!inner(capability, granted)")
        .eq("role_capabilities.capability", "casting.edit_phase_fabrication")
        .eq("role_capabilities.granted", true),
    ]);

    const capUserIds = new Set<string>(
      (capsQ.data ?? []).map((r: { user_id: string }) => r.user_id),
    );
    const profiles: ProfileRole[] = (profilesQ.data ?? []).map((p) => ({
      ...(p as Omit<ProfileRole, "has_cap_fab_edit">),
      has_cap_fab_edit: capUserIds.has(p.id),
    }));
    setProfiles(profiles);
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
