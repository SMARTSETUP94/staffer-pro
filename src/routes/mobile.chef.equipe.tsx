/**
 * v0.43.0 Sprint 1 — Onglet "Mon équipe" du Hub chef mobile.
 * 3 sous-actions : Staffer rapide, Saisir heures équipe, lien Validation.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, ClipboardList, UsersRound, ChevronRight, Plus } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StafferMobileForm } from "@/components/staffer/StafferMobileForm";
import { SaisirPourEmployeDialog } from "@/components/heures/SaisirPourEmployeDialog";
import { BulkSaisieDialog } from "@/components/heures/BulkSaisieDialog";
import { useChefAValider } from "@/hooks/use-chef-a-valider";

export const Route = createFileRoute("/mobile/chef/equipe")({
  head: () => ({ meta: [{ title: "Hub chef — Mon équipe" }] }),
  component: () => (
    <RoleGuard required="chef_or_admin">
      <ChefEquipe />
    </RoleGuard>
  ),
});

function ChefEquipe() {
  const [tab, setTab] = useState<"staffer" | "saisir" | "valider">("staffer");
  const [dlgPonctuelle, setDlgPonctuelle] = useState(false);
  const [dlgBulk, setDlgBulk] = useState(false);
  const { totalCount } = useChefAValider();

  return (
    <>
      <ChefMobileHeader title="Mon équipe" />
      <div className="mx-auto max-w-xl space-y-3 p-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="staffer" className="text-xs gap-1">
              <UsersRound className="h-3.5 w-3.5" /> Staffer
            </TabsTrigger>
            <TabsTrigger value="saisir" className="text-xs gap-1">
              <ClipboardList className="h-3.5 w-3.5" /> Saisir
            </TabsTrigger>
            <TabsTrigger value="valider" className="text-xs gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Valider
            </TabsTrigger>
          </TabsList>

          <TabsContent value="staffer" className="mt-3">
            <StafferMobileForm />
          </TabsContent>

          <TabsContent value="saisir" className="mt-3 space-y-3">
            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="text-sm font-semibold">Saisie pour un employé</div>
                <p className="text-xs text-muted-foreground">
                  Renseigne les heures réelles d'un employé sur une journée + une affaire.
                  Validé directement (saisie chef = validation).
                </p>
                <Button className="w-full" onClick={() => setDlgPonctuelle(true)}>
                  <Plus className="mr-1.5 h-4 w-4" /> Saisir une journée
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2 p-4">
                <div className="text-sm font-semibold">Saisie batch (semaine × équipe)</div>
                <p className="text-xs text-muted-foreground">
                  Plusieurs employés × plusieurs jours sur une même affaire (8h-17h par défaut).
                </p>
                <Button variant="outline" className="w-full" onClick={() => setDlgBulk(true)}>
                  <Plus className="mr-1.5 h-4 w-4" /> Saisie en bulk
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="valider" className="mt-3">
            <Link to="/mobile/chef/a-valider" className="block">
              <Card className="hover:bg-accent transition-colors">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> File de validation
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {totalCount > 0 ? `${totalCount} item${totalCount > 1 ? "s" : ""} en attente` : "Tout est à jour"}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          </TabsContent>
        </Tabs>
      </div>

      <SaisirPourEmployeDialog
        open={dlgPonctuelle}
        onOpenChange={setDlgPonctuelle}
      />
      <BulkSaisieDialog
        open={dlgBulk}
        onOpenChange={setDlgBulk}
      />
    </>
  );
}
