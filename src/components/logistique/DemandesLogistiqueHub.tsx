import { useNavigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DemandesLogistiqueContent } from "./DemandesLogistiqueContent";
import { JalonnementsContent } from "./JalonnementsContent";

export function DemandesLogistiqueHub({ onglet }: { onglet: "demandes" | "jalonnements" }) {
  const navigate = useNavigate();
  return <div className="space-y-4 p-4 md:p-6">
    <Tabs value={onglet} onValueChange={value => void navigate({ to: value === "jalonnements" ? "/jalonnements" : "/demandes-logistique" })}>
      <TabsList aria-label="Demandes logistiques">
        <TabsTrigger value="demandes">Demandes logistiques</TabsTrigger>
        <TabsTrigger value="jalonnements">Jalonnements</TabsTrigger>
      </TabsList>
      <TabsContent value="demandes"><DemandesLogistiqueContent /></TabsContent>
      <TabsContent value="jalonnements"><JalonnementsContent /></TabsContent>
    </Tabs>
  </div>;
}
