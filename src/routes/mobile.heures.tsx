import { createFileRoute } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { PreviewBanner } from "@/components/PreviewBanner";
import { MobileBottomNav } from "@/components/MobileBottomNav";

export const Route = createFileRoute("/mobile/heures")({
  head: () => ({ meta: [{ title: "Mes heures — Setup Paris" }] }),
  component: MobileHeures,
});

function MobileHeures() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <PreviewBanner />
      <header className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto max-w-md">
          <p className="overline">— Mes heures</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            Saisie & historique
          </h1>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-6">
        <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Clock className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold text-foreground">À venir</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Saisie des heures réelles et historique de validation.
          </p>
        </section>
      </main>
      <MobileBottomNav />
    </div>
  );
}
