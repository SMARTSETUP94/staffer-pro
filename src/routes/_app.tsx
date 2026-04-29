import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/_app")({
  component: AppGuard,
});

// Pages accessibles à un employé en desktop (vue restreinte)
const EMPLOYE_DESKTOP_ALLOWED = [
  "/dashboard",
  "/dashboard-employe",
  "/mes-heures",
  "/mes-swaps",
  "/mes-propositions",
  "/fabrication",
];

function AppGuard() {
  const navigate = useNavigate();
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const { user, loading, rolesLoaded, isAdminOrChef, passwordSetDone, profileCompleted, roles } = useAuth();
  const { effIsMobile, effIsAdminOrChef } = usePreview();

  const isEmployeAllowedPath = EMPLOYE_DESKTOP_ALLOWED.some(
    (p) => currentPath === p || currentPath.startsWith(p + "/"),
  );

  // Chef/admin doivent OBLIGATOIREMENT avoir un mot de passe
  const isChefOrAdmin = roles.includes("admin") || roles.includes("chef_chantier");
  const mustSetPassword = passwordSetDone === false && isChefOrAdmin;

  useEffect(() => {
    if (loading || !rolesLoaded) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    // Set-password obligatoire pour chef/admin
    if (mustSetPassword) {
      navigate({ to: "/auth/set-password" });
      return;
    }
    // Onboarding profil obligatoire (1ʳᵉ connexion)
    if (!profileCompleted) {
      navigate({ to: "/onboarding" });
      return;
    }
    // Preview "Employé mobile" -> bascule mobile
    if (effIsMobile) {
      navigate({ to: "/mobile/aujourdhui" });
      return;
    }
    // Pas admin/chef sur desktop : autorisé uniquement sur les pages employé
    if (!effIsAdminOrChef && !isEmployeAllowedPath) {
      navigate({ to: "/dashboard-employe" });
    }
  }, [
    loading, rolesLoaded, user, isAdminOrChef, effIsAdminOrChef,
    effIsMobile, isEmployeAllowedPath, mustSetPassword, profileCompleted, navigate,
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
