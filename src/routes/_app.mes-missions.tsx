/**
 * Bloc 9 Lot 9.2 — Liste des missions pose (mobile).
 *
 * Fenêtre J-7 → J+30, regroupée par bucket :
 *   - Aujourd'hui / Cette semaine
 *   - Semaine prochaine
 *   - Passées (J-7 → J-1)
 *
 * Tap sur une carte → /mobile/mission/$affaireId/$phase
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addDays, endOfWeek, format, isAfter, isBefore, parseISO, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronRight, Inbox, MapPin, PackageCheck, RefreshCw, Wrench } from "lucide-react";
import { getMesMissions, type MissionListItem } from "@/server/mission-card.functions";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";
import { PreviewBanner } from "@/components/PreviewBanner";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { LogoutConfirmButton } from "@/components/mobile/LogoutConfirmButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/mes-missions")({
  head: () => ({ meta: [{ title: "Mes missions pose — Setup Paris" }] }),
  component: MesMissionsPage,
});

function MesMissionsPage() {
  const { user } = useAuth();
  const { isPreviewing, setPreviewRole } = usePreview();
  const navigate = useNavigate();
  const fetchMissions = useServerFn(getMesMissions);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["mes-missions"],
    queryFn: () => fetchMissions(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const missions = data?.missions ?? [];
  const buckets = useMemo(() => bucketize(missions), [missions]);

  const handleQuitPreview = () => {
    setPreviewRole(null);
    navigate({ to: "/planning" });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <PreviewBanner />

      <header className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto flex max-w-md items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="overline">— Mes missions pose</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">
              Montage &amp; démontage
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {missions.length === 0
                ? "Aucune mission planifiée"
                : `${missions.length} mission${missions.length > 1 ? "s" : ""} sur 30 jours`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Actualiser"
              data-testid="mes-missions-refresh"
              className="h-9 w-9"
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
            {isPreviewing ? (
              <Button size="sm" variant="outline" onClick={handleQuitPreview}>
                Quitter
              </Button>
            ) : (
              <LogoutConfirmButton />
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-4" data-testid="mes-missions-main">
        {isLoading ? (
          <MissionsSkeleton />
        ) : isError ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Impossible de charger les missions.
            <Button size="sm" variant="outline" className="ml-3" onClick={() => refetch()}>
              Réessayer
            </Button>
          </div>
        ) : missions.length === 0 ? (
          <EmptyState email={user?.email} />
        ) : (
          <div className="space-y-6">
            <Bucket title="Cette semaine" missions={buckets.thisWeek} />
            <Bucket title="Semaine prochaine" missions={buckets.nextWeek} />
            <Bucket title="Plus tard" missions={buckets.later} />
            <Bucket title="Passées" missions={buckets.past} muted />
          </div>
        )}
      </main>

      <MobileBottomNav />
    </div>
  );
}

function MissionsSkeleton() {
  return (
    <div className="space-y-6" data-testid="mes-missions-skeleton">
      {[0, 1].map((b) => (
        <section key={b}>
          <div className="mb-2 h-3 w-32 animate-pulse rounded bg-muted" />
          <ul className="space-y-2">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
              >
                <div className="h-10 w-10 flex-shrink-0 animate-pulse rounded-xl bg-muted" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted/70" />
                  <div className="h-2 w-1/3 animate-pulse rounded bg-muted/50" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------------------

function EmptyState({ email }: { email?: string | null }) {
  return (
    <section
      className="rounded-2xl border border-dashed border-border bg-card p-8 text-center"
      data-testid="mes-missions-empty"
    >
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-base font-semibold text-foreground">Aucune mission de pose</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Vos chantiers de montage et démontage s'afficheront ici dès qu'un chef d'équipe vous aura
        planifié.
      </p>
      {email && (
        <p className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">{email}</p>
      )}
    </section>
  );
}

function Bucket({
  title,
  missions,
  muted = false,
}: {
  title: string;
  missions: MissionListItem[];
  muted?: boolean;
}) {
  if (missions.length === 0) return null;
  return (
    <section>
      <p
        className={cn(
          "overline mb-2 flex items-center justify-between",
          muted && "text-muted-foreground/70",
        )}
      >
        <span>— {title}</span>
        <span className="text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
          {missions.length}
        </span>
      </p>
      <ul className="space-y-2" data-testid={`mission-bucket-${slug(title)}`}>
        {missions.map((m) => (
          <MissionCard key={`${m.affaire_id}-${m.phase}`} mission={m} muted={muted} />
        ))}
      </ul>
    </section>
  );
}

function MissionCard({ mission, muted }: { mission: MissionListItem; muted?: boolean }) {
  const Icon = mission.phase === "montage" ? Wrench : PackageCheck;
  const phaseLabel = mission.phase === "montage" ? "Montage" : "Démontage";
  const dateLabel = formatDateRange(mission.date_debut, mission.date_fin);
  return (
    <li>
      <Link
        to="/mobile/mission/$affaireId/$phase"
        params={{ affaireId: mission.affaire_id, phase: mission.phase }}
        preload="intent"
        data-testid={`mission-card-${mission.affaire_id}-${mission.phase}`}
        className={cn(
          "flex items-center gap-3 rounded-2xl border bg-card p-3 transition-colors hover:bg-accent/40 active:bg-accent/60",
          muted ? "border-border/60 opacity-75" : "border-border",
          mission.statut === "en_cours" && "border-primary/50 ring-1 ring-primary/20",
        )}
      >
        <div
          className={cn(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl",
            mission.phase === "montage"
              ? "bg-primary/10 text-primary"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-bold text-foreground">
              <span className="font-mono">{mission.affaire_numero}</span>
              <span className="ml-1.5 font-sans font-normal text-muted-foreground">
                · {phaseLabel}
              </span>
            </span>
            <StatutChip statut={mission.statut} />
          </div>
          <p className="truncate text-xs text-foreground">{mission.affaire_nom}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{dateLabel}</span>
            <span>·</span>
            <span>
              {mission.nb_demi_jours} ½j ({Math.round((mission.nb_demi_jours * 4) * 10) / 10}h)
            </span>
            {mission.lieu && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="h-2.5 w-2.5" />
                {mission.lieu}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function StatutChip({ statut }: { statut: MissionListItem["statut"] }) {
  const map: Record<MissionListItem["statut"], { label: string; cls: string }> = {
    en_cours: {
      label: "En cours",
      cls: "bg-primary/15 text-primary",
    },
    a_venir: {
      label: "À venir",
      cls: "bg-muted text-muted-foreground",
    },
    passee: {
      label: "Passée",
      cls: "bg-muted/60 text-muted-foreground",
    },
  };
  const m = map[statut];
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
        m.cls,
      )}
    >
      {m.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bucketize(missions: MissionListItem[]) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const nextWeekStart = addDays(weekStart, 7);
  const nextWeekEnd = addDays(weekEnd, 7);

  const thisWeek: MissionListItem[] = [];
  const nextWeek: MissionListItem[] = [];
  const later: MissionListItem[] = [];
  const past: MissionListItem[] = [];

  for (const m of missions) {
    const d = parseISO(m.date_debut);
    const f = parseISO(m.date_fin);
    if (m.statut === "passee") {
      past.push(m);
    } else if (isBefore(f, weekStart)) {
      past.push(m);
    } else if (!isAfter(d, weekEnd)) {
      thisWeek.push(m);
    } else if (!isAfter(d, nextWeekEnd) && !isBefore(d, nextWeekStart)) {
      nextWeek.push(m);
    } else {
      later.push(m);
    }
  }

  return { thisWeek, nextWeek, later, past };
}

function formatDateRange(start: string, end: string) {
  if (start === end) {
    return format(parseISO(start), "EEE d MMM", { locale: fr });
  }
  const d1 = parseISO(start);
  const d2 = parseISO(end);
  if (d1.getMonth() === d2.getMonth()) {
    return `${format(d1, "d", { locale: fr })}–${format(d2, "d MMM", { locale: fr })}`;
  }
  return `${format(d1, "d MMM", { locale: fr })} – ${format(d2, "d MMM", { locale: fr })}`;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
