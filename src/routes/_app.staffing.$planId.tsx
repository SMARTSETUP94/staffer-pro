// v0.35.4 / Sprint 4 — Page Gantt staffing + Wizard intégré
// Breadcrumb : Affaires > [Numero — Nom] > Plan staffing
import { useEffect, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { GanttInteractif, type PlanData } from "@/components/staffing/GanttInteractif";
import { StaffingPersonnesSection } from "@/components/staffing/StaffingPersonnesSection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";

export const Route = createFileRoute("/_app/staffing/$planId")({
  component: StaffingPlanPage,
});

function StaffingPlanPage() {
  const { planId } = Route.useParams();
  const { isAdminOrChef, rolesLoaded } = useAuth();
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [affaireMeta, setAffaireMeta] = useState<{
    id: string;
    numero: string;
    nom: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("staffing_plan")
      .select("affaire_id, affaires:affaire_id(id, numero, nom)")
      .eq("id", planId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.affaires) return;
        const aff = data.affaires as { id: string; numero: string; nom: string };
        setAffaireMeta({ id: aff.id, numero: aff.numero, nom: aff.nom });
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

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

  const planStatus = planData?.plan?.status ?? "draft";

  return (
    <div className="space-y-4 px-2 py-4 md:px-6">
      <PageBreadcrumbs steps={breadcrumbSteps} className="mb-2" />
      <div className="flex items-center justify-between">
        <div>
          <p className="overline">— Auto-staffing Fabrication 5XXX</p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Plan de staffing</h1>
            <Badge variant={planStatus === "published" ? "default" : "outline"}>
              {planStatus === "published" ? "Publié" : "Brouillon"}
            </Badge>
            <Badge variant="secondary">v0.35</Badge>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{planId}</p>
        </div>
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
      <GanttInteractif
        key={refreshKey}
        planId={planId}
        onDataLoaded={setPlanData}
      />
      {planData && (
        <StaffingPersonnesSection
          planId={planId}
          steps={planData.result.steps}
          objetsLabel={objetsLabel}
          onAssignmentsChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
