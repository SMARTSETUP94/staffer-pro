import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  type DashboardLayout,
  type WidgetId,
  computePresetForRoles,
  sanitizeLayout,
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
 * v0.26.0 — Hook unifié pour lire/écrire le layout dashboard.
 * - Fallback preset selon rôles si profiles.dashboard_layout est NULL
 * - Persistance JSONB via UPDATE profiles
 */
export function useDashboardLayout(): UseDashboardLayoutResult {
  const { user, roles, rolesLoaded } = useAuth();
  const [layout, setLayout] = useState<DashboardLayout>({ visible: [] });
  const [isPreset, setIsPreset] = useState(true);
  const [loading, setLoading] = useState(true);

  const computePreset = useCallback((): DashboardLayout => {
    return { visible: computePresetForRoles(roles) };
  }, [roles]);

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
        setLayout(stored);
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
  }, [user, rolesLoaded, computePreset]);

  const saveLayout = useCallback(
    async (next: DashboardLayout) => {
      if (!user) return;
      setLayout(next);
      setIsPreset(false);
      await supabase
        .from("profiles")
        .update({ dashboard_layout: next as unknown as never })
        .eq("id", user.id);
    },
    [user],
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
