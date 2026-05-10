import { createFileRoute } from "@tanstack/react-router";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MessageCircle, Mail, Phone } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useMesContratsDeclenches } from "@/hooks/use-mes-contrats-declenches";

export const Route = createFileRoute("/mobile/chef/contrats")({
  head: () => ({ meta: [{ title: "Hub chef — Contrats" }] }),
  component: () => (
    <RoleGuard required="chef_or_admin">
      <ChefContrats />
    </RoleGuard>
  ),
});

const STATUT_LABEL: Record<string, { label: string; tone: string }> = {
  a_signer_employe: { label: "À signer (employé)", tone: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  a_signer_employeur: { label: "En attente RH", tone: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  signe: { label: "Signé", tone: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  archive: { label: "Archivé", tone: "bg-muted text-muted-foreground" },
};

function ChefContrats() {
  const { data, isLoading } = useMesContratsDeclenches();

  const groups = (data ?? []).reduce<Record<string, typeof data extends (infer U)[] | undefined ? U[] : never>>(
    (acc, c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (acc[c.statut] ??= [] as any).push(c);
      return acc;
    },
    {},
  );

  const order = ["a_signer_employe", "a_signer_employeur", "signe", "archive"];

  return (
    <>
      <ChefMobileHeader title="Mes contrats déclenchés" />
      <div className="mx-auto max-w-xl space-y-4 p-4">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (data?.length ?? 0) === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
            Aucun contrat déclenché ces 60 derniers jours.
          </CardContent></Card>
        ) : (
          order.filter((s) => groups[s]?.length).map((statut) => (
            <div key={statut} className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {STATUT_LABEL[statut]?.label ?? statut} · {groups[statut].length}
              </h2>
              {groups[statut].map((c) => (
                <Card key={c.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{c.employe_nom ?? "—"}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          <span className="font-mono">{c.chantier_numero}</span> · {c.chantier_nom}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(c.date_debut), "d MMM", { locale: fr })} →{" "}
                          {format(new Date(c.date_fin), "d MMM yyyy", { locale: fr })}
                        </div>
                      </div>
                      <Badge variant="outline" className={STATUT_LABEL[statut]?.tone}>
                        {STATUT_LABEL[statut]?.label ?? statut}
                      </Badge>
                    </div>
                    {statut === "a_signer_employe" && c.employe_telephone && (
                      <div className="flex flex-wrap gap-1.5">
                        <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                          <a href={`https://wa.me/${c.employe_telephone.replace(/[^0-9]/g, "")}?text=Bonjour, ton contrat est à signer dans l'app.`}>
                            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                          </a>
                        </Button>
                        <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                          <a href={`sms:${c.employe_telephone}?body=${encodeURIComponent("Ton contrat est à signer dans l'app.")}`}>
                            <Phone className="h-3.5 w-3.5" /> SMS
                          </a>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}
