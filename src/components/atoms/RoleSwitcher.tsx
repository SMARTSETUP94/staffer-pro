import { useEffect, useMemo, useState, useCallback } from "react";
import { Check, UserCog } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { roleLabel } from "@/lib/labels";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const STORAGE_KEY = "preferred_role";

const ROLE_PRIORITY: AppRole[] = ["admin", "chef_chantier", "rh", "employe"];

function emitRoleSwitched(role: AppRole) {
  window.dispatchEvent(new CustomEvent("role:switched", { detail: { role } }));
}

/**
 * RoleSwitcher — position header droite (avant avatar). Permet à un user
 * multi-rôles (ex: admin + chef + employé) de basculer l'angle de lecture.
 * Persistance : localStorage + write-through async vers profiles.preferred_role.
 * Effets de bascule (queries, dashboard, routing) câblés en Sprint D.
 */
export function RoleSwitcher() {
  const { user, roles, rolesLoaded } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<AppRole | null>(null);

  // Tri par priorité + dédup
  const availableRoles = useMemo(() => {
    const set = new Set(roles);
    return ROLE_PRIORITY.filter((r) => set.has(r));
  }, [roles]);

  // Init depuis localStorage puis fallback rôle prioritaire
  useEffect(() => {
    if (!rolesLoaded) return;
    const stored = (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) as AppRole | null;
    if (stored && availableRoles.includes(stored)) {
      setActive(stored);
    } else if (availableRoles[0]) {
      setActive(availableRoles[0]);
    }
  }, [rolesLoaded, availableRoles]);

  const handleSelect = useCallback(
    async (role: AppRole) => {
      setActive(role);
      setOpen(false);
      try {
        localStorage.setItem(STORAGE_KEY, role);
      } catch {
        /* ignore quota / private mode */
      }
      emitRoleSwitched(role);
      // Invalidation large des queries dépendant du rôle effectif
      qc.invalidateQueries();
      // Write-through async (non bloquant)
      if (user?.id) {
        void supabase.from("profiles").update({ preferred_role: role }).eq("id", user.id);
      }
    },
    [qc, user?.id],
  );

  if (!rolesLoaded || availableRoles.length <= 1 || !active) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 rounded-lg px-2.5 text-xs"
          aria-label="Changer de rôle actif"
        >
          <UserCog className="h-4 w-4 text-muted-foreground" />
          <span className="hidden sm:inline font-medium">{roleLabel(active)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1.5">
        <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Voir comme…
        </p>
        <div className="flex flex-col gap-0.5">
          {availableRoles.map((r) => {
            const isActive = r === active;
            return (
              <button
                key={r}
                onClick={() => handleSelect(r)}
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  "hover:bg-accent",
                  isActive && "bg-accent/60",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium">{roleLabel(r)}</span>
                  {r === "admin" && (
                    <Badge variant="outline" className="h-4 px-1 text-[9px]">
                      ADMIN
                    </Badge>
                  )}
                </span>
                {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
