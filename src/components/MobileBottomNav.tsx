import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarDays, Clock, ArrowLeftRight, ClipboardList, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/mobile/aujourdhui", label: "Semaine", icon: CalendarDays },
  { to: "/mobile/heures", label: "Heures", icon: Clock },
  { to: "/mobile/swaps", label: "Swaps", icon: ArrowLeftRight },
  { to: "/mobile/propositions", label: "Missions", icon: ClipboardList },
  { to: "/mobile/profil", label: "Profil", icon: User },
] as const;

export function MobileBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => {
          const active = path === to;
          return (
            <li key={to}>
              <Link
                to={to}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
