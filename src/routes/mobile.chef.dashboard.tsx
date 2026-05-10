import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Hammer, Users, Clock, FileSignature, MapPin } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { useChefDashboard } from "@/hooks/use-chef-dashboard";

export const Route = createFileRoute("/mobile/chef/dashboard")({
  head: () => ({ meta: [{ title: "Hub chef — Aujourd'hui" }] }),
  component: () => (
    <RoleGuard required="chef_or_admin">
      <ChefDashboard />
    </RoleGuard>
  ),
});

function ChefDashboard() {
  const { data, isLoading } = useChefDashboard();

  return (
    <>
      <ChefMobileHeader title="Aujourd'hui" />
      <div className="mx-auto max-w-xl space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Chantiers actifs" value={data?.chantiersActifs.length ?? 0} icon={MapPin} loading={isLoading} />
          <KpiCard
            label="Présents équipe"
            value={data?.presents ?? 0}
            sub={data ? `${data.absentsValides} absents` : undefined}
            icon={Users}
            loading={isLoading}
          />
          <KpiCard
            label="Heures à valider"
            value={data?.heuresAValider ?? 0}
            icon={Clock}
            loading={isLoading}
            href="/mobile/chef/equipe"
          />
          <KpiCard
            label="Contrats en attente"
            value={data?.contratsEnAttente ?? 0}
            icon={FileSignature}
            loading={isLoading}
            href="/mobile/chef/contrats"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Chantiers du jour
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : data?.chantiersActifs.length ? (
              data.chantiersActifs.map((c) => (
                <Link
                  key={c.affaire_id}
                  to="/affaires/$affaireId"
                  params={{ affaireId: c.affaire_id }}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  <div>
                    <div className="font-mono text-xs text-muted-foreground">{c.numero}</div>
                    <div className="font-semibold truncate">{c.nom}</div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {c.nb_personnes}
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Aucun chantier staffé aujourd'hui.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Hammer className="h-4 w-4" /> Fabrication
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              to="/mobile/chef/fabrication"
              className="inline-flex w-full items-center justify-center rounded-md border px-3 py-3 text-sm font-medium hover:bg-accent"
            >
              Suivi des objets de fabrication →
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  loading,
  href,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: typeof Users;
  loading: boolean;
  href?: "/mobile/chef/equipe" | "/mobile/chef/contrats";
}) {
  const inner = (
    <Card className="h-full">
      <CardContent className="p-3">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
          <Icon className="h-4 w-4" />
        </div>
        {loading ? (
          <Skeleton className="mt-1 h-7 w-16" />
        ) : (
          <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
        )}
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
  if (href) return <Link to={href} className="block">{inner}</Link>;
  return inner;
}
