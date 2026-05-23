import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { StafferMobileForm } from "@/components/staffer/StafferMobileForm";
import { useVocab } from "@/hooks/use-vocab";

export const Route = createFileRoute("/mobile/chef/staffer")({
  head: () => ({ meta: [{ title: "Hub chef — Staffer" }] }),
  component: ChefStafferPage,
});

function ChefStafferPage() {
  const vocab = useVocab();
  return (
    <RoleGuard required="chef_or_admin">
      <>
        <ChefMobileHeader title={vocab.assignerPonctuel} />
        <div className="mx-auto max-w-xl p-4">
          <StafferMobileForm scopeToChef />
          <p className="text-xs text-muted-foreground mt-3">
            Seuls les chantiers et les coéquipiers de votre périmètre s'affichent.
          </p>
        </div>
      </>
    </RoleGuard>
  );
}

