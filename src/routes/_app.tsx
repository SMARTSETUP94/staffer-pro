import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/_app")({
  component: AppGuard,
});

function AppGuard() {
  const navigate = useNavigate();
  const { user, loading, isAdminOrChef } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (!isAdminOrChef) navigate({ to: "/mobile/aujourdhui" });
  }, [loading, user, isAdminOrChef, navigate]);

  if (loading || !user || !isAdminOrChef) {
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
