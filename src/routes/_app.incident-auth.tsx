import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { AlertTriangle, RefreshCw, ShieldAlert, Activity, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/lib/auth-context";
import { useAuthEvents, type AuthEventRow } from "@/hooks/use-audit-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AuthEventBadge } from "@/components/audit-auth/AuthEventBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/_app/incident-auth")({
  component: IncidentAuthPage,
});

/** Types d'événements considérés "incidents" auth. */
const INCIDENT_TYPES = ["login_failed", "signup_failed"] as const;

/** Conseils de dépannage (palette métier). */
const TROUBLESHOOTING: Array<{
  symptome: string;
  causes: string[];
  actions: string[];
}> = [
  {
    symptome: "Échecs de connexion répétés sur le même email",
    causes: [
      "Mot de passe oublié ou expiré",
      "Compte invité jamais activé (password_set_done = false)",
      "Tentative de bruteforce",
    ],
    actions: [
      "Vérifier le statut dans /audit-auth (onglet Connexions)",
      "Renvoyer une invitation depuis /parametres/utilisateurs",
      "Proposer un reset via /auth/forgot-password",
    ],
  },
  {
    symptome: "Échec d'inscription (signup_failed)",
    causes: [
      "Domaine email non autorisé",
      "Email déjà existant en base",
      "Quota Supabase atteint",
    ],
    actions: [
      "Vérifier la liste utilisateurs dans /audit-auth",
      "Créer le compte manuellement via invitation admin",
    ],
  },
  {
    symptome: "Boucle /auth/set-password (bouton inerte)",
    causes: [
      "markPasswordSet a échoué côté serveur",
      "Hash de session perdu pendant le redirect racine",
    ],
    actions: [
      "Demander à l'utilisateur de cliquer à nouveau sur le lien d'invitation",
      "Si persistant : sign out + reset password",
      "Hotfix v0.26.3 documenté dans /roadmap",
    ],
  },
  {
    symptome: "Pic d'erreurs sur courte période",
    causes: [
      "Incident provider auth (Supabase status)",
      "Déploiement récent ayant introduit une régression",
    ],
    actions: [
      "Vérifier https://status.supabase.com",
      "Comparer avec la dernière version dans /roadmap",
      "Rollback si corrélation claire avec un déploiement",
    ],
  },
];

function IncidentAuthPage() {
  const { isAdmin, rolesLoaded } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (rolesLoaded && !isAdmin) {
      navigate({ to: "/dashboard" });
    }
  }, [rolesLoaded, isAdmin, navigate]);

  // 24h glissantes : on prend "today" si récent sinon 7d puis on filtre 24h en client.
  // Plus simple : on demande 7d et on filtre les dernières 24h pour être robuste.
  const query = useAuthEvents({
    types: [...INCIDENT_TYPES],
    preset: "7d",
    limit: 500,
  });

  const last24h = useMemo<AuthEventRow[]>(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return (query.data ?? []).filter((e) => {
      const t = new Date(e.created_at).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
  }, [query.data]);

  const stats = useMemo(() => {
    const byType = new Map<string, number>();
    const byEmail = new Map<string, number>();
    for (const ev of last24h) {
      if (ev.action) byType.set(ev.action, (byType.get(ev.action) ?? 0) + 1);
      if (ev.actor_email) byEmail.set(ev.actor_email, (byEmail.get(ev.actor_email) ?? 0) + 1);
    }
    const topEmails = [...byEmail.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return {
      total: last24h.length,
      loginFailed: byType.get("login_failed") ?? 0,
      signupFailed: byType.get("signup_failed") ?? 0,
      topEmails,
    };
  }, [last24h]);

  if (!rolesLoaded || !isAdmin) return null;

  const severity =
    stats.total === 0 ? "ok" : stats.total < 5 ? "low" : stats.total < 20 ? "medium" : "high";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Incident Auth"
        description="État des erreurs d'authentification sur les dernières 24 heures et guide de dépannage"
      />

      {/* Bandeau sévérité */}
      <Alert
        variant={severity === "high" ? "destructive" : "default"}
        className={
          severity === "ok"
            ? "border-emerald-500/30 bg-emerald-500/5"
            : severity === "medium"
            ? "border-amber-500/30 bg-amber-500/5"
            : undefined
        }
      >
        {severity === "ok" ? (
          <Activity className="h-4 w-4 text-emerald-600" />
        ) : (
          <ShieldAlert className="h-4 w-4" />
        )}
        <AlertTitle>
          {severity === "ok" && "Aucun incident détecté"}
          {severity === "low" && "Activité d'erreurs faible"}
          {severity === "medium" && "Activité d'erreurs modérée"}
          {severity === "high" && "Pic d'erreurs détecté — investigation recommandée"}
        </AlertTitle>
        <AlertDescription>
          {stats.total} événement{stats.total > 1 ? "s" : ""} d'erreur sur les 24 dernières heures
          ({stats.loginFailed} connexion{stats.loginFailed > 1 ? "s" : ""} ·{" "}
          {stats.signupFailed} inscription{stats.signupFailed > 1 ? "s" : ""}).
        </AlertDescription>
      </Alert>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total erreurs (24h)</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Échecs connexion</CardDescription>
            <CardTitle className="text-3xl text-rose-600">{stats.loginFailed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Échecs inscription</CardDescription>
            <CardTitle className="text-3xl text-amber-600">{stats.signupFailed}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Top emails impactés */}
      {stats.topEmails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comptes les plus impactés</CardTitle>
            <CardDescription>Top 5 emails par nombre d'erreurs (24h)</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {stats.topEmails.map(([email, count]) => (
                <li
                  key={email}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <span className="font-mono text-sm">{email}</span>
                  <Badge variant="outline" className="bg-rose-500/10 text-rose-700 border-rose-500/30">
                    {count} échec{count > 1 ? "s" : ""}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Liste événements */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Événements détaillés</CardTitle>
            <CardDescription>
              Erreurs auth des 24 dernières heures (triées du plus récent)
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${query.isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : query.error ? (
            <p className="text-sm text-destructive">
              Erreur de chargement : {(query.error as Error).message}
            </p>
          ) : last24h.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Activity className="h-8 w-8 text-emerald-600 mb-2" />
              <p className="text-sm text-muted-foreground">
                Aucun incident auth sur les 24 dernières heures.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-2">
              <ul className="space-y-2">
                {last24h.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex items-start gap-3 rounded-md border border-border p-3"
                  >
                    <AlertTriangle className="h-4 w-4 mt-0.5 text-rose-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <AuthEventBadge action={ev.action} />
                        <span className="text-xs text-muted-foreground">
                          {new Date(ev.created_at).toLocaleString("fr-FR")}
                        </span>
                      </div>
                      <p className="text-sm font-mono truncate">
                        {ev.actor_email ?? "—"}
                      </p>
                      {ev.ip_address && (
                        <p className="text-xs text-muted-foreground">IP : {ev.ip_address}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Conseils dépannage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Guide de dépannage</CardTitle>
          <CardDescription>
            Symptômes fréquents, causes probables et actions correctives
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {TROUBLESHOOTING.map((tip) => (
            <div
              key={tip.symptome}
              className="rounded-md border border-border p-4 space-y-2"
            >
              <h3 className="font-semibold text-sm">{tip.symptome}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Causes possibles
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {tip.causes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Actions
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {tip.actions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/audit-auth">
                <ExternalLink className="h-4 w-4 mr-2" />
                Audit Auth complet
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/parametres/utilisateurs">
                <ExternalLink className="h-4 w-4 mr-2" />
                Gestion utilisateurs
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/roadmap">
                <ExternalLink className="h-4 w-4 mr-2" />
                Roadmap (changelog auth)
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
