import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";
import { AppLayout } from "@/components/AppLayout";
import {
  shouldForceSetPassword,
  shouldRedirectToOnboarding,
  isOnboardingSkipped,
  markOnboardingSkipped,
} from "@/lib/auth-redirect-helpers";
import { toast } from "sonner";

export const Route = createFileRoute("/_app")({
  component: AppGuard,
});

// Pages accessibles à un employé en desktop (vue restreinte)
const EMPLOYE_DESKTOP_ALLOWED = [
  "/dashboard",
  "/dashboard-employe",
  "/ma-semaine",
  "/mes-heures",
  "/mes-swaps",
  "/mes-propositions",
  "/fabrication",
];

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
    user, loading, rolesLoaded, isAdminOrChef,
    passwordSetDone, passwordSetAt, isInviteStatus, profileCompleted, roles,
  } = useAuth();
  const { effIsMobile, effIsAdminOrChef } = usePreview();
  const onboardingRedirectCountRef = useRef(0);

  const isEmployeAllowedPath = EMPLOYE_DESKTOP_ALLOWED.some(
    (p) => currentPath === p || currentPath.startsWith(p + "/"),
  );

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
        // Boucle détectée : on libère + bannière permanente via skip flag.
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
    // Reset compteur dès qu'on ne redirige PLUS vers /onboarding
    onboardingRedirectCountRef.current = 0;
    // Mobile (vrai smartphone OU preview "Employé/Chef mobile") -> bascule mobile.
    // v0.46 : route vers /mobile/chef/dashboard pour les chefs/admin, sinon /mobile/aujourdhui.
    if (effIsMobile) {
      if (!currentPath.startsWith("/mobile/")) {
        navigate({ to: effIsAdminOrChef ? "/mobile/chef/dashboard" : "/mobile/aujourdhui" });
        return;
      }
    }
    // Pas admin/chef sur desktop : autorisé uniquement sur les pages employé.
    // v0.27.5 : redirige vers /ma-semaine (route sémantique employé) plutôt
    // que /dashboard pour éviter toute confusion avec la vue admin et
    // matérialiser dans l'URL le périmètre employé.
    if (!effIsAdminOrChef && !isEmployeAllowedPath) {
      navigate({ to: "/ma-semaine" });
    }
  }, [
    loading, rolesLoaded, user, isAdminOrChef, effIsAdminOrChef,
    effIsMobile, isEmployeAllowedPath, mustSetPassword, profileCompleted, currentPath, navigate,
  ]);

  if (loading || !rolesLoaded || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Employe sur desktop sans page autorisée : on attend la redirection
  if (!effIsAdminOrChef && !isEmployeAllowedPath) {
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
