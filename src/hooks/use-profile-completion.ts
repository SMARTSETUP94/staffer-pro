import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  computeProfileCompletion,
  isProfileComplete,
  type ProfileForCompleteness,
} from "@/lib/onboarding-schemas";

const FIELDS = [
  "telephone",
  "adresse_rue",
  "adresse_code_postal",
  "adresse_ville",
  "contact_urgence_nom",
  "contact_urgence_telephone",
  "rgpd_consent_at",
  "profile_completed_at",
] as const;

interface ProfileSnapshot extends ProfileForCompleteness {
  profile_completed_at?: string | null;
}

export function useProfileCompletion() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select(FIELDS.join(","))
      .eq("id", user.id)
      .maybeSingle<ProfileSnapshot>();
    setProfile(data ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const completed = Boolean(profile?.profile_completed_at);
  const complete = isProfileComplete(profile);
  const percent = computeProfileCompletion(profile);

  return { profile, loading, completed, complete, percent, refresh };
}
