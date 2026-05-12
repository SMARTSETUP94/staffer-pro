/**
 * v0.47.2 — Bandeau de navigation partagé entre les 3 pages
 * Métiers / Postes contractuels / Postes principaux des employés.
 *
 * Permet de basculer entre ces 3 surfaces sans repasser par la sidebar.
 * Sidebar consolidée : une seule entrée "Métiers & postes" → tab Métiers.
 */
import { Link } from "@tanstack/react-router";
import { Palette, FileSignature, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "metiers" | "postes" | "employes-poste";

const TABS: { id: Tab; label: string; to: string; icon: typeof Palette }[] = [
  { id: "metiers", label: "Métiers", to: "/parametres/metiers", icon: Palette },
  { id: "postes", label: "Postes contractuels", to: "/parametres/postes", icon: FileSignature },
  { id: "employes-poste", label: "Postes principaux (employés)", to: "/admin/employes-poste-principal", icon: UserCog },
];

interface Props {
  current: Tab;
  className?: string;
}

export function MetiersPostesTabs({ current, className }: Props) {
  return (
    <div className={cn("border-b mb-4", className)}>
      <nav className="flex gap-1 -mb-px overflow-x-auto" aria-label="Métiers & postes">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.id === current;
          return (
            <Link
              key={t.id}
              to={t.to}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
