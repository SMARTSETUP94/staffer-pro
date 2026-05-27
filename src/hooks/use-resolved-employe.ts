import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";

export interface ResolvedEmploye {
  id: string;
  prenom: string;
  nom: string;
}

/**
 * Résout l'employé "courant" pour les pages de l'espace employé.
 * - Si admin en preview employé avec un previewEmployeId choisi → utilise cet override.
 * - Sinon → lookup standard sur employes.profile_id = auth.uid().
 *
 * Permet à l'admin (qui n'a pas de fiche employé liée) de tester les flows
 * employé via le PreviewBanner en sélectionnant une fiche démo.
 */
export function useResolvedEmploye() {
  const { user } = useAuth();
  const { previewEmployeId, isEmployePreview } = usePreview();
  const [employe, setEmploye] = useState<ResolvedEmploye | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResolved(false);
    setLoading(true);

    async function run() {
      // Override preview prioritaire
      if (isEmployePreview && previewEmployeId) {
        const { data } = await supabase
          .from("employes")
          .select("id, prenom, nom")
          .eq("id", previewEmployeId)
          .maybeSingle();
        if (cancelled) return;
        setEmploye(data ? { id: data.id, prenom: data.prenom, nom: data.nom } : null);
        setLoading(false);
        setResolved(true);
        return;
      }
      if (!user) {
        setEmploye(null);
        setLoading(false);
        setResolved(true);
        return;
      }
      const { data } = await supabase
        .from("employes")
        .select("id, prenom, nom")
        .eq("profile_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setEmploye(data ? { id: data.id, prenom: data.prenom, nom: data.nom } : null);
      setLoading(false);
      setResolved(true);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [user, previewEmployeId, isEmployePreview]);

  return { employe, employeId: employe?.id ?? null, loading, resolved };
}
