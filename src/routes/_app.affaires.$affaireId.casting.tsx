/**
 * Sprint B / B4 — Onglet "Casting du chantier".
 *
 * Lecture : `affaire_equipe` (niveau 2) groupé par 4 phases.
 * Gating  : feature flag `equipes_3_niveaux_lecture` (chargement OK même si
 * flag OFF, la route reste accessible — c'est l'onglet qui est masqué dans
 * le layout parent quand le flag est OFF).
 *
 * Layout :
 *   - 4 sections phase (PhaseBadge solid en en-tête)
 *   - chaque section : grille de cartes membres (nom + rôle terrain + notes)
 *   - empty state par phase ("Aucun membre — l'équipe se peuple à la publication d'un plan")
 *   - cas particuliers : pour montage_demontage, fusionne montage+démontage ;
 *     pour prototype, met fabrication en premier
 *
 * Mobile : sections empilées, cartes en grid-cols-1 sous 640px.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, UserCircle2, Users, Info } from "lucide-react";
import { useCastingChantier } from "@/hooks/use-casting-chantier";
import { PhaseBadge, type AffairePhase } from "@/components/atoms/PhaseBadge";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_app/affaires/$affaireId/casting")({
  head: () => ({ meta: [{ title: "Casting du chantier — Setup Paris" }] }),
  component: AffaireCastingPage,
});

type Typologie =
  | "fabrication"
  | "montage_demontage"
  | "stockage"
  | "prototype"
  | "non_operationnel"
  | null;

function deriveTypologie(numero: string | null | undefined): Typologie {
  if (!numero) return null;
  const n = numero.trim();
  if (n.startsWith("5")) return "fabrication";
  if (n.startsWith("4")) return "montage_demontage";
  if (n.startsWith("2")) return "stockage";
  if (n.startsWith("9")) return "prototype";
  if (n.startsWith("1") || n.startsWith("3")) return "non_operationnel";
  return null;
}

const ALL_PHASES: AffairePhase[] = [
  "commercial_etude",
  "fabrication",
  "montage",
  "demontage",
];

function orderedPhasesFor(typo: Typologie): AffairePhase[] {
  if (typo === "montage_demontage") {
    return ["commercial_etude", "montage", "demontage", "fabrication"];
  }
  if (typo === "prototype") {
    return ["fabrication", "commercial_etude", "montage", "demontage"];
  }
  return ALL_PHASES;
}

function AffaireCastingPage() {
  const { affaireId } = Route.useParams();
  const flagOn = useFeatureFlag("equipes_3_niveaux_lecture");
  const { data, isLoading } = useCastingChantier(affaireId);
  const [numero, setNumero] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("affaires")
      .select("numero")
      .eq("id", affaireId)
      .maybeSingle()
      .then(({ data: a }) => {
        if (!cancelled) setNumero(a?.numero ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [affaireId]);

  const typo = deriveTypologie(numero);
  const phases = orderedPhasesFor(typo);

  if (!flagOn) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
        <Info className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold text-foreground">
          Casting indisponible
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Le nouveau modèle équipe 3 niveaux est en test interne. Activation
          progressive via le feature flag <code className="font-mono">equipes_3_niveaux_lecture</code>.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
        <Users className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold text-foreground">
          Aucun membre dans le casting
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          L'équipe se peuple automatiquement lors de la publication d'un plan staffing,
          ou en édition manuelle (Sprint C).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Casting du chantier</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Équipe nominative par phase{typo ? ` · typologie ${typo.replace("_", " ")}` : ""}
            {" · "}
            <span className="font-mono">{data.total}</span> membre{data.total > 1 ? "s" : ""}
          </p>
        </div>
      </header>

      <div className="space-y-6">
        {phases.map((phase) => {
          const members = data.phases[phase] ?? [];
          return (
            <section key={phase} data-testid={`casting-section-${phase}`}>
              <div className="mb-2 flex items-center gap-2">
                <PhaseBadge phase={phase} variant="solid" size="md" />
                <span className="text-xs text-muted-foreground">
                  {members.length} pers.
                </span>
              </div>
              {members.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-3 text-xs italic text-muted-foreground">
                  Aucun membre — l'équipe se peuple à la publication d'un plan staffing.
                </p>
              ) : (
                <TooltipProvider>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {members.map((m) => (
                      <Tooltip key={m.id}>
                        <TooltipTrigger asChild>
                          <article className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition hover:border-primary/40">
                            <UserCircle2 className="h-7 w-7 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {m.prenom} {m.nom}
                              </p>
                              {m.role_terrain ? (
                                <p className="mt-0.5 truncate text-[11px] font-medium text-primary">
                                  {m.role_terrain}
                                </p>
                              ) : (
                                <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                                  Pas de rôle terrain défini
                                </p>
                              )}
                            </div>
                          </article>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1 text-xs">
                            <p className="font-semibold">{m.prenom} {m.nom}</p>
                            <p>Ajouté le {new Date(m.added_at).toLocaleDateString("fr-FR")}</p>
                            {m.notes && <p className="italic text-muted-foreground">{m.notes}</p>}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
