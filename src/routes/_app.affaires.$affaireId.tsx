import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, MapPin, User, Calendar, Lock, Unlock, Link2Off } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { StatutPill } from "./_app.affaires.index";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { AffaireKpiBar } from "@/components/affaire/AffaireKpiBar";
import { CapabilityGuard } from "@/components/auth/CapabilityGuard";
import { useCapability } from "@/hooks/use-capability";
import { useFeatureFlag } from "@/hooks/use-feature-flag";


interface AffaireDetail {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  client_id: string | null;
  lieu: string | null;
  statut: "prospect" | "en_cours" | "termine" | "annule";
  phase: "opportunite" | "signe";
  date_debut: string | null;
  date_fin_prevue: string | null;
  notes: string | null;
}

export const Route = createFileRoute("/_app/affaires/$affaireId")({
  beforeLoad: () => requireCapability("section.affaires"),
  head: () => ({ meta: [{ title: "Affaire — Setup Paris" }] }),
  component: AffaireDetailLayout,
});

function AffaireDetailLayout() {
  const { affaireId } = Route.useParams();
  const routerState = useRouterState();
  const path = routerState.location.pathname;
  const canManageAffaires = useCapability("section.affaires");
  const canAdminReopen = useCapability("section.admin");
  const [affaire, setAffaire] = useState<AffaireDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<"close" | "reopen" | null>(null);
  const [savingStatut, setSavingStatut] = useState(false);
  const canSeeEquipe = useCapability("affaire.equipe.view");
  const castingFlagOn = useFeatureFlag("equipes_3_niveaux_lecture");


  const fetchAffaire = async (id: string, signal?: { cancelled: boolean }) => {
    const { data } = await supabase
      .from("affaires")
      .select("id, numero, nom, client, client_id, lieu, statut, phase, date_debut, date_fin_prevue, notes")
      .eq("id", id)
      .maybeSingle();
    if (signal?.cancelled) return;
    setAffaire(data as AffaireDetail | null);
    setLoading(false);
  };

  const reload = () => {
    setLoading(true);
    void fetchAffaire(affaireId);
  };

  useEffect(() => {
    const signal = { cancelled: false };
    setLoading(true);
    void fetchAffaire(affaireId, signal);
    return () => { signal.cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affaireId]);

  const handleStatut = async () => {
    if (!affaire || !confirmAction) return;
    setSavingStatut(true);
    const newStatut = confirmAction === "close" ? "termine" : "en_cours";
    const { error } = await supabase
      .from("affaires").update({ statut: newStatut }).eq("id", affaire.id);
    setSavingStatut(false);
    if (error) {
      toast.error("Action impossible", { description: error.message });
    } else {
      toast.success(confirmAction === "close" ? "Affaire clôturée" : "Affaire rouverte");
      setConfirmAction(null);
      reload();
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!affaire) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-muted-foreground">Affaire introuvable.</p>
        <Link to="/affaires" className="mt-4 inline-flex items-center text-sm font-semibold text-primary">
          <ArrowLeft className="mr-1 h-4 w-4" /> Retour à la liste
        </Link>
      </div>
    );
  }




  const tabs = [
    { to: `/affaires/${affaire.id}`, label: "Synthèse", match: path === `/affaires/${affaire.id}` },
    { to: `/affaires/${affaire.id}/planning-chantier`, label: "Planning chantier", match: path.endsWith("/planning-chantier") },
    { to: `/affaires/${affaire.id}/devis`, label: "Devis", match: path.endsWith("/devis") },
    ...(affaire.phase === "signe"
      ? [{ to: `/affaires/${affaire.id}/fabrication`, label: "Fabrication", match: path.endsWith("/fabrication") }]
      : []),
    { to: `/affaires/${affaire.id}/staffing`, label: "Planning fab", match: path.endsWith("/staffing") },
    ...(canSeeEquipe
      ? [{ to: `/affaires/${affaire.id}/equipe`, label: "Équipe", match: path.endsWith("/equipe") }]
      : []),
    ...(castingFlagOn && canSeeEquipe
      ? [{ to: `/affaires/${affaire.id}/casting`, label: "Casting", match: path.endsWith("/casting") }]
      : []),
    { to: `/affaires/${affaire.id}/documents`, label: "Documents", match: path.endsWith("/documents") },
    { to: `/affaires/${affaire.id}/journal`, label: "Discussion", match: path.endsWith("/journal") },
  ];


  // Fil d'ariane dynamique selon l'onglet courant
  const currentTab = tabs.find((t) => t.match);
  const breadcrumbSteps: { label: string; to?: string }[] = [
    { label: "Affaires", to: "/affaires" },
    {
      label: `${affaire.numero} — ${affaire.nom}`,
      to: currentTab && currentTab.label !== "Synthèse" ? `/affaires/${affaire.id}` : undefined,
    },
  ];
  if (currentTab && currentTab.label !== "Synthèse") {
    breadcrumbSteps.push({ label: currentTab.label });
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageBreadcrumbs steps={breadcrumbSteps} className="mb-3" />
      <Link to="/affaires" className="inline-flex items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground sm:hidden">
        <ArrowLeft className="mr-1 h-3 w-3" /> Affaires
      </Link>

      <div className="mt-3 flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="overline">— {affaire.numero}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">{affaire.nom}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {affaire.client && (
              affaire.client_id ? (
                <Link to="/clients/$clientId" params={{ clientId: affaire.client_id }} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <User className="h-3 w-3" />{affaire.client}
                </Link>
              ) : (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 cursor-help text-muted-foreground/70">
                        <Link2Off className="h-3 w-3" />{affaire.client}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                      <p>Aucune fiche client n'est liée à cette affaire.</p>
                      <p className="mt-1 text-muted-foreground">Vous pouvez lier un client existant depuis la liste des affaires ou créer une fiche.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            )}
            {affaire.lieu && (
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{affaire.lieu}</span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatPeriode(affaire.date_debut, affaire.date_fin_prevue)}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatutPill statut={affaire.statut} />
          {canManageAffaires && affaire.statut !== "annule" && (
            affaire.statut === "termine" ? (
              canAdminReopen && (
                <Button size="sm" variant="outline" className="rounded-xl"
                  onClick={() => setConfirmAction("reopen")}>
                  <Unlock className="mr-1.5 h-3.5 w-3.5" /> Rouvrir
                </Button>
              )
            ) : (
              <Button size="sm" variant="outline" className="rounded-xl"
                onClick={() => setConfirmAction("close")}>
                <Lock className="mr-1.5 h-3.5 w-3.5" /> Clôturer
              </Button>
            )
          )}
        </div>
      </div>

      {/* KPI Bar Bloc 5 — gated par capability affaire.kpi.view */}
      <CapabilityGuard cap="affaire.kpi.view">
        <div className="mt-4">
          <AffaireKpiBar affaireId={affaire.id} />
        </div>
      </CapabilityGuard>

      {/* Onglets */}
      <nav className="mt-4 flex gap-1 border-b border-border overflow-x-auto">

        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={[
              "rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors",
              t.match
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="py-6">
        <Outlet />
      </div>

      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "close" ? `Clôturer l'affaire ${affaire.numero} ?` : `Rouvrir l'affaire ${affaire.numero} ?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "close"
                ? "Aucune nouvelle assignation ne pourra être créée tant que l'affaire reste clôturée. L'historique reste consultable. Un admin pourra rouvrir si besoin."
                : "L'affaire repasse en cours. Vous pourrez à nouveau créer des assignations."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleStatut} disabled={savingStatut}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              {savingStatut && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmAction === "close" ? "Clôturer" : "Rouvrir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatPeriode(start: string | null, end: string | null) {
  if (!start && !end) return "Pas de période renseignée";
  const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return `dès ${fmt(start)}`;
  return `→ ${fmt(end!)}`;
}
