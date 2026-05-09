import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
 * v0.27.6 — Hook unifié pour lire/écrire le layout dashboard.
 * - Fallback preset selon rôle EFFECTIF UNIQUEMENT si dashboard_layout est NULL
 *   en BDD (=jamais sauvegardé). Un layout sauvegardé même vide (visible=[])
 *   est respecté : l'utilisateur a explicitement décoché tous les widgets.
 * - Layout BDD systématiquement clampé au rôle effectif (defense in depth).
 * - Persistance JSONB via UPDATE profiles + try/catch + toast erreur visible
 *   + rollback UI en cas d'échec (plus d'échec silencieux).
 */
export function useDashboardLayout(): UseDashboardLayoutResult {
  const { user, roles, rolesLoaded } = useAuth();
  const { effectiveRole } = usePreview();
  const [layout, setLayout] = useState<DashboardLayout>({ visible: [] });
  const [isPreset, setIsPreset] = useState(true);
  const [loading, setLoading] = useState(true);

  const computePreset = useCallback((): DashboardLayout => {
    return { visible: computePresetForRoles([effectiveRole]) };
  }, [effectiveRole]);

  useEffect(() => {
    if (!user || !rolesLoaded) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("dashboard_layout")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error("[useDashboardLayout] load error:", error);
      }
      const rawLayout = (data as { dashboard_layout?: unknown } | null)?.dashboard_layout;
      const stored = sanitizeLayout(rawLayout);
      // FIX v0.27.6 : on distingue "jamais sauvegardé" (rawLayout null/undefined)
      // de "sauvegardé vide" (stored.visible.length === 0). Un user qui décoche
      // tout doit voir un dashboard vide, pas le preset par défaut.
      if (rawLayout != null && stored) {
        // Merge new preset widgets that didn't exist when user saved layout (auto-append).
        const preset = computePresetForRoles([effectiveRole]);
        const knownIds = new Set([...stored.visible, ...(stored.hidden ?? [])]);
        const missing = preset.filter((id) => !knownIds.has(id));
        const merged = { ...stored, visible: [...stored.visible, ...missing] };
        setLayout(clampLayoutToRole(merged, effectiveRole));
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
      const realRole = roles.includes("admin")
        ? "admin"
        : roles.includes("chef_chantier")
          ? "chef_chantier"
          : "employe";
      const clamped = clampLayoutToRole(next, realRole);
      // Optimistic update
      const previousLayout = layout;
      const previousIsPreset = isPreset;
      setLayout(clamped);
      setIsPreset(false);
      const { error } = await supabase
        .from("profiles")
        .update({ dashboard_layout: clamped as unknown as never })
        .eq("id", user.id);
      if (error) {
        // Rollback + log + toast
        console.error("[useDashboardLayout] save error:", error);
        setLayout(previousLayout);
        setIsPreset(previousIsPreset);
        toast.error("Erreur de sauvegarde, vérifiez votre connexion ou réessayez.");
        throw error;
      }
    },
    [user, roles, layout, isPreset],
  );

  const resetToPreset = useCallback(async () => {
    if (!user) return;
    const preset = computePreset();
    const previousLayout = layout;
    const previousIsPreset = isPreset;
    setLayout(preset);
    setIsPreset(true);
    const { error } = await supabase
      .from("profiles")
      .update({ dashboard_layout: null })
      .eq("id", user.id);
    if (error) {
      console.error("[useDashboardLayout] reset error:", error);
      setLayout(previousLayout);
      setIsPreset(previousIsPreset);
      toast.error("Erreur de réinitialisation, réessayez.");
      throw error;
    }
  }, [user, computePreset, layout, isPreset]);

  return { layout, loading, isPreset, saveLayout, resetToPreset };
}
