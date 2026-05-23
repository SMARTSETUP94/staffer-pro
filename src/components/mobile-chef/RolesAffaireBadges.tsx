/**
 * Affiche les rôles que le chef occupe sur une affaire (chips colorées).
 * Source : RPC mes_affaires_chef -> mes_roles text[].
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { affaireRoleLabel } from "@/lib/labels";

// Note Lot 7.1 : ici "chef_chantier" est le rôle MÉTIER terrain sur l'affaire
// (chef de chantier), distinct du rôle applicatif app_role.chef_chantier qui
// s'affiche « Chef d'équipe ». Voir src/lib/labels.ts.

const ROLE_COLORS: Record<string, string> = {
  chef_projet: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  chef_chantier: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  charge_affaires: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  responsable_montage: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  responsable_demontage: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
  respo_fab: "bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30",
};

export function RolesAffaireBadges({ roles, className }: { roles: string[]; className?: string }) {
  if (!roles || roles.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {roles.map((r) => (
        <Badge
          key={r}
          variant="outline"
          className={cn("text-[10px] font-medium px-1.5 py-0 h-5", ROLE_COLORS[r] ?? "")}
        >
          {affaireRoleLabel(r)}
        </Badge>
      ))}
    </div>
  );
}
