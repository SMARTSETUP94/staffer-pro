import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { QualiteDonneesPage } from "@/components/admin/QualiteDonneesPage";
export const Route=createFileRoute("/_app/admin/qualite-donnees")({
  beforeLoad:()=>requireCapability("section.admin"),
  head:()=>({meta:[{title:"Qualité des données — Setup Paris"},{name:"description",content:"Revue admin des personnes, du suivi commercial et des devis à revoir par Gabin."},{property:"og:title",content:"Qualité des données — Setup Paris"},{property:"og:description",content:"Personnes, commercial et devis : corrections validées et santé des données."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),
  component:QualiteDonneesPage,
});