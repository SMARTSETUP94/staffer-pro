// v0.48 Bloc 6 — /rh hub : module RH (KPIs + raccourcis)
// Lot 7.0b — gating via capability `rh.hub.view` (remplace l'ancien check
// `isAdmin || isRh` côté composant). beforeLoad bloque l'accès direct par URL.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users, Calendar, FileSignature, Loader2, ArrowRight, UserMinus, Cake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { requireCapability } from "@/lib/capability-guard";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/rh/")({
  head: () => ({ meta: [{ title: "RH — Setup Paris" }] }),
  beforeLoad: () => requireCapability("section.contrats_rh"),
  component: RhHubPage,
});

interface Kpis {
  effectifTotal: number;
  effectifActif: number;
  absencesEnAttente: number;
  absencesSemaine: number;
  contratsActifs: number;
  cdduMois: number;
  anniversairesMois: number;
}

function RhHubPage() {
  // Gating géré par requireCapability("rh.hub.view") en beforeLoad.
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const today = new Date().toISOString().slice(0, 10);
      const in7 = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
      const month = new Date().getMonth() + 1;

      const [
        { count: effectifTotal },
        { count: effectifActif },
        { count: absencesEnAttente },
        { count: absencesSemaine },
        { count: contratsActifs },
        { count: cdduMois },
      ] = await Promise.all([
        supabase.from("employes").select("*", { count: "exact", head: true }),
        supabase.from("employes").select("*", { count: "exact", head: true }).eq("actif", true),
        supabase.from("absences").select("*", { count: "exact", head: true }).eq("valide", false),
        supabase
          .from("absences")
          .select("*", { count: "exact", head: true })
          .gte("date_debut", today)
          .lte("date_debut", in7),
        supabase
          .from("contrats_intermittents")
          .select("*", { count: "exact", head: true })
          .lte("date_debut", today)
          .gte("date_fin", today),
        supabase
          .from("contrats_intermittents")
          .select("*", { count: "exact", head: true })
          .gte("date_debut", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)),

      ]);

      // Anniversaires du mois
      const { data: emps } = await supabase
        .from("employes")
        .select("date_naissance")
        .eq("actif", true)
        .not("date_naissance", "is", null);
      const anniversairesMois =
        (emps ?? []).filter((e: any) => {
          if (!e.date_naissance) return false;
          return new Date(e.date_naissance).getMonth() + 1 === month;
        }).length;

      if (cancelled) return;
      setKpis({
        effectifTotal: effectifTotal ?? 0,
        effectifActif: effectifActif ?? 0,
        absencesEnAttente: absencesEnAttente ?? 0,
        absencesSemaine: absencesSemaine ?? 0,
        contratsActifs: contratsActifs ?? 0,
        cdduMois: cdduMois ?? 0,
        anniversairesMois,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !kpis) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader title="Module RH" description="Pilotage équipe, absences et contrats" />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={<Users className="h-4 w-4" />} label="Effectif actif" value={kpis?.effectifActif} sub={`/ ${kpis?.effectifTotal ?? "—"} fiches`} loading={loading} />
        <KpiCard icon={<UserMinus className="h-4 w-4" />} label="Absences à valider" value={kpis?.absencesEnAttente} tone={(kpis?.absencesEnAttente ?? 0) > 0 ? "warn" : "ok"} loading={loading} />
        <KpiCard icon={<Calendar className="h-4 w-4" />} label="Absences semaine" value={kpis?.absencesSemaine} loading={loading} />
        <KpiCard icon={<FileSignature className="h-4 w-4" />} label="Contrats actifs" value={kpis?.contratsActifs} sub={`${kpis?.cdduMois ?? 0} créés ce mois`} loading={loading} />
      </div>

      {/* Cartes raccourcis */}
      <div className="grid gap-4 md:grid-cols-3">
        <ShortcutCard
          to="/employes"
          icon={<Users className="h-5 w-5" />}
          title="Équipe"
          description="Fiches employés, contrats, métiers, postes. 162 fiches à jour."
          stat={`${kpis?.effectifActif ?? "—"} actifs`}
        />
        <ShortcutCard
          to="/absences"
          icon={<Calendar className="h-5 w-5" />}
          title="Absences"
          description="Validation centralisée des congés et arrêts. Anti-doublons live."
          stat={`${kpis?.absencesEnAttente ?? 0} en attente`}
          tone={(kpis?.absencesEnAttente ?? 0) > 0 ? "warn" : "neutral"}
        />
        <ShortcutCard
          to="/rh/contrats"
          icon={<FileSignature className="h-5 w-5" />}
          title="Contrats CDDU"
          description="Génération en lot, signatures, archive PDF. Template v2.1."
          stat={`${kpis?.contratsActifs ?? "—"} actifs`}
        />
      </div>

      {/* Anniversaires + raccourcis secondaires */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Cake className="h-4 w-4 text-pink-500" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Anniversaires du mois
          </h3>
          <span className="ml-auto text-2xl font-bold tabular-nums">
            {kpis?.anniversairesMois ?? "—"}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {(kpis?.anniversairesMois ?? 0) > 0
            ? "Pensez à célébrer l'équipe — visible aussi sur le widget dashboard Anniversaires."
            : "Aucun anniversaire ce mois-ci."}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Link
          to="/admin/employes-poste-principal"
          className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition hover:border-primary/40 hover:bg-muted/30"
        >
          <div>
            <p className="text-sm font-semibold text-foreground">Postes principaux</p>
            <p className="text-xs text-muted-foreground">Saisie en lot + export/import Excel</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
        <Link
          to="/parametres/postes"
          className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition hover:border-primary/40 hover:bg-muted/30"
        >
          <div>
            <p className="text-sm font-semibold text-foreground">Catalogue des postes</p>
            <p className="text-xs text-muted-foreground">8 postes seed + CRUD admin</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  sub?: string;
  tone?: "neutral" | "ok" | "warn";
  loading: boolean;
}) {
  const toneCls =
    tone === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "ok"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", toneCls)}>
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (value ?? "—")}
      </div>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function ShortcutCard({
  to,
  icon,
  title,
  description,
  stat,
  tone = "neutral",
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  stat: string;
  tone?: "neutral" | "warn";
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <div className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          tone === "warn" ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary",
        )}>
          {icon}
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
      </div>
      <h3 className="mt-3 text-base font-bold text-foreground">{title}</h3>
      <p className="mt-1 flex-1 text-xs text-muted-foreground">{description}</p>
      <p className={cn(
        "mt-3 text-xs font-semibold",
        tone === "warn" ? "text-amber-600" : "text-primary",
      )}>
        {stat}
      </p>
    </Link>
  );
}
