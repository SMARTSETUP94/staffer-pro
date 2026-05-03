// v0.35.5 / Sprint 5 — Page Gantt staffing + Wizard + Publication + Historique
// v0.35.x BATCH — Toolbar batch edition (sliders + shifts) + autosave 2 min idle.
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, History, Send, Zap, ListChecks, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  GanttInteractif,
  type PlanData,
  type GanttInteractifHandle,
} from "@/components/staffing/GanttInteractif";
import { StaffingPersonnesSection } from "@/components/staffing/StaffingPersonnesSection";
import {
  EquipeAffaireSection,
  useStaffingViewMode,
} from "@/components/staffing/EquipeAffaireSection";
import { PublishPlanDialog } from "@/components/staffing/PublishPlanDialog";
import { PlanHistoryDrawer } from "@/components/staffing/PlanHistoryDrawer";
import { DeletePlanDialog } from "@/components/staffing/DeletePlanDialog";
import { StaffingEditToolbar } from "@/components/staffing/StaffingEditToolbar";
import { AutoStaffPlanButton, type AutoStaffPlanButtonHandle } from "@/components/staffing/AutoStaffPlanButton";
import { StaffingShortcutsHelp } from "@/components/staffing/StaffingShortcutsHelp";
import { PreParametrageSection } from "@/components/staffing/PreParametrageSection";
import { listChantierMetierConfig, type ChantierMetierConfigRow } from "@/server/staffing-pre-parametrage.functions";
import { ExpressResultBanner } from "@/components/staffing/ExpressResultBanner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";

interface ExpressSearch {
  express?: string;
  published?: string;
  filled?: string;
  unfilled?: string;
  alertes?: string;
  reason?: string;
  jours?: string;
  delaiCourt?: string;
  we?: string;
}

export const Route = createFileRoute("/_app/staffing/$planId")({
  component: StaffingPlanPage,
  validateSearch: (search: Record<string, unknown>): ExpressSearch => ({
    express: typeof search.express === "string" ? search.express : undefined,
    published: typeof search.published === "string" ? search.published : undefined,
    filled: typeof search.filled === "string" ? search.filled : undefined,
    unfilled: typeof search.unfilled === "string" ? search.unfilled : undefined,
    alertes: typeof search.alertes === "string" ? search.alertes : undefined,
    reason: typeof search.reason === "string" ? search.reason : undefined,
    jours: typeof search.jours === "string" ? search.jours : undefined,
    delaiCourt: typeof search.delaiCourt === "string" ? search.delaiCourt : undefined,
    we: typeof search.we === "string" ? search.we : undefined,
  }),
});

function StaffingPlanPage() {
  const { planId } = Route.useParams();
  const { isAdminOrChef, rolesLoaded, isAdmin } = useAuth();
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const ganttRef = useRef<GanttInteractifHandle>(null);
  const autoStaffRef = useRef<AutoStaffPlanButtonHandle>(null);
  const [equipeRefresh, setEquipeRefresh] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [viewMode, setViewMode] = useStaffingViewMode();
  const [planMeta, setPlanMeta] = useState<{
    status: string;
    published_at: string | null;
    published_by_name: string | null;
    parent_plan_id: string | null;
  } | null>(null);
  const [affaireMeta, setAffaireMeta] = useState<{
    id: string;
    numero: string;
    nom: string;
  } | null>(null);
  const [preParamConfigs, setPreParamConfigs] = useState<ChantierMetierConfigRow[]>([]);
  const loadConfigs = useServerFn(listChantierMetierConfig);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("staffing_plan")
      .select(
        "affaire_id, status, published_at, published_by, parent_plan_id, affaires:affaire_id(id, numero, nom)",
      )
      .eq("id", planId)
      .maybeSingle()
      .then(async ({ data }) => {
        if (cancelled || !data) return;
        if (data.affaires) {
          const aff = data.affaires as { id: string; numero: string; nom: string };
          setAffaireMeta({ id: aff.id, numero: aff.numero, nom: aff.nom });
        }
        let publishedByName: string | null = null;
        if (data.published_by) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", data.published_by)
            .maybeSingle();
          publishedByName = prof?.full_name ?? prof?.email ?? null;
        }
        if (cancelled) return;
        setPlanMeta({
          status: data.status as string,
          published_at: data.published_at as string | null,
          published_by_name: publishedByName,
          parent_plan_id: data.parent_plan_id as string | null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [planId, refreshKey]);

  if (!rolesLoaded) return null;
  if (!isAdminOrChef) return <Navigate to="/dashboard" />;

  const objetsLabel: Record<string, string> = {};
  if (planData) {
    for (const o of planData.objets) {
      objetsLabel[o.objet_id] = `${o.reference} — ${o.nom}`;
    }
  }

  const breadcrumbSteps: { label: string; to?: string }[] = [
    { label: "Affaires", to: "/affaires" },
  ];
  if (affaireMeta) {
    breadcrumbSteps.push({
      label: `${affaireMeta.numero} — ${affaireMeta.nom}`,
      to: `/affaires/${affaireMeta.id}/fabrication`,
    });
  }
  breadcrumbSteps.push({ label: "Plan staffing" });

  const status = planMeta?.status ?? planData?.plan?.status ?? "draft";
  const isDraft = status === "draft";
  const isPublished = status === "published";
  const isArchived = status === "archived";

  // Calcul jours / personnes affectés (pour le dialog publish)
  const stepsWithDate = (planData?.result.steps ?? []).filter(
    (s) => s.start_date !== "TBD",
  );
  const allDates = new Set<string>();
  for (const s of stepsWithDate) {
    for (let i = 0; i < s.span_days; i++) {
      const d = new Date(s.start_date);
      d.setDate(d.getDate() + i);
      allDates.add(d.toISOString().slice(0, 10));
    }
  }
  // Approx personnes : sum pers max par métier
  const persByMetier = new Map<number, number>();
  for (const s of stepsWithDate) {
    persByMetier.set(s.metier_id, Math.max(persByMetier.get(s.metier_id) ?? 0, s.pers));
  }
  const approxPeople = Array.from(persByMetier.values()).reduce((a, b) => a + b, 0);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const search = Route.useSearch();
  const navigate = useNavigate();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const showExpressBanner =
    search.express === "1" && !bannerDismissed && (isDraft || isPublished);

  return (
    <div className="space-y-4 px-2 py-4 md:px-6">
      <PageBreadcrumbs steps={breadcrumbSteps} className="mb-2" />
      {showExpressBanner && (
        <ExpressResultBanner
          planId={planId}
          affaireId={affaireMeta?.id ?? null}
          published={search.published === "1"}
          filled={Number(search.filled ?? 0)}
          unfilled={Number(search.unfilled ?? 0)}
          alertesCritiques={Number(search.alertes ?? 0)}
          reason={search.reason ?? ""}
          joursOuvres={search.jours ? Number(search.jours) : undefined}
          delaiCourt={search.delaiCourt === "1"}
          includeWeekends={search.we === "1"}
          onDismiss={() => {
            setBannerDismissed(true);
            navigate({
              to: "/staffing/$planId",
              params: { planId },
              search: {} as never,
              replace: true,
            });
          }}
          onPublished={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="overline">— Auto-staffing Fabrication 5XXX</p>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">Plan de staffing</h1>
            {isDraft && <Badge variant="outline" className="bg-muted">Brouillon</Badge>}
            {isPublished && (
              <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                Publié{planMeta?.published_at ? ` le ${fmtDate(planMeta.published_at)}` : ""}
                {planMeta?.published_by_name ? ` par ${planMeta.published_by_name}` : ""}
              </Badge>
            )}
            {isArchived && (
              <Badge variant="secondary" className="bg-orange-500 text-white hover:bg-orange-600">
                Archivé (remplacé par version suivante)
              </Badge>
            )}
            <Badge variant="secondary">v0.35</Badge>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{planId}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StaffingShortcutsHelp
            onAutoStaff={
              isDraft && planData
                ? () => autoStaffRef.current?.trigger()
                : null
            }
          />
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="mr-1 h-3 w-3" /> Historique
          </Button>
          {isDraft && planData && (
            <AutoStaffPlanButton
              ref={autoStaffRef}
              planId={planId}
              stepsCount={planData.result.steps.filter((s) => s.start_date !== "TBD").length}
              onCompleted={() => {
                setRefreshKey((k) => k + 1);
                setEquipeRefresh((k) => k + 1);
              }}
            />
          )}
          {isDraft && planData && (
            <Button size="sm" onClick={() => setPublishOpen(true)}>
              <Send className="mr-1 h-3 w-3" /> Publier le plan
            </Button>
          )}
          {isAdmin && affaireMeta && (
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Supprimer
            </Button>
          )}
          {affaireMeta ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/affaires/$affaireId/fabrication" params={{ affaireId: affaireMeta.id }}>
                <ArrowLeft className="mr-1 h-3 w-3" /> Retour à l'affaire
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard">
                <ArrowLeft className="mr-1 h-3 w-3" /> Retour
              </Link>
            </Button>
          )}
        </div>
      </div>
      {isDraft && (
        <StaffingEditToolbar
          planId={planId}
          onSaved={() => ganttRef.current?.reload()}
        />
      )}
      <GanttInteractif
        ref={ganttRef}
        key={refreshKey}
        planId={planId}
        onDataLoaded={setPlanData}
      />
      {planData && (
        <>
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-2">
              Mode d'affectation
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={viewMode === "rapide" ? "default" : "ghost"}
                onClick={() => setViewMode("rapide")}
              >
                <Zap className="mr-1 h-3 w-3" /> Rapide (par affaire)
              </Button>
              <Button
                size="sm"
                variant={viewMode === "detaille" ? "default" : "ghost"}
                onClick={() => setViewMode("detaille")}
              >
                <ListChecks className="mr-1 h-3 w-3" /> Détaillé (par créneau)
              </Button>
            </div>
          </div>
          {viewMode === "rapide" && (
            <EquipeAffaireSection
              planId={planId}
              onAssigned={() => setEquipeRefresh((k) => k + 1)}
            />
          )}
          <StaffingPersonnesSection
            key={equipeRefresh}
            planId={planId}
            steps={planData.result.steps}
            objetsLabel={objetsLabel}
          />
        </>
      )}

      {affaireMeta && planData && (
        <PublishPlanDialog
          planId={planId}
          affaireLabel={`${affaireMeta.numero} — ${affaireMeta.nom}`}
          affectedDays={allDates.size}
          affectedPeople={approxPeople}
          open={publishOpen}
          onOpenChange={setPublishOpen}
          onPublished={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <PlanHistoryDrawer
        planId={planId}
        canRestore={isAdminOrChef}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onRestored={() => setRefreshKey((k) => k + 1)}
      />
      {affaireMeta && (
        <DeletePlanDialog
          planId={planId}
          affaireId={affaireMeta.id}
          affaireNumero={affaireMeta.numero}
          affaireNom={affaireMeta.nom}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      )}
    </div>
  );
}
