import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import {
  shouldForceSetPassword,
  shouldRedirectToOnboarding,
  isOnboardingSkipped,
  markOnboardingSkipped,
} from "@/lib/auth-redirect-helpers";
import { resolvePostLoginTarget } from "@/lib/post-login-routing";
import { consumeCapDenied } from "@/lib/capability-guard";
import { toast } from "sonner";

export const Route = createFileRoute("/_app")({
  component: AppGuard,
});

// L4c (27 mai 2026) — La whitelist EMPLOYE_DESKTOP_ALLOWED a été supprimée.
// L'accès aux routes est désormais gouverné UNIQUEMENT par la matrice de
// capabilities via requireCapability() dans le beforeLoad de chaque route
// sensible. Voir mem://debts/audit-requirecapability-toutes-routes.

// v0.39.1 BUG #6 — anti-loop guard. Si AppGuard redirige vers /onboarding
// plus de N fois pendant la session courante, on stoppe la boucle, on marque
// `markOnboardingSkipped()` et on affiche un toast clair que Gabin peut
// transmettre. Évite un freeze/reload en boucle qui bloque tout premier accès.
const MAX_ONBOARDING_REDIRECTS = 3;

function AppGuard() {
  const navigate = useNavigate();
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const {
    user, loading, rolesLoaded,
    passwordSetDone, passwordSetAt, isInviteStatus, profileCompleted, roles,
  } = useAuth();
  const onboardingRedirectCountRef = useRef(0);


  const isChefOrAdmin = roles.includes("admin") || roles.includes("chef_chantier");
  const mustSetPassword = shouldForceSetPassword({
    isChefOrAdmin,
    passwordSetDone,
    passwordSetAt,
    isInviteStatus,
    profileCompleted,
  });

  useEffect(() => {
    if (loading || !rolesLoaded) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    // Set-password obligatoire (chef/admin OU tout invité fraîchement créé)
    if (mustSetPassword) {
      navigate({ to: "/auth/set-password" });
      return;
    }
    // Onboarding profil obligatoire (1ʳᵉ connexion)
    if (shouldRedirectToOnboarding({ profileCompleted, currentPath, skipped: isOnboardingSkipped() })) {
      onboardingRedirectCountRef.current += 1;
      if (onboardingRedirectCountRef.current > MAX_ONBOARDING_REDIRECTS) {
        console.error(
          "[AppGuard] Onboarding redirect loop detected — count=",
          onboardingRedirectCountRef.current,
          "profileCompleted=",
          profileCompleted,
          "currentPath=",
          currentPath,
        );
        markOnboardingSkipped();
        toast.error(
          "Boucle de redirection onboarding détectée. Profil libéré — vous pouvez compléter plus tard depuis le bandeau en haut de page.",
          { duration: 10_000 },
        );
        return;
      }
      navigate({ to: "/onboarding" });
      return;
    }
    onboardingRedirectCountRef.current = 0;
    // L4d — plus de whitelist côté layout, plus de routing mobile/desktop.
    // resolvePostLoginTarget() = constante /aujourdhui ; l'index s'en sert.
    // Ici on ne redirige plus depuis _app : requireCapability() côté route
    // protège l'accès.
    void resolvePostLoginTarget;
  }, [
    loading, rolesLoaded, user,
    mustSetPassword, profileCompleted, currentPath, navigate, roles,
  ]);

  // Lot 7.0b — toast "Accès refusé" après redirect depuis requireCapability().
  useEffect(() => {
    const denied = consumeCapDenied();
    if (denied) {
      toast.error("Accès refusé", {
        description: `Vous n'avez pas la permission requise (${denied}).`,
      });
    }
  }, [currentPath]);

  if (loading || !rolesLoaded || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }


  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
