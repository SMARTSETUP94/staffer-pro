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
    user, loading, rolesLoaded, isAdminOrChef,
    passwordSetDone, passwordSetAt, isInviteStatus, profileCompleted, roles,
  } = useAuth();
  const { effIsMobile, effIsAdminOrChef, isPreviewing } = usePreview();
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
    // Routing role-aware centralisé (mobile/desktop, admin/chef/employé).
    // Voir src/lib/post-login-routing.ts.
    const target = resolvePostLoginTarget({
      isAdmin: roles.includes("admin"),
      isAdminOrChef,
      effIsMobile,
      effIsAdminOrChef,
      isPreviewing,
    });
    // Mobile : si la cible est /mobile/* et qu'on n'y est pas → bascule.
    if (target.startsWith("/mobile/") && !currentPath.startsWith("/mobile/")) {
      navigate({ to: target });
      return;
    }
    // Desktop employé : autorisé uniquement sur whitelist (sinon → /ma-semaine).
    if (!effIsAdminOrChef && !isEmployeAllowedPath && !currentPath.startsWith("/mobile/")) {
      navigate({ to: "/ma-semaine" });
    }
  }, [
    loading, rolesLoaded, user, isAdminOrChef, effIsAdminOrChef,
    effIsMobile, isEmployeAllowedPath, mustSetPassword, profileCompleted, currentPath, navigate, roles, isPreviewing,
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
