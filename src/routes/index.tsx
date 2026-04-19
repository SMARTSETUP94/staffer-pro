import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();
  const { user, loading, rolesLoaded, isAdminOrChef } = useAuth();
  const { effIsMobile } = usePreview();

  useEffect(() => {
    if (loading || !rolesLoaded) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (effIsMobile) {
      navigate({ to: "/mobile/aujourdhui" });
      return;
    }
    if (isAdminOrChef) {
      navigate({ to: "/planning" });
    } else {
      navigate({ to: "/mobile/aujourdhui" });
    }
  }, [loading, rolesLoaded, user, isAdminOrChef, effIsMobile, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
