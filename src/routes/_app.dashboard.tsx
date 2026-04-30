import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useNotifications } from "@/hooks/use-notifications";
import { useDashboardLayout } from "@/hooks/use-dashboard-layout";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";
import { PersonnaliserDashboardSheet } from "@/components/dashboard/PersonnaliserDashboardSheet";
import { registerAllWidgets } from "@/components/dashboard/widgets/register-all";
import { getWidgetComponent, WIDGET_META } from "@/lib/dashboard/widget-registry";
import { getAllowedWidgetsForRole, type WidgetId } from "@/lib/dashboard/types";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — Setup Paris" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { unreadCount } = useNotifications();
  const { layout, loading, isPreset, saveLayout, resetToPreset } = useDashboardLayout();
  const { user } = useAuth();
  const { effectiveRole } = usePreview();

  useEffect(() => {
    registerAllWidgets();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // v0.27.4 — Defense in depth : double filtre au rendu (en plus du clamp dans le hook).
  // Garantit qu'AUCUN widget non autorisé ne traverse jusqu'au DOM, même si :
  //  - layout BDD a été corrompu directement
  //  - bug futur dans clampLayoutToRole
  //  - changement de rôle preview en cours de session
  const allowed = getAllowedWidgetsForRole(effectiveRole);
  const visibleWidgets = layout.visible.filter(
    (id): id is WidgetId => !!WIDGET_META[id] && allowed.has(id),
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        number="00"
        eyebrow="Pilotage / Tableau de bord"
        title="Bonjour"
        description={
          isPreset
            ? "Vue par défaut adaptée à votre rôle. Personnalisez à votre convenance."
            : "Votre vue personnalisée"
        }
        actions={
          user ? (
            <PersonnaliserDashboardSheet
              layout={layout}
              onSave={saveLayout}
              onReset={resetToPreset}
            />
          ) : null
        }
      />

      {unreadCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <p className="text-sm">
              <span className="font-semibold">
                {unreadCount} alerte{unreadCount > 1 ? "s" : ""} non lue{unreadCount > 1 ? "s" : ""}
              </span>
              <span className="ml-2 text-muted-foreground">dans la cloche notifications</span>
            </p>
          </div>
        </div>
      )}

      {visibleWidgets.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Aucun widget activé. Cliquez sur « Personnaliser » pour en ajouter.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleWidgets.map((id) => {
            const Comp = getWidgetComponent(id);
            const meta = WIDGET_META[id];
            const span = meta?.width === 2 ? "lg:col-span-2" : "";
            return (
              <div key={id} className={span}>
                {Comp ? <Comp /> : (
                  <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                    Widget « {meta?.title ?? id} » indisponible
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
