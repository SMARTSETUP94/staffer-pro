import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { PlanningBarres, type Barre, type LigneBarres } from "@/components/planning-simple/PlanningBarres";
import { useEtapesAffaire } from "@/hooks/use-etapes-logistiques";
import { useAffaireRoles, useEmployesActifs } from "@/hooks/use-equipe-projet";
import { ETAPE_LABELS } from "@/lib/logistique/etapes";
import { addDays, dayOfWeek, diffDays } from "@/lib/staffing/date-utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/affaires/$affaireId/planning")({
  beforeLoad: () => requireCapability("section.affaires"),
  head: () => ({ meta: [{ title: "Planning — Affaire — Setup Paris" }] }),
  component: AffairePlanningPage,
});

const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR");

/**
 * Rétroplanning de l'affaire : bureau d'étude, atelier et logistique sur une
 * seule frise, en lecture seule. Les modifications restent dans les plannings
 * dédiés (/planning-be, /planning-atelier, onglet Logistique).
 */
function AffairePlanningPage() {
  const { affaireId } = Route.useParams();
  const [ouvert, setOuvert] = useState<Barre | null>(null);

  const atelierQ = useQuery({
    queryKey: ["affaire-planning-retro", affaireId],
    queryFn: async () => {
      const [aff, periodes, metiers] = await Promise.all([
        supabase.from("affaires").select("id,numero,nom,phase,atelier_date_debut,atelier_date_fin").eq("id", affaireId).single(),
        supabase.from("affaire_planning_metier").select("id,metier_id,date_debut,date_fin,heures_prevues").eq("affaire_id", affaireId).order("date_debut"),
        supabase.from("metiers").select("id,libelle").order("ordre"),
      ]);
      for (const r of [aff, periodes, metiers]) if (r.error) throw new Error(r.error.message);
      if (!aff.data) throw new Error("Affaire introuvable.");
      return { affaire: aff.data, periodes: periodes.data ?? [], metiers: metiers.data ?? [] };
    },
  });
  const { data: roles = [] } = useAffaireRoles(affaireId);
  const { data: employes = [] } = useEmployesActifs();
  const { data: etapes = [] } = useEtapesAffaire(affaireId);

  const lignes = useMemo<LigneBarres[]>(() => {
    const d = atelierQ.data;
    if (!d) return [];
    const previsionnel = d.affaire.phase !== "signe";
    const nomEmploye = (id: string) => {
      const e = employes.find((x) => x.id === id);
      return e ? `${e.prenom ?? ""} ${e.nom ?? ""}`.trim() : "Concepteur";
    };

    const be: Barre[] = roles
      .filter((r) => r.role === "concepteur" && r.date_debut && r.date_fin)
      .map((r) => ({
        id: `be:${r.id}`, affaireId: "be",
        libelle: `BE · ${nomEmploye(r.employe_id)}`,
        debut: r.date_debut as string, fin: r.date_fin as string, previsionnel: true,
      }));

    const atelier: Barre[] = [];
    if (d.affaire.atelier_date_debut && d.affaire.atelier_date_fin) {
      atelier.push({
        id: `atelier:${affaireId}`, affaireId: "atelier",
        libelle: "Période atelier (globale)",
        debut: d.affaire.atelier_date_debut, fin: d.affaire.atelier_date_fin, previsionnel,
      });
    }
    for (const p of d.periodes) {
      const m = d.metiers.find((x) => x.id === p.metier_id);
      atelier.push({
        id: `metier:${p.id}`, affaireId: "atelier",
        libelle: `${m?.libelle ?? "Métier"}${p.heures_prevues != null ? ` · ${Number(p.heures_prevues)} h` : ""}`,
        debut: p.date_debut, fin: p.date_fin, previsionnel,
      });
    }

    const logistique: Barre[] = etapes
      .filter((e) => e.statut !== "annule")
      .map((e) => ({
        id: `log:${e.id}`, affaireId: "log",
        libelle: `${ETAPE_LABELS[e.type]}${e.sens ? ` ${e.sens}` : ""}`,
        debut: e.date_debut, fin: e.date_fin && e.date_fin >= e.date_debut ? e.date_fin : e.date_debut,
        previsionnel: false,
      }));

    return [
      { id: "be", libelle: "Bureau d'étude", barres: be },
      { id: "atelier", libelle: "Atelier", barres: atelier },
      { id: "logistique", libelle: "Logistique", barres: logistique },
    ].filter((l) => l.barres.length > 0);
  }, [atelierQ.data, roles, employes, etapes, affaireId]);

  const fenetre = useMemo(() => {
    const dates = lignes.flatMap((l) => l.barres.flatMap((b) => [b.debut, b.fin]));
    if (!dates.length) return null;
    const min = dates.reduce((a, b) => (b < a ? b : a));
    const max = dates.reduce((a, b) => (b > a ? b : a));
    const debut = addDays(min, -((dayOfWeek(min) + 6) % 7));
    const semaines = Math.min(12, Math.max(2, Math.ceil((diffDays(debut, max) + 1) / 7)));
    return { debut, semaines };
  }, [lignes]);

  if (atelierQ.isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (atelierQ.isError) {
    return <p role="alert" className="p-4 text-sm text-destructive">{atelierQ.error.message}</p>;
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Rétroplanning du chantier</h2>
          <p className="text-[11px] text-muted-foreground">
            Bureau d'étude, atelier et logistique — lecture seule. Modifications dans les plannings dédiés.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
            <Link to="/planning-be">Planning BE</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
            <Link to="/planning-atelier">Planning atelier</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
            <Link to="/affaires/$affaireId/logistique" params={{ affaireId }}>Logistique</Link>
          </Button>
        </div>
      </div>

      {!fenetre ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Aucune période planifiée pour ce chantier (ni BE, ni atelier, ni logistique).
        </p>
      ) : (
        <PlanningBarres
          lignes={lignes}
          debut={fenetre.debut}
          semaines={fenetre.semaines}
          editable={false}
          onOpen={setOuvert}
          onMove={() => undefined}
        />
      )}

      <Dialog open={!!ouvert} onOpenChange={(o) => !o && setOuvert(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ouvert?.libelle}</DialogTitle>
            <DialogDescription>
              {ouvert ? `Du ${fmt(ouvert.debut)} au ${fmt(ouvert.fin)}${ouvert.previsionnel ? " · prévisionnel" : ""}` : ""}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cette frise est en lecture seule : ajustez les dates dans le planning correspondant.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
