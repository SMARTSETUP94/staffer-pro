/**
 * v0.44.3 — Bandeau visible UNIQUEMENT pour les chef_metier_scoped.
 * Indique à l'utilisateur que l'écran présente une vue large mais que ses
 * actions d'écriture sont bornées aux affaires sur lesquelles il est chef
 * (RLS DB via `current_user_is_chef_on_affaire`).
 *
 * À placer en haut des pages : /affaires, /validation-heures, /audit-heures,
 * /mobile/chef/*.
 */
import { ShieldAlert } from "lucide-react";
import { useChefScope } from "@/hooks/use-chef-scope";
import { useMesAffairesChef } from "@/hooks/use-mes-affaires-chef";
import { cn } from "@/lib/utils";

interface ScopedAccessBannerProps {
  /** Texte sur-mesure (sinon message générique). */
  message?: string;
  className?: string;
  /** Compacte (mobile) — masque le compteur d'affaires. */
  compact?: boolean;
}

export function ScopedAccessBanner({ message, className, compact }: ScopedAccessBannerProps) {
  const { isScoped } = useChefScope();
  const { data: affaires } = useMesAffairesChef();

  if (!isScoped) return null;

  const count = affaires?.length ?? 0;
  const defaultMsg = compact
    ? "Accès limité à vos chantiers."
    : "Vous voyez la base globale, mais vos actions sont limitées aux chantiers sur lesquels vous êtes chef.";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900",
        "dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200",
        className,
      )}
    >
      <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-medium">{message ?? defaultMsg}</p>
        {!compact && count > 0 ? (
          <p className="text-xs opacity-80 mt-0.5">
            {count} chantier{count > 1 ? "s" : ""} accessible{count > 1 ? "s" : ""} en écriture.
          </p>
        ) : null}
      </div>
    </div>
  );
}
