/**
 * Sprint B — Démo atomes (PhaseBadge, HeuresTriplet, RoleSwitcher).
 *
 * URL : /dev/atoms (gating capability-driven non requis : page interne dev,
 * accessible à tout user authentifié via wrapper _app). Sert de cible E2E
 * smoke pour vérifier la non-régression visuelle des 3 atomes Sprint A/B.
 */
import { createFileRoute } from "@tanstack/react-router";
import { HeuresTriplet } from "@/components/atoms/HeuresTriplet";
import { PhaseBadge, type AffairePhase } from "@/components/atoms/PhaseBadge";
import { RoleSwitcher } from "@/components/atoms/RoleSwitcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/dev/atoms")({
  component: DevAtomsPage,
  head: () => ({ meta: [{ title: "Atomes Sprint B — démo" }] }),
});

const PHASES: AffairePhase[] = ["commercial_etude", "fabrication", "montage", "demontage"];

function DevAtomsPage() {
  return (
    <div className="container mx-auto space-y-6 p-6" data-testid="dev-atoms-root">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Atomes Sprint B — démo</h1>
        <p className="text-sm text-muted-foreground">
          Page interne de référence visuelle et cible des smoke tests E2E.
        </p>
      </header>

      <Card data-testid="atom-phase-badge">
        <CardHeader>
          <CardTitle>PhaseBadge — variantes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["outline", "solid", "pastille"] as const).map((variant) => (
            <div key={variant} className="space-y-1">
              <div className="text-xs uppercase text-muted-foreground">{variant}</div>
              <div className="flex flex-wrap gap-2">
                {PHASES.map((p) => (
                  <PhaseBadge key={p} phase={p} variant={variant} />
                ))}
                {PHASES.map((p) => (
                  <PhaseBadge key={`${p}-c`} phase={p} variant={variant} compact />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card data-testid="atom-heures-triplet">
        <CardHeader>
          <CardTitle>HeuresTriplet — modes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <div className="text-xs uppercase text-muted-foreground">row (défaut)</div>
            <HeuresTriplet prevues={120} staffees={100} realisees={80} showLabels />
          </div>
          <div className="space-y-1">
            <div className="text-xs uppercase text-muted-foreground">compact</div>
            <HeuresTriplet prevues={120} staffees={100} realisees={80} mode="compact" />
          </div>
          <div className="space-y-1">
            <div className="text-xs uppercase text-muted-foreground">card · total</div>
            <HeuresTriplet
              prevues={1200}
              staffees={1000}
              realisees={950}
              mode="card"
              unit="total"
            />
          </div>
        </CardContent>
      </Card>

      <Card data-testid="atom-role-switcher">
        <CardHeader>
          <CardTitle>RoleSwitcher</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Masqué si l'utilisateur a ≤ 1 rôle.
          </p>
          <RoleSwitcher />
        </CardContent>
      </Card>
    </div>
  );
}
