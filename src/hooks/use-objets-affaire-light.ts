import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ObjetLight {
  id: string;
  reference: string;
  nom: string;
}

/**
 * Hook léger : liste des objets de fabrication non archivés d'une affaire.
 * Utilisé dans la modale de saisie d'heures pour le dropdown "Sur quoi as-tu travaillé ?".
 */
export function useObjetsAffaireLight(affaireId: string | null | undefined) {
  const [objets, setObjets] = useState<ObjetLight[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!affaireId) {
      setObjets([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void supabase
      .from("fabrication_objets")
      .select("id, reference, nom")
      .eq("affaire_id", affaireId)
      .eq("archive", false)
      .order("ordre", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setObjets((data ?? []) as ObjetLight[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [affaireId]);

  return { objets, loading };
}

/**
 * Hook : flags rôle fabrication du profil connecté (pour filtrer le dropdown étape).
 */
export interface FabRolesFlags {
  est_bureau_etude: boolean;
  est_respo_fab: boolean;
  est_finition: boolean;
  est_manutention: boolean;
}

export function useMyFabricationRoles() {
  const [flags, setFlags] = useState<FabRolesFlags>({
    est_bureau_etude: false,
    est_respo_fab: false,
    est_finition: false,
    est_manutention: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("est_bureau_etude, est_respo_fab, est_finition, est_manutention")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setFlags({
          est_bureau_etude: !!data.est_bureau_etude,
          est_respo_fab: !!data.est_respo_fab,
          est_finition: !!data.est_finition,
          est_manutention: !!data.est_manutention,
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { flags, loading };
}

/** Pure : étapes éligibles selon les flags rôle (utilisé en tests). */
export function getEligibleEtapesForRoles(flags: FabRolesFlags): Array<"be" | "respo_fab" | "finition" | "manutention"> {
  const out: Array<"be" | "respo_fab" | "finition" | "manutention"> = [];
  if (flags.est_bureau_etude) out.push("be");
  if (flags.est_respo_fab) out.push("respo_fab");
  if (flags.est_finition) out.push("finition");
  if (flags.est_manutention) out.push("manutention");
  return out;
}
