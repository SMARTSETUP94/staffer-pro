import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { MargeChantierApp } from "@/components/marge-chantier/MargeChantierApp";

export const Route = createFileRoute("/_app/admin/marge-chantier")({
  beforeLoad: () => requireCapability("section.admin"),
  head: () => ({ meta: [{ title: "Marges chantiers — Setup Paris" }] }),
  component: MargeChantierPage,
});

function MargeChantierPage() {
  return <MargeChantierApp />;
}
