import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/affaires/$affaireId/staffing")({
  component: () => (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <p className="overline mb-2">— Étape 3</p>
      <h2 className="text-lg font-bold text-foreground">Staffing par demi-journée</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Le drag & drop des employés sur les créneaux AM / PM / Journée arrive à l'étape 3 (Planning).
      </p>
    </div>
  ),
});
