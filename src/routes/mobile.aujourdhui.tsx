import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Inbox } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { usePreview } from "@/lib/preview-context";
import { PreviewBanner } from "@/components/PreviewBanner";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/mobile/aujourdhui")({
  head: () => ({ meta: [{ title: "Aujourd'hui — Setup Paris" }] }),
  component: MobileAujourdhui,
});

function formatToday() {
  return new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function MobileAujourdhui() {
  const { user, signOut } = useAuth();
  const { isPreviewing, setPreviewRole } = usePreview();
  const navigate = useNavigate();

  const handleQuitPreview = () => {
    setPreviewRole(null);
    navigate({ to: "/planning" });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <PreviewBanner />

      <header className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto flex max-w-md items-start justify-between gap-2">
          <div>
            <p className="overline">— Aujourd'hui</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground capitalize">
              {formatToday()}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-[220px]">
              {user?.email}
            </p>
          </div>
          {isPreviewing ? (
            <Button size="sm" variant="outline" onClick={() => setPreviewRole(null)}>
              Quitter preview
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => signOut()}>
              Déconnexion
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-6">
        <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold text-foreground">
            Aucune assignation aujourd'hui
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Vos assignations chantier apparaîtront ici dès qu'un chef d'équipe vous aura planifié.
          </p>
        </section>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          MVP — saisie d'heures à venir
        </p>
      </main>

      <MobileBottomNav />
    </div>
  );
}
