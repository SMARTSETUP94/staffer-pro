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
import { Loader2, UserCircle2, Info, Plus, X } from "lucide-react";
import { useCastingChantier } from "@/hooks/use-casting-chantier";
import { PhaseBadge, type AffairePhase } from "@/components/atoms/PhaseBadge";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { useCapability } from "@/hooks/use-capability";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { AddCastingMemberSheet } from "@/components/casting/AddCastingMemberSheet";
import { RemoveCastingMemberDialog } from "@/components/casting/RemoveCastingMemberDialog";
import { RepublishConflictDialog } from "@/components/staffing/RepublishConflictDialog";
import { EquipeCapaciteIndicator } from "@/components/atoms/EquipeCapaciteIndicator";
import { useAffaireCapacite, useAffaireCapaciteMetier } from "@/hooks/use-affaire-capacite";
import type { CastingMembre, CastingPhase } from "@/server/casting-chantier.functions";
import { FAB_METIERS, isFabMetier } from "@/lib/fab-sous-etapes";

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
  "logistique",
  "montage",
  "demontage",
];

function orderedPhasesFor(typo: Typologie): AffairePhase[] {
  // Sprint D / Batch 2 — ordre par typologie, filtré par typologie_phases côté DB.
  if (typo === "montage_demontage") {
    return ["commercial_etude", "logistique", "montage", "demontage"];
  }
  if (typo === "prototype") {
    return ["commercial_etude", "fabrication"];
  }
  if (typo === "fabrication") {
    return ["commercial_etude", "fabrication", "logistique"];
  }
  if (typo === "stockage") {
    return ["commercial_etude", "logistique"];
  }
  if (typo === "non_operationnel") {
    return ["commercial_etude"];
  }
  return ALL_PHASES;
}

const PHASE_LABELS: Record<AffairePhase, string> = {
  commercial_etude: "Commercial / Étude",
  fabrication: "Fabrication",
  logistique: "Logistique",
  montage: "Montage",
  demontage: "Démontage",
};

interface ActiveRemove {
  employeId: string;
  employeLabel: string;
  phase: CastingPhase;
}

interface ActiveAdd {
  phase: CastingPhase;
  /** Si renseigné : filtre métiers + sous-titre du sheet. */
  restrictMetierIds?: number[];
  subEtapeLabel?: string;
}

function AffaireCastingPage() {
  const { affaireId } = Route.useParams();
  const flagOn = useFeatureFlag("equipes_3_niveaux_lecture");
  const alertsFlagOn = useFeatureFlag("equipes_3_niveaux_alertes");
  const canEdit = useCapability("affaire.team.manage");
  const { data, isLoading } = useCastingChantier(affaireId);
  const { data: capacite } = useAffaireCapacite(affaireId);
  const { data: capaciteMetier } = useAffaireCapaciteMetier(affaireId);
  const [numero, setNumero] = useState<string | null>(null);
  const [addCtx, setAddCtx] = useState<ActiveAdd | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ActiveRemove | null>(null);
  const [publishedPlanId, setPublishedPlanId] = useState<string | null>(null);
  const [republishOpen, setRepublishOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("staffing_plan")
      .select("id")
      .eq("affaire_id", affaireId)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: p }) => {
        if (!cancelled) setPublishedPlanId(p?.id ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [affaireId]);

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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Casting du chantier</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Équipe nominative par phase{typo ? ` · typologie ${typo.replace("_", " ")}` : ""}
            {" · "}
            <span className="font-mono">{data?.total ?? 0}</span> membre{(data?.total ?? 0) > 1 ? "s" : ""}
            {canEdit && (
              <span className="ml-2 text-[11px] italic text-muted-foreground">
                · édition manuelle activée
              </span>
            )}
          </p>
        </div>
        {canEdit && publishedPlanId && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRepublishOpen(true)}
            data-testid="casting-republish"
          >
            Republier le plan
          </Button>
        )}
      </header>

      <div className="space-y-6">
        {phases.map((phase) => {
          const members = data?.phases[phase] ?? [];
          const isFab = phase === "fabrication";

          // Pour fabrication : décomposition par 6 métiers individuels + Autre
          const fabBuckets = isFab
            ? (() => {
                const byMetier: Record<number, CastingMembre[]> = {};
                const autre: CastingMembre[] = [];
                for (const m of members) {
                  if (m.metier_principal_id != null && isFabMetier(m.metier_principal_id)) {
                    (byMetier[m.metier_principal_id] ||= []).push(m);
                  } else {
                    autre.push(m);
                  }
                }
                return { byMetier, autre };
              })()
            : null;

          const renderMemberCard = (m: CastingMembre) => (
            <article
              key={m.id}
              className="group relative flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition hover:border-primary/40"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-1 items-start gap-3 min-w-0">
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
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold">{m.prenom} {m.nom}</p>
                    <p>Ajouté le {new Date(m.added_at).toLocaleDateString("fr-FR")}</p>
                    {m.notes && <p className="italic text-muted-foreground">{m.notes}</p>}
                  </div>
                </TooltipContent>
              </Tooltip>
              {canEdit && (
                <button
                  type="button"
                  onClick={() =>
                    setRemoveTarget({
                      employeId: m.employe_id,
                      employeLabel: `${m.prenom} ${m.nom}`,
                      phase,
                    })
                  }
                  className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  aria-label={`Retirer ${m.prenom} ${m.nom}`}
                  data-testid={`casting-remove-${m.employe_id}-${phase}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </article>
          );

          return (
            <section key={phase} data-testid={`casting-section-${phase}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <PhaseBadge phase={phase} variant="solid" size="md" />
                  <span className="text-xs text-muted-foreground">
                    {members.length} pers.
                  </span>
                  {alertsFlagOn && capacite?.[phase] && (
                    <EquipeCapaciteIndicator
                      statut={capacite[phase].statut}
                      nbPersonnes={capacite[phase].nb_personnes_castees}
                      joursOuvres={capacite[phase].jours_ouvres_phase}
                      capaciteEstimeeH={Number(capacite[phase].capacite_estimee_h)}
                      heuresPrevues={Number(capacite[phase].heures_prevues)}
                      ratio={
                        capacite[phase].ratio_capacite_vs_prevu !== null
                          ? Number(capacite[phase].ratio_capacite_vs_prevu)
                          : null
                      }
                    />
                  )}
                </div>
                {canEdit && !isFab && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setAddCtx({ phase })}
                    data-testid={`casting-add-${phase}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Personne
                  </Button>
                )}
              </div>

              {/* FABRICATION : 6 sous-blocs par métier individuel + Autre */}
              {isFab && fabBuckets ? (
                <TooltipProvider>
                  <div className="space-y-4 pl-1">
                    {FAB_METIERS.map((fm) => {
                      const list = fabBuckets.byMetier[fm.metierId] ?? [];
                      const cap = capaciteMetier?.[fm.metierId];
                      return (
                        <div key={fm.metierId} data-testid={`casting-fab-metier-${fm.code}`}>
                          <div className="mb-1.5 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {fm.label}{" "}
                                <span className="font-mono text-foreground/70">
                                  ({list.length})
                                </span>
                              </p>
                              {alertsFlagOn && cap && (
                                <EquipeCapaciteIndicator
                                  size="sm"
                                  statut={cap.statut}
                                  nbPersonnes={cap.nb_personnes_castees}
                                  joursOuvres={cap.jours_ouvres_phase}
                                  capaciteEstimeeH={cap.capacite_estimee_h !== null ? Number(cap.capacite_estimee_h) : null}
                                  heuresPrevues={cap.heures_prevues !== null ? Number(cap.heures_prevues) : null}
                                  ratio={cap.ratio_capacite_vs_prevu !== null ? Number(cap.ratio_capacite_vs_prevu) : null}
                                />
                              )}
                            </div>
                            {canEdit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 gap-1 text-[11px]"
                                onClick={() =>
                                  setAddCtx({
                                    phase: "fabrication",
                                    restrictMetierIds: [fm.metierId],
                                    subEtapeLabel: fm.label,
                                  })
                                }
                                data-testid={`casting-add-fab-metier-${fm.code}`}
                              >
                                <Plus className="h-3 w-3" />
                                Personne
                              </Button>
                            )}
                          </div>
                          {list.length === 0 ? (
                            <p className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-2 text-[11px] italic text-muted-foreground">
                              Aucune personne en {fm.label.toLowerCase()}.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {list.map(renderMemberCard)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {fabBuckets.autre.length > 0 && (
                      <div data-testid="casting-fab-autre">
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Autre{" "}
                          <span className="font-mono text-foreground/70">
                            ({fabBuckets.autre.length})
                          </span>
                        </p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {fabBuckets.autre.map(renderMemberCard)}
                        </div>
                      </div>
                    )}
                  </div>
                </TooltipProvider>
              ) : members.length === 0 ? (
                <p className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-3 text-xs italic text-muted-foreground">
                  Aucun membre — ajoutez une personne ou publiez un plan staffing.
                </p>
              ) : (
                <TooltipProvider>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {members.map(renderMemberCard)}
                  </div>
                </TooltipProvider>
              )}
            </section>
          );
        })}
      </div>

      {addCtx && (
        <AddCastingMemberSheet
          open={!!addCtx}
          onOpenChange={(o) => !o && setAddCtx(null)}
          affaireId={affaireId}
          phase={addCtx.phase}
          phaseLabel={PHASE_LABELS[addCtx.phase]}
          restrictMetierIds={addCtx.restrictMetierIds}
          subEtapeLabel={addCtx.subEtapeLabel}
          excludeEmployeIds={(data?.phases[addCtx.phase] ?? []).map((m) => m.employe_id)}
        />
      )}

      {removeTarget && (
        <RemoveCastingMemberDialog
          open={!!removeTarget}
          onOpenChange={(o) => !o && setRemoveTarget(null)}
          affaireId={affaireId}
          employeId={removeTarget.employeId}
          employeLabel={removeTarget.employeLabel}
          phase={removeTarget.phase}
        />
      )}

      {publishedPlanId && (
        <RepublishConflictDialog
          open={republishOpen}
          onOpenChange={setRepublishOpen}
          planId={publishedPlanId}
        />
      )}
    </div>
  );
}
