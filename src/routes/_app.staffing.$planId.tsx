// v0.35.2 — Page test Gantt staffing
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { GanttInteractif } from "@/components/staffing/GanttInteractif";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/staffing/$planId")({
  component: StaffingPlanPage,
});

function StaffingPlanPage() {
  const { planId } = Route.useParams();
  const { isAdminOrChef, rolesLoaded } = useAuth();
  if (!rolesLoaded) return null;
  if (!isAdminOrChef) return <Navigate to="/dashboard" />;

  return (
    <div className="space-y-4 px-2 py-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="overline">— Auto-staffing Fabrication 5XXX</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Plan de staffing</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{planId}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard">
            <ArrowLeft className="mr-1 h-3 w-3" /> Retour
          </Link>
        </Button>
      </div>
      <GanttInteractif planId={planId} />
    </div>
  );
}
