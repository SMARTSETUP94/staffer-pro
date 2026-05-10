import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { StafferMobileForm } from "@/components/staffer/StafferMobileForm";

export const Route = createFileRoute("/mobile/chef/staffer")({
  head: () => ({ meta: [{ title: "Hub chef — Staffer" }] }),
  component: () => (
    <RoleGuard required="chef_or_admin">
      <>
        <ChefMobileHeader title="Staffer rapide" />
        <div className="mx-auto max-w-xl p-4">
          <StafferMobileForm />
        </div>
      </>
    </RoleGuard>
  ),
});
