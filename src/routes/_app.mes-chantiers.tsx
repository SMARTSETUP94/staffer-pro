/**
 * Bloc 9.6 bis — /mobile/equipe-chantiers
 *
 * Liste des chantiers actifs où l'utilisateur fait partie du casting,
 * groupés par phase. Indépendant des assignations jour.
 *
 * Tap sur une phase montage/démontage → carte mission (si dispo).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronRight, MapPin, UsersRound, Inbox, RefreshCw, UserCircle2 } from "lucide-react";
import {
  getMesEquipesChantiers,
  type EquipeChantierItem,
  type EquipePhase,
  type EquipeChantierMembre,
} from "@/server/mes-equipes-chantiers.functions";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/mes-chantiers")({
  head: () => ({ meta: [{ title: "Mes équipes chantiers — Setup Paris" }] }),
  component: EquipeChantiersPage,
});

const PHASE_LABEL: Record<EquipePhase, string> = {
  commercial_etude: "Commercial & étude",
  fabrication: "Fabrication",
  logistique: "Logistique",
  montage: "Montage",
  demontage: "Démontage",
};

const PHASE_ORDER: EquipePhase[] = [
  "commercial_etude",
  "fabrication",
  "logistique",
  "montage",
  "demontage",
];

function EquipeChantiersPage() {
  const { user } = useAuth();
  const fetchFn = useServerFn(getMesEquipesChantiers);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["mes-equipes-chantiers"],
    queryFn: () => fetchFn(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const chantiers = data?.chantiers ?? [];

  return (
    <div className="pb-6">
      <header className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="overline">— Mes équipes</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">
              Équipes par chantier
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {chantiers.length === 0
                ? "Aucun chantier dans votre casting"
                : `${chantiers.length} chantier${chantiers.length > 1 ? "s" : ""}`}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Actualiser"
            data-testid="equipe-chantiers-refresh"
            className="h-9 w-9"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4" data-testid="equipe-chantiers-main">
        {isLoading ? (
          <SkeletonList />
        ) : isError ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            Impossible de charger les équipes.
            <Button size="sm" variant="outline" className="ml-3" onClick={() => refetch()}>
              Réessayer
            </Button>
          </div>
        ) : chantiers.length === 0 ? (
          <EmptyState email={user?.email} />
        ) : (
          <ul className="space-y-3" data-testid="equipe-chantiers-list">
            {chantiers.map((c) => (
              <ChantierCard key={c.affaire_id} chantier={c} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}


function ChantierCard({ chantier }: { chantier: EquipeChantierItem }) {
  const dateRange = formatRange(chantier.date_evenement_debut, chantier.date_evenement_fin);
  return (
    <li
      className="rounded-2xl border border-border bg-card p-3"
      data-testid={`chantier-card-${chantier.affaire_id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">
            <span className="font-mono">{chantier.numero}</span>
            <span className="ml-1.5 font-sans font-normal text-muted-foreground">·</span>{" "}
            <span className="font-sans font-medium">{chantier.nom}</span>
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {chantier.client && <span>{chantier.client}</span>}
            {dateRange && <span>· {dateRange}</span>}
            {chantier.lieu && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="h-2.5 w-2.5" />
                {chantier.lieu}
              </span>
            )}
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          <UsersRound className="h-3 w-3" />
          {chantier.total_membres}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {PHASE_ORDER.map((phase) => {
          const membres = chantier.phases[phase];
          if (!membres || membres.length === 0) return null;
          return (
            <PhaseBlock
              key={phase}
              affaireId={chantier.affaire_id}
              phase={phase}
              membres={membres}
            />
          );
        })}
      </div>
    </li>
  );
}

function PhaseBlock({
  affaireId,
  phase,
  membres,
}: {
  affaireId: string;
  phase: EquipePhase;
  membres: EquipeChantierMembre[];
}) {
  const tappable = phase === "montage" || phase === "demontage";
  const inner = (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-background/50 p-2.5",
        tappable && "transition-colors hover:bg-accent/40 active:bg-accent/60",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {PHASE_LABEL[phase]}
          <span className="ml-1.5 font-mono text-muted-foreground/70">({membres.length})</span>
        </p>
        {tappable && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      <ul className="space-y-1">
        {membres.map((m) => (
          <li
            key={m.id}
            className={cn(
              "flex items-center gap-2 text-xs",
              m.est_moi && "font-semibold text-primary",
            )}
          >
            <UserCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <span className="truncate">
              {m.prenom} {m.nom}
              {m.est_moi && <span className="ml-1 text-[10px]">(moi)</span>}
            </span>
            {m.role_terrain && (
              <span className="ml-auto truncate text-[10px] font-medium text-primary">
                {m.role_terrain}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  if (tappable) {
    return (
      <Link
        to="/missions/$affaireId/$phase"
        params={{ affaireId, phase }}
        preload="intent"
        data-testid={`phase-link-${affaireId}-${phase}`}
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

function SkeletonList() {
  return (
    <ul className="space-y-3" data-testid="equipe-chantiers-skeleton">
      {[0, 1].map((i) => (
        <li key={i} className="rounded-2xl border border-border bg-card p-3">
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-2.5 w-1/2 animate-pulse rounded bg-muted/70" />
          <div className="mt-3 space-y-2">
            {[0, 1].map((j) => (
              <div key={j} className="rounded-xl border border-border/60 bg-background/50 p-2.5">
                <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted/60" />
                <div className="mt-2 h-2.5 w-1/2 animate-pulse rounded bg-muted/50" />
              </div>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ email }: { email?: string | null }) {
  return (
    <section
      className="rounded-2xl border border-dashed border-border bg-card p-8 text-center"
      data-testid="equipe-chantiers-empty"
    >
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-base font-semibold text-foreground">Aucun chantier dans votre casting</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Dès qu'un chef vous intègrera dans l'équipe d'un chantier, vous le verrez ici.
      </p>
      {email && (
        <p className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">{email}</p>
      )}
    </section>
  );
}

function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return null;
  if (start && end) {
    const d1 = parseISO(start);
    const d2 = parseISO(end);
    if (start === end) return format(d1, "d MMM yyyy", { locale: fr });
    if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()) {
      return `${format(d1, "d", { locale: fr })}–${format(d2, "d MMM yyyy", { locale: fr })}`;
    }
    return `${format(d1, "d MMM", { locale: fr })} – ${format(d2, "d MMM yyyy", { locale: fr })}`;
  }
  const d = parseISO((start ?? end) as string);
  return format(d, "d MMM yyyy", { locale: fr });
}
