/**
 * v0.21.1 Phase 1 — Garde RBAC UI centralisée
 *
 * Usage :
 *   <RoleGuard required="admin">         → admin only
 *   <RoleGuard required="chef_or_admin"> → chef_chantier OU admin
 *
 * Comportement :
 * - Si rôles pas encore chargés : affiche un loader léger
 * - Si rôle insuffisant : redirige vers `redirectTo` (défaut `/`) avec toast
 * - Sinon : rend les enfants
 *
 * Remplace les patterns ad-hoc `if (!isAdmin) return <Navigate />` éparpillés
 * dans les routes admin/chef pour avoir un comportement uniforme et auditable.
 */
import { Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export type RoleRequirement = "admin" | "chef_or_admin";

interface RoleGuardProps {
  required: RoleRequirement;
  children: ReactNode;
  /** @default "/" */
  redirectTo?: string;
  toastMessage?: string;
}

export function RoleGuard({
  required,
  children,
  redirectTo = "/",
  toastMessage,
}: RoleGuardProps) {
  const { rolesLoaded, roles } = useAuth();
  const toastShownRef = useRef(false);

  const isAdmin = roles.includes("admin");
  const isAdminOrChef = isAdmin || roles.includes("chef_chantier");
  const allowed = required === "admin" ? isAdmin : isAdminOrChef;

  useEffect(() => {
    if (rolesLoaded && !allowed && !toastShownRef.current) {
      toastShownRef.current = true;
      const defaultMsg =
        required === "admin"
          ? "Page réservée aux administrateurs"
          : "Page réservée aux chefs et administrateurs";
      toast.error(toastMessage ?? defaultMsg);
    }
  }, [rolesLoaded, allowed, required, toastMessage]);

  if (!rolesLoaded) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allowed) {
    return <Navigate to={redirectTo} />;
  }

  return <>{children}</>;
}
