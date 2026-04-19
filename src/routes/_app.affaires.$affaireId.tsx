import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, MapPin, User, Calendar, Lock, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { StatutPill } from "./_app.affaires";

interface AffaireDetail {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  lieu: string | null;
  statut: "prospect" | "en_cours" | "termine" | "annule";
  date_debut: string | null;
  date_fin_prevue: string | null;
  notes: string | null;
}

export const Route = createFileRoute("/_app/affaires/$affaireId")({
  head: () => ({ meta: [{ title: "Affaire — Setup Paris" }] }),
  component: AffaireDetailLayout,
});

function AffaireDetailLayout() {
  const { affaireId } = Route.useParams();
  const routerState = useRouterState();
  const path = routerState.location.pathname;
  const [affaire, setAffaire] = useState<AffaireDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("affaires")
      .select("id, numero, nom, client, lieu, statut, date_debut, date_fin_prevue, notes")
      .eq("id", affaireId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setAffaire(data as AffaireDetail | null);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [affaireId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!affaire) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-muted-foreground">Affaire introuvable.</p>
        <Link to="/affaires" className="mt-4 inline-flex items-center text-sm font-semibold text-primary">
          <ArrowLeft className="mr-1 h-4 w-4" /> Retour à la liste
        </Link>
      </div>
    );
  }

  const tabs = [
    { to: `/affaires/${affaire.id}`, label: "Synthèse", match: path === `/affaires/${affaire.id}` },
    { to: `/affaires/${affaire.id}/devis`, label: "Devis", match: path.endsWith("/devis") },
    { to: `/affaires/${affaire.id}/staffing`, label: "Staffing", match: path.endsWith("/staffing") },
    { to: `/affaires/${affaire.id}/journal`, label: "Journal", match: path.endsWith("/journal") },
  ];

  return (
    <div className="mx-auto max-w-7xl p-6">
      <Link to="/affaires" className="inline-flex items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-3 w-3" /> Affaires
      </Link>

      <div className="mt-3 flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="overline">— {affaire.numero}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">{affaire.nom}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {affaire.client && (
              <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{affaire.client}</span>
            )}
            {affaire.lieu && (
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{affaire.lieu}</span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatPeriode(affaire.date_debut, affaire.date_fin_prevue)}
            </span>
          </div>
        </div>
        <StatutPill statut={affaire.statut} />
      </div>

      {/* Onglets */}
      <nav className="mt-4 flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className={[
              "rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors",
              t.match
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="py-6">
        <Outlet />
      </div>
    </div>
  );
}

function formatPeriode(start: string | null, end: string | null) {
  if (!start && !end) return "Pas de période renseignée";
  const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  if (start && end) return `${fmt(start)} → ${fmt(end)}`;
  if (start) return `dès ${fmt(start)}`;
  return `→ ${fmt(end!)}`;
}
