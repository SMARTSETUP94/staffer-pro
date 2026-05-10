import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarRange, Users, CheckCircle2, FileSignature } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChefBadgeCounts } from "@/hooks/use-chef-badge-counts";
import { useChefAValider } from "@/hooks/use-chef-a-valider";

type Item = {
  to: "/mobile/chef/dashboard" | "/mobile/chef/planning" | "/mobile/chef/equipe" | "/mobile/chef/a-valider" | "/mobile/chef/contrats";
  label: string;
  icon: typeof LayoutDashboard;
  badgeKey?: "heuresAValider" | "contratsAttente" | "aValider";
};

const ITEMS: Item[] = [
  { to: "/mobile/chef/dashboard", label: "Hub", icon: LayoutDashboard },
  { to: "/mobile/chef/planning", label: "Planning", icon: CalendarRange },
  { to: "/mobile/chef/equipe", label: "Équipe", icon: Users },
  { to: "/mobile/chef/a-valider", label: "À valider", icon: CheckCircle2, badgeKey: "aValider" },
  { to: "/mobile/chef/contrats", label: "Contrats", icon: FileSignature, badgeKey: "contratsAttente" },
];

export function ChefMobileBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const counts = useChefBadgeCounts();
  const { totalCount: aValider } = useChefAValider();
  const allCounts: Record<string, number> = { ...counts, aValider };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {ITEMS.map(({ to, label, icon: Icon, badgeKey }) => {
          const active = path === to || path.startsWith(to + "/");
          const badge = badgeKey ? allCounts[badgeKey] ?? 0 : 0;
          return (
            <li key={to} className="relative">
              <Link
                to={to}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {badge > 0 && (
                    <span className="absolute -right-2 -top-1 inline-flex min-w-[16px] h-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
