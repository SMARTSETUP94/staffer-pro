/**
 * v0.43.0 Sprint 1 — Hub Dashboard chef mobile.
 * KPI scopés via mes_affaires_chef (RPC), badges multi-rôles par affaire,
 * cards drill-down + alertes critiques.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Hammer,
  MapPin,
  Users,
} from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { RolesAffaireBadges } from "@/components/mobile-chef/RolesAffaireBadges";
import { useMesAffairesChef } from "@/hooks/use-mes-affaires-chef";
import { useChefAValider } from "@/hooks/use-chef-a-valider";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/mobile/chef/dashboard")({
  head: () => ({ meta: [{ title: "Hub chef — Dashboard" }] }),
  component: () => (
    <RoleGuard required="chef_or_admin">
      <ChefDashboard />
    </RoleGuard>
  ),
});

function ChefDashboard() {
  const { data: affaires, isLoading } = useMesAffairesChef();
  const { heures, objets, totalCount } = useChefAValider();

  const affairesActives = useMemo(
    () =>
      (affaires ?? []).filter(
        (a) => a.statut !== "termine" && a.statut !== "annule",
      ),
    [affaires],
  );
  const affaireIds = useMemo(() => affairesActives.map((a) => a.id), [affairesActives]);

  // KPI : équipe staffée cette semaine (assignations distinctes)
  const today = format(new Date(), "yyyy-MM-dd");
  const startWeek = format(subDays(new Date(), 7), "yyyy-MM-dd");
  const equipeQ = useQuery({
    queryKey: ["chef-equipe-7j", affaireIds.length],
    enabled: affaireIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("assignations")
        .select("employe_id")
        .in("affaire_id", affaireIds)
        .gte("date", startWeek)
        .lte("date", today);
      const set = new Set((data ?? []).map((r) => r.employe_id));
      return set.size;
    },
  });

  // KPI : photos uploadées sur mes affaires ces 7 derniers jours
  const photosQ = useQuery({
    queryKey: ["chef-photos-7j", affaireIds.length],
    enabled: affaireIds.length > 0,
    queryFn: async () => {
      const { count } = await supabase
        .from("affaire_documents")
        .select("id", { count: "exact", head: true })
        .in("affaire_id", affaireIds)
        .is("deleted_at", null)
        .ilike("mime_type", "image/%")
        .gte("uploaded_at", subDays(new Date(), 7).toISOString());
      return count ?? 0;
    },
  });

  // Alertes : objets en retard (date_fin_souhaitee < today + statut != fini),
  // heures non saisies depuis 3 jours (hors planning),
  // contrats à signer.
  const alertesQ = useQuery({
    queryKey: ["chef-alertes", affaireIds.length],
    enabled: affaireIds.length > 0,
    refetchInterval: 120_000,
    queryFn: async () => {
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const treeDaysAgo = format(subDays(new Date(), 3), "yyyy-MM-dd");

      const [{ data: objetsRetard }, { data: assigsManque }, { count: contratsCount }] =
        await Promise.all([
          supabase
            .from("fabrication_objets")
            .select("id, reference, nom, affaire_id, affaires(numero,nom)")
            .in("affaire_id", affaireIds)
            .eq("archive", false)
            .neq("statut_chef", "fini")
            .lt("date_fin_souhaitee", todayStr)
            .limit(20),
          supabase
            .from("assignations")
            .select("id, employe_id, date, affaire_id")
            .in("affaire_id", affaireIds)
            .gte("date", treeDaysAgo)
            .lt("date", todayStr)
            .limit(200),
          supabase
            .from("contrats_intermittents")
            .select("id", { count: "exact", head: true })
            .in("statut", ["a_signer_employe", "a_signer_employeur"]),
        ]);

      // Pour heures non saisies : on récupère heures_saisies couvertes
      const assigKeys = (assigsManque ?? []).map(
        (a) => `${a.employe_id}|${a.date}|${a.affaire_id}`,
      );
      let heuresManquantes = 0;
      if (assigKeys.length > 0) {
        const { data: hs } = await supabase
          .from("heures_saisies")
          .select("employe_id, date, affaire_id")
          .in("affaire_id", affaireIds)
          .gte("date", treeDaysAgo)
          .lt("date", todayStr);
        const present = new Set(
          (hs ?? []).map((h) => `${h.employe_id}|${h.date}|${h.affaire_id}`),
        );
        heuresManquantes = assigKeys.filter((k) => !present.has(k)).length;
      }

      return {
        objetsRetard: objetsRetard ?? [],
        heuresManquantes,
        contratsAttente: contratsCount ?? 0,
      };
    },
  });

  return (
    <>
      <ChefMobileHeader title="Hub chef" />
      <div className="mx-auto max-w-xl space-y-4 p-4">
        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            label="Mes affaires actives"
            value={affairesActives.length}
            icon={MapPin}
            loading={isLoading}
            href="/mobile/chef/planning"
          />
          <KpiCard
            label="Heures à valider"
            value={heures.length}
            icon={Clock}
            loading={false}
            href="/mobile/chef/a-valider"
          />
          <KpiCard
            label="Objets à valider"
            value={objets.length}
            icon={Hammer}
            loading={false}
            href="/mobile/chef/a-valider"
          />
          <KpiCard
            label="Équipe (7j)"
            value={equipeQ.data ?? 0}
            icon={Users}
            loading={equipeQ.isLoading}
            href="/mobile/chef/equipe"
          />
        </div>

        {/* Alertes critiques */}
        {alertesQ.data && (alertesQ.data.objetsRetard.length > 0 ||
          alertesQ.data.heuresManquantes > 0 ||
          alertesQ.data.contratsAttente > 0) ? (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" /> Alertes critiques
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {alertesQ.data.objetsRetard.length > 0 && (
                <Link to="/mobile/chef/a-valider" className="flex justify-between hover:underline">
                  <span>📦 Objets en retard</span>
                  <span className="font-bold tabular-nums">{alertesQ.data.objetsRetard.length}</span>
                </Link>
              )}
              {alertesQ.data.heuresManquantes > 0 && (
                <Link to="/mobile/chef/equipe" className="flex justify-between hover:underline">
                  <span>⏱ Heures non saisies (3j)</span>
                  <span className="font-bold tabular-nums">{alertesQ.data.heuresManquantes}</span>
                </Link>
              )}
              {alertesQ.data.contratsAttente > 0 && (
                <Link to="/mobile/chef/contrats" className="flex justify-between hover:underline">
                  <span>📝 Contrats à signer</span>
                  <span className="font-bold tabular-nums">{alertesQ.data.contratsAttente}</span>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : !alertesQ.isLoading && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="flex items-center gap-2 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Tout est à jour, bravo chef !
            </CardContent>
          </Card>
        )}

        {/* Liste affaires avec rôles */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Mes affaires ({affairesActives.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : affairesActives.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune affaire active où vous êtes chef.
              </p>
            ) : (
              affairesActives.slice(0, 10).map((a) => (
                <Link
                  key={a.id}
                  to="/mobile/chef/affaires/$affaireId"
                  params={{ affaireId: a.id }}
                  className="block rounded-md border px-3 py-2 hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-muted-foreground">{a.numero}</div>
                      <div className="font-semibold truncate text-sm">{a.nom}</div>
                    </div>
                  </div>
                  <RolesAffaireBadges roles={a.mes_roles} className="mt-1.5" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  loading,
  href,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  loading: boolean;
  href?: "/mobile/chef/equipe" | "/mobile/chef/contrats" | "/mobile/chef/a-valider" | "/mobile/chef/planning";
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
      </CardContent>
    </Card>
  );
  if (href) return <Link to={href} className="block">{inner}</Link>;
  return inner;
}
