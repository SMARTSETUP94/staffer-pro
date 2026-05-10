/**
 * v0.43.0 Sprint 1 — Onglet "Mon équipe" du Hub chef mobile.
 * 3 sous-actions : Staffer rapide, Saisir heures équipe, lien Validation.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, ClipboardList, UsersRound, Plus } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StafferMobileForm } from "@/components/staffer/StafferMobileForm";
import { SaisirPourEmployeDialog } from "@/components/heures/SaisirPourEmployeDialog";
import { BulkSaisieDialog } from "@/components/heures/BulkSaisieDialog";
import { useChefAValider } from "@/hooks/use-chef-a-valider";
import { ValiderHeuresList } from "@/components/mobile-chef/ValiderHeuresList";

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
            {totalCount === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
                  Tout est à jour.
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Heures à valider
                  <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                    {totalCount}
                  </Badge>
                </div>
                <ValiderHeuresList />
              </>
            )}
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
