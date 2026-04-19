import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/_app")({
  component: AppGuard,
});

function AppGuard() {
  const navigate = useNavigate();
  const { user, loading, rolesLoaded, isAdminOrChef } = useAuth();
  const { effIsMobile, effIsAdminOrChef } = usePreview();

  useEffect(() => {
    if (loading || !rolesLoaded) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    // Si admin en preview "Employé mobile" -> bascule mobile
    if (effIsMobile) {
      navigate({ to: "/mobile/aujourdhui" });
      return;
    }
    // Vrais droits : si pas admin/chef, redirige mobile
    if (!isAdminOrChef) {
      navigate({ to: "/mobile/aujourdhui" });
    }
    // Note: en preview "Employé desktop" l'admin reste sur le desktop avec UI restreinte
  }, [loading, rolesLoaded, user, isAdminOrChef, effIsMobile, effIsAdminOrChef, navigate]);

  if (loading || !rolesLoaded || !user || !isAdminOrChef) {
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
