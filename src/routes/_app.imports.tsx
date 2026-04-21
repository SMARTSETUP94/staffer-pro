import { createFileRoute, Link, Outlet, useRouterState, redirect } from "@tanstack/react-router";
import { FileUp, FileText, History } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/imports")({
  head: () => ({ meta: [{ title: "Imports — Setup Paris" }] }),
  beforeLoad: ({ location }) => {
    // Si on tape /imports sans tab → rediriger vers Employés par défaut
    if (location.pathname === "/imports" || location.pathname === "/imports/") {
      throw redirect({ to: "/employes/import" });
    }
  },
  component: ImportsLayout,
});

const TABS: { to: string; label: string; icon: typeof FileUp; match: string[] }[] = [
  { to: "/employes/import", label: "Employés", icon: FileUp, match: ["/employes/import"] },
  { to: "/devis/import", label: "Devis", icon: FileText, match: ["/devis/import"] },
  { to: "/devis/historique", label: "Historique", icon: History, match: ["/devis/historique"] },
];

function ImportsLayout() {
  const router = useRouterState();
  const path = router.location.pathname;

  return (
    <div className="space-y-6 p-6">
      <PageBreadcrumbs steps={[{ label: "Imports" }]} />
      <PageHeader
        eyebrow="Administration"
        title="Imports"
        description="Importez vos données et consultez l'historique des opérations."
      />
      <nav className="flex gap-1 border-b border-border" aria-label="Sections d'import">
        {TABS.map((t) => {
          const active = t.match.some((m) => path === m || path.startsWith(m + "/"));
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
      <Outlet />
    </div>
  );
}
