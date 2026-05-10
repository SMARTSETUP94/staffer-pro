import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock,
  ArrowLeftRight,
  ClipboardList,
  CalendarOff,
  User,
  FileSignature,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedEmploye } from "@/hooks/use-resolved-employe";

type NavItem = {
  to: "/mobile/aujourdhui" | "/mobile/heures" | "/mobile/swaps" | "/mobile/propositions" | "/mobile/absences" | "/mobile/contrats" | "/mobile/profil";
  label: string;
  icon: typeof CalendarDays;
  badge?: number;
};

const BASE_ITEMS: NavItem[] = [
  { to: "/mobile/aujourdhui", label: "Semaine", icon: CalendarDays },
  { to: "/mobile/heures", label: "Heures", icon: Clock },
  { to: "/mobile/swaps", label: "Swaps", icon: ArrowLeftRight },
  { to: "/mobile/profil", label: "Profil", icon: User },
];

export function MobileBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { employeId, resolved } = useResolvedEmploye();
  const [isInterim, setIsInterim] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!resolved) return;
    if (!employeId) {
      setIsInterim(false);
      return;
    }
    supabase
      .from("employes")
      .select("type_contrat")
      .eq("id", employeId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setIsInterim(data?.type_contrat === "Interim");
      });
    return () => {
      cancelled = true;
    };
  }, [employeId, resolved]);

  // 5 onglets max pour rester lisible :
  // - Intérimaires : Missions (propositions) — pas Absences (gérées par leur agence)
  // - Autres contrats : Absences — pas Missions (rarement concernés)
  const middleItem: NavItem =
    isInterim
      ? { to: "/mobile/propositions", label: "Missions", icon: ClipboardList }
      : { to: "/mobile/absences", label: "Absences", icon: CalendarOff };

  const items: NavItem[] = [
    BASE_ITEMS[0],
    BASE_ITEMS[1],
    BASE_ITEMS[2],
    middleItem,
    BASE_ITEMS[3],
  ];

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
