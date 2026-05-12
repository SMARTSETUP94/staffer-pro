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
  const [contratsCount, setContratsCount] = useState<number>(0);
  const [contratsToSign, setContratsToSign] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    if (!resolved) return;
    if (!employeId) {
      setIsInterim(false);
      setContratsCount(0);
      setContratsToSign(0);
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
    // count contrats — pour décider d'afficher l'onglet Contrats
    supabase
      .from("contrats_intermittents")
      .select("id, statut", { count: "exact" })
      .eq("employee_id", employeId)
      .then(({ data, count }) => {
        if (cancelled) return;
        setContratsCount(count ?? 0);
        setContratsToSign((data ?? []).filter((r) => r.statut === "a_signer_employe").length);
      });
    return () => {
      cancelled = true;
    };
  }, [employeId, resolved]);

  const middleItem: NavItem =
    isInterim
      ? { to: "/mobile/propositions", label: "Missions", icon: ClipboardList }
      : { to: "/mobile/absences", label: "Absences", icon: CalendarOff };

  // Onglet Contrats inséré uniquement si l'employé en a (intermittents principalement).
  const items: NavItem[] = contratsCount > 0
    ? [
        BASE_ITEMS[0],
        BASE_ITEMS[1],
        { to: "/mobile/contrats", label: "Contrats", icon: FileSignature, badge: contratsToSign },
        middleItem,
        BASE_ITEMS[3],
      ]
    : [BASE_ITEMS[0], BASE_ITEMS[1], BASE_ITEMS[2], middleItem, BASE_ITEMS[3]];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ to, label, icon: Icon, badge }) => {
          const active = path === to;
          const ariaLabel = badge && badge > 0 ? `${label} — ${badge} en attente` : label;
          return (
            <li key={to}>
              <Link
                to={to}
                preload="intent"
                aria-label={ariaLabel}
                className={cn(
                  "relative flex min-h-12 flex-col items-center justify-center gap-0.5 px-2 py-3 text-[10px] font-semibold uppercase tracking-wider transition-colors active:bg-accent/50",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
                {badge && badge > 0 ? (
                  <span className="absolute right-2 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                    {badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
