/**
 * Sprint B / B6 — Bandeau contextuel "Héritage saisie heures".
 *
 * 4 états dérivés du niveau retourné par `resolve_saisie_heures` :
 *
 *   N3 (fabrication_objet_equipe) → "Auto-rempli — équipe objet"
 *   N2 (affaire_equipe)           → "Suggéré — casting de l'affaire"
 *   N1 (assignations)             → "Libre — journée déjà planifiée"
 *   N0 (hors_planning)            → "Hors équipe — saisie hors-planning"
 *
 * Position :
 *  - "inline" (défaut) : carte sous le picker, dans le flux
 *  - "sticky"          : sticky en haut d'un drawer / modale
 *
 * Le bandeau est dismissible (session-only) — `dismissKey` permet de varier
 * la persistance par contexte (clé stockée en sessionStorage).
 *
 * Gating : se masque automatiquement si le feature flag `equipes_3_niveaux_lecture`
 * est OFF (le hook est appelé quand même côté caller mais le bandeau ne rend rien).
 */
import { useState, useEffect } from "react";
import { AlertTriangle, Calendar, CheckCircle2, Sparkles, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  useHeritageSaisieHeures,
  type HeritageSaisieResult,
  type HeritageSaisieInput,
} from "@/hooks/use-heritage-saisie-heures";
import { useFeatureFlag } from "@/hooks/use-feature-flag";

interface Props extends HeritageSaisieInput {
  position?: "inline" | "sticky";
  /** Clé sessionStorage pour mémoriser la fermeture par contexte */
  dismissKey?: string;
  className?: string;
}

interface BandeauVisual {
  icon: typeof CheckCircle2;
  toneBg: string;
  toneBorder: string;
  toneText: string;
  title: string;
  hint: string;
}

function visualFor(r: HeritageSaisieResult | null): BandeauVisual | null {
  if (!r) return null;
  switch (r.niveau) {
    case 3:
      return {
        icon: CheckCircle2,
        toneBg: "bg-emerald-50 dark:bg-emerald-950/30",
        toneBorder: "border-emerald-200 dark:border-emerald-900/50",
        toneText: "text-emerald-900 dark:text-emerald-200",
        title: "Auto-rempli — équipe objet",
        hint: r.role_terrain
          ? `Vous êtes membre de l'équipe de cet objet (rôle : ${r.role_terrain}). Les heures sont pré-remplies depuis le plan staffing.`
          : "Vous êtes membre de l'équipe de cet objet. Les heures sont pré-remplies depuis le plan staffing.",
      };
    case 2:
      return {
        icon: Sparkles,
        toneBg: "bg-sky-50 dark:bg-sky-950/30",
        toneBorder: "border-sky-200 dark:border-sky-900/50",
        toneText: "text-sky-900 dark:text-sky-200",
        title: "Suggéré — casting de l'affaire",
        hint: r.phase
          ? `Vous êtes au casting de cette affaire (phase : ${r.phase.replace("_", " ")}). Saisissez librement vos heures.`
          : "Vous êtes au casting de cette affaire. Saisissez librement vos heures.",
      };
    case 1:
      return {
        icon: Calendar,
        toneBg: "bg-muted/40",
        toneBorder: "border-border",
        toneText: "text-foreground",
        title: "Libre — journée planifiée",
        hint: "Vous êtes planifié sur cette affaire ce jour-là. Aucun héritage d'équipe — saisie libre.",
      };
    case 0:
    default:
      return {
        icon: AlertTriangle,
        toneBg: "bg-amber-50 dark:bg-amber-950/30",
        toneBorder: "border-amber-200 dark:border-amber-900/50",
        toneText: "text-amber-900 dark:text-amber-200",
        title: "Hors équipe — saisie hors-planning",
        hint: "Vous n'êtes ni planifié ni au casting de cette affaire. La saisie sera marquée hors-planning et soumise à validation.",
      };
  }
}

export function SaisieHeritageBandeau({
  employeId,
  affaireId,
  date,
  objetId,
  position = "inline",
  dismissKey,
  className,
}: Props) {
  const flagOn = useFeatureFlag("equipes_3_niveaux_lecture");
  const { data: heritage } = useHeritageSaisieHeures({
    employeId,
    affaireId,
    date,
    objetId,
  });

  const sessionKey = dismissKey ? `saisie-heritage-dismiss:${dismissKey}` : null;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!sessionKey) return;
    setDismissed(typeof window !== "undefined" && sessionStorage.getItem(sessionKey) === "1");
  }, [sessionKey]);

  const visual = visualFor(heritage ?? null);
  if (!flagOn || !visual || dismissed) return null;

  const Icon = visual.icon;
  const showCastingLink = heritage && (heritage.niveau === 2 || heritage.niveau === 3) && affaireId;

  return (
    <div
      role="status"
      data-testid={`saisie-heritage-bandeau-n${heritage?.niveau ?? 0}`}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-xs",
        visual.toneBg,
        visual.toneBorder,
        visual.toneText,
        position === "sticky" && "sticky top-0 z-20 shadow-sm",
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{visual.title}</p>
        <p className="mt-0.5 leading-snug opacity-90">{visual.hint}</p>
        {showCastingLink && (
          <Link
            to="/affaires/$affaireId/casting"
            params={{ affaireId: affaireId! }}
            className="mt-1 inline-block text-[11px] font-semibold underline-offset-2 hover:underline"
          >
            Voir le casting →
          </Link>
        )}
      </div>
      {sessionKey && (
        <button
          type="button"
          aria-label="Masquer ce message"
          onClick={() => {
            setDismissed(true);
            sessionStorage.setItem(sessionKey, "1");
          }}
          className="shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
