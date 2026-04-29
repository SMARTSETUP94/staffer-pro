import { Link } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { useProfileCompletion } from "@/hooks/use-profile-completion";

export function ProfileIncompleteBanner() {
  const { loading, completed, percent } = useProfileCompletion();
  if (loading || completed) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>
          Votre profil est incomplet ({percent}%) — certaines fonctionnalités RH peuvent être
          limitées.
        </span>
      </div>
      <Link
        to="/onboarding"
        className="font-semibold underline underline-offset-2 hover:no-underline"
      >
        Compléter maintenant
      </Link>
    </div>
  );
}
