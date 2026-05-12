import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";
import { isAuthHashPresent } from "@/lib/auth-redirect-helpers";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();
  const { user, loading, rolesLoaded, isAdminOrChef, isAdmin } = useAuth();
  const { effIsMobile, effIsAdminOrChef, isPreviewing } = usePreview();
  const [hashRedirectChecked, setHashRedirectChecked] = useState(false);

  // FIX v0.26.1 : si la racine reçoit un hash de lien d'invitation/recovery,
  // on redirige vers /auth/set-password en préservant le hash AVANT que
  // detectSessionInUrl ne consomme la session sur la mauvaise route.
  useEffect(() => {
    if (typeof window === "undefined") {
      setHashRedirectChecked(true);
      return;
    }
    const hash = window.location.hash;
    if (isAuthHashPresent(hash)) {
      // window.location.assign préserve le hash dans l'URL cible
      window.location.replace(`/auth/set-password${hash}`);
      return; // pas besoin de setHashRedirectChecked, on quitte la page
    }
    setHashRedirectChecked(true);
  }, []);

  useEffect(() => {
    if (!hashRedirectChecked) return;
    if (loading || !rolesLoaded) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (effIsMobile && (!isAdmin || isPreviewing)) {
      // v0.46.2 : admin réel → toujours /dashboard desktop sur smartphone.
      // Seuls les vrais non-admins (ou un admin en mode preview) basculent mobile.
      navigate({ to: effIsAdminOrChef ? "/mobile/chef/dashboard" : "/mobile/aujourdhui" });
      return;
    }
    if (isAdminOrChef) {
      navigate({ to: "/dashboard" });
    } else {
      // v0.27.5 : employé desktop → /ma-semaine (pas /dashboard pour anti-fuite RGPD)
      navigate({ to: "/ma-semaine" });
    }
  }, [hashRedirectChecked, loading, rolesLoaded, user, isAdminOrChef, isAdmin, effIsMobile, effIsAdminOrChef, isPreviewing, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
