import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { isAuthHashPresent } from "@/lib/auth-redirect-helpers";
import { resolvePostLoginTarget } from "@/lib/post-login-routing";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();
  const { user, loading, rolesLoaded } = useAuth();
  const [hashRedirectChecked, setHashRedirectChecked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setHashRedirectChecked(true);
      return;
    }
    const hash = window.location.hash;
    if (isAuthHashPresent(hash)) {
      window.location.replace(`/auth/set-password${hash}`);
      return;
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
    navigate({ to: resolvePostLoginTarget() });
  }, [hashRedirectChecked, loading, rolesLoaded, user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
