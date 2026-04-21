import { Link, useRouterState } from "@tanstack/react-router";
import { FileUp, FileText, History } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/employes/import", label: "Employés", icon: FileUp },
  { to: "/devis/import", label: "Devis", icon: FileText },
  { to: "/devis/historique", label: "Historique", icon: History },
] as const;

/**
 * Barre d'onglets partagée par les 3 pages d'import (Employés / Devis / Historique).
 * À placer en haut de chaque page d'import pour offrir une UX unifiée.
 */
export function ImportsTabsNav() {
  const router = useRouterState();
  const path = router.location.pathname;

  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Sections d'import">
      {TABS.map((t) => {
        const active = path === t.to || path.startsWith(t.to + "/");
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "inline-flex items-center gap-2 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
