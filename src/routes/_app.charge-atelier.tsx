// v0.35.2bis — Page Charge atelier multi-chantiers (chef+admin uniquement)
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { ChargeAtelierMultiChantiers } from "@/components/staffing/ChargeAtelierMultiChantiers";
import { useVocab } from "@/hooks/use-vocab";

export const Route = createFileRoute("/_app/charge-atelier")({
  component: ChargeAtelierPage,
});

function ChargeAtelierPage() {
  const { isAdminOrChef, rolesLoaded } = useAuth();
  const vocab = useVocab();
  if (!rolesLoaded) return null;
  if (!isAdminOrChef) return <Navigate to="/dashboard" />;

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

