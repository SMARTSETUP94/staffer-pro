// v0.35.2bis — Page Charge atelier multi-chantiers (gated section.planning_fab)
import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { ChargeAtelierMultiChantiers } from "@/components/staffing/ChargeAtelierMultiChantiers";
import { useVocab } from "@/hooks/use-vocab";

export const Route = createFileRoute("/_app/charge-atelier")({
  beforeLoad: () => requireCapability("section.planning_fab"),
  component: ChargeAtelierPage,
});

function ChargeAtelierPage() {
  const vocab = useVocab();

  return (
    <div className="space-y-4 px-2 py-4 md:px-6">
      <div>
        <p className="overline">— {vocab.autoRemplir}</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Charge atelier multi-chantiers</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Vue agrégée des plans publiés sur 4 semaines — détecte les conflits CNC et les pics atelier.
        </p>
      </div>
      <ChargeAtelierMultiChantiers />
    </div>
  );
}
