import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";
import {
  type DashboardLayout,
  computePresetForRoles,
  sanitizeLayout,
  clampLayoutToRole,
} from "@/lib/dashboard/types";

interface UseDashboardLayoutResult {
  layout: DashboardLayout;
  loading: boolean;
  /** True si l'utilisateur n'a jamais sauvegardé (on affiche le preset rôle). */
  isPreset: boolean;
  saveLayout: (next: DashboardLayout) => Promise<void>;
  resetToPreset: () => Promise<void>;
}

/**
 * v0.27.4 — Hook unifié pour lire/écrire le layout dashboard.
 * - Fallback preset selon rôle EFFECTIF (preview admin pris en compte)
 * - Layout BDD systématiquement clampé au rôle effectif (defense in depth :
 *   un employé ne peut PAS voir un widget commerce même si le JSONB BDD
 *   en contient — couvre layout corrompu / changement de rôle / preview).
 * - Persistance JSONB via UPDATE profiles
 */
export function useDashboardLayout(): UseDashboardLayoutResult {
  const { user, roles, rolesLoaded } = useAuth();
  const { effectiveRole } = usePreview();
  const [layout, setLayout] = useState<DashboardLayout>({ visible: [] });
  const [isPreset, setIsPreset] = useState(true);
  const [loading, setLoading] = useState(true);

  const computePreset = useCallback((): DashboardLayout => {
    // En preview, on calcule le preset du rôle PREVIEW, pas du rôle réel.
    return { visible: computePresetForRoles([effectiveRole]) };
  }, [effectiveRole]);

  useEffect(() => {
    if (!user || !rolesLoaded) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("dashboard_layout")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const stored = sanitizeLayout((data as { dashboard_layout?: unknown } | null)?.dashboard_layout);
      if (stored && stored.visible.length > 0) {
        // GARDE-FOU : clamp au rôle effectif. Si le layout BDD contient des
        // widgets non autorisés (employé qui aurait kpi_top dans son JSONB),
        // on les retire silencieusement au rendu.
        setLayout(clampLayoutToRole(stored, effectiveRole));
        setIsPreset(false);
      } else {
        setLayout(computePreset());
        setIsPreset(true);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, rolesLoaded, computePreset, effectiveRole]);

  const saveLayout = useCallback(
    async (next: DashboardLayout) => {
      if (!user) return;
      // Au save aussi : on clampe pour empêcher de stocker un layout illégal.
      // Utilise le rôle RÉEL (roles), pas effectiveRole, pour qu'un admin en
      // preview employé ne corrompe pas son propre layout admin.
      const realRole = roles.includes("admin")
        ? "admin"
        : roles.includes("chef_chantier")
          ? "chef_chantier"
          : "employe";
      const clamped = clampLayoutToRole(next, realRole);
      setLayout(clamped);
      setIsPreset(false);
      await supabase
        .from("profiles")
        .update({ dashboard_layout: clamped as unknown as never })
        .eq("id", user.id);
    },
    [user, roles],
  );

  const resetToPreset = useCallback(async () => {
    if (!user) return;
    const preset = computePreset();
    setLayout(preset);
    setIsPreset(true);
    await supabase
      .from("profiles")
      .update({ dashboard_layout: null })
      .eq("id", user.id);
  }, [user, computePreset]);

  return { layout, loading, isPreset, saveLayout, resetToPreset };
}
