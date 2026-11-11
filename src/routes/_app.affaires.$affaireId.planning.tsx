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
  const [vue, setVue] = useState<"jour" | "semaine" | "mois">("semaine");

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

    const court = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
    const periode = (x: string, y: string) => `${court(x)} → ${court(y)}`;
    const out: LigneBarres[] = [];

    for (const r of roles.filter((r) => r.role === "concepteur" && r.date_debut && r.date_fin)) {
      const debut = r.date_debut as string, fin = r.date_fin as string;
      out.push({
        id: `be:${r.id}`, libelle: `Bureau d'étude · ${nomEmploye(r.employe_id)}`,
        detail: periode(debut, fin),
        barres: [{ id: `be:${r.id}`, affaireId: "be", libelle: "Conception", debut, fin, previsionnel: true }],
      });
    }
    if (d.affaire.atelier_date_debut && d.affaire.atelier_date_fin) {
      const debut = d.affaire.atelier_date_debut, fin = d.affaire.atelier_date_fin;
      out.push({
        id: "atelier", libelle: "Atelier · période globale", detail: periode(debut, fin),
        barres: [{ id: `atelier:${affaireId}`, affaireId: "atelier", libelle: "Atelier", debut, fin, previsionnel }],
      });
    }
    for (const p of d.periodes) {
      const m = d.metiers.find((x) => x.id === p.metier_id);
      const h = p.heures_prevues != null ? Number(p.heures_prevues) : null;
      out.push({
        id: `metier:${p.id}`, libelle: `↳ ${m?.libelle ?? "Métier"}`,
        detail: `${periode(p.date_debut, p.date_fin)}${h ? ` · ${h} h · ${Math.round((h / 8) * 10) / 10} j/h` : ""}`,
        barres: [{
          id: `metier:${p.id}`, affaireId: "atelier", libelle: h ? `${h} h` : (m?.libelle ?? "Métier"),
          debut: p.date_debut, fin: p.date_fin, previsionnel, metier: Number(p.metier_id),
        }],
      });
    }
    for (const e of etapes.filter((e) => e.statut !== "annule")) {
      const fin = e.date_fin && e.date_fin >= e.date_debut ? e.date_fin : e.date_debut;
      const nom = `${ETAPE_LABELS[e.type]}${e.sens ? ` ${e.sens}` : ""}`;
      out.push({
        id: `log:${e.id}`, libelle: `Logistique · ${nom}`,
        detail: fin === e.date_debut ? court(e.date_debut) : periode(e.date_debut, fin),
        barres: [{ id: `log:${e.id}`, affaireId: "log", libelle: nom, debut: e.date_debut, fin, previsionnel: false }],
      });
    }
    return out;
  }, [atelierQ.data, roles, employes, etapes, affaireId]);

  const [decalage, setDecalage] = useState(0);
  const fenetre = useMemo(() => {
    const auj = new Date().toISOString().slice(0, 10);
    if (vue === "jour") return { debut: addDays(auj, decalage), jours: 1, col: 640 };
    if (vue === "semaine") return { debut: addDays(auj, decalage * 7), jours: 7, col: 96 };
    const t = new Date(`${auj}T12:00:00`);
    const m = new Date(t.getFullYear(), t.getMonth() + decalage, 1, 12);
    const debut = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`;
    const jours = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    return { debut, jours, col: 24 };
  }, [vue, decalage]);
  const finFenetre = addDays(fenetre.debut, fenetre.jours - 1);
  const lignesVisibles = lignes.filter((l) => l.barres.some((x) => x.debut <= finFenetre && x.fin >= fenetre.debut));
  const libelleFenetre = (() => {
    const f = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", o);
    if (vue === "jour") return f(fenetre.debut, { weekday: "long", day: "numeric", month: "long" });
    if (vue === "semaine") return `${f(fenetre.debut, { day: "numeric", month: "short" })} → ${f(finFenetre, { day: "numeric", month: "short" })}`;
    return f(fenetre.debut, { month: "long", year: "numeric" });
  })();

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
            Une ligne par période, dans l'ordre : bureau d'étude, atelier (par métier), logistique. Pointillés = prévisionnel. Lecture seule.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Échelle">
            {(["jour", "semaine", "mois"] as const).map((v) => (
              <Button key={v} size="sm" variant={vue === v ? "default" : "ghost"} className="h-6 px-2 text-xs capitalize" onClick={() => { setVue(v); setDecalage(0); }}>
                {v}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" aria-label="Précédent" onClick={() => setDecalage((d) => d - 1)}>‹</Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setDecalage(0)}>Aujourd'hui</Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" aria-label="Suivant" onClick={() => setDecalage((d) => d + 1)}>›</Button>
            <span className="ml-1 text-xs font-medium first-letter:uppercase">{libelleFenetre}</span>
          </div>
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

      {!lignesVisibles.length ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Rien de planifié sur cette période pour ce chantier.
        </p>
      ) : (
        <PlanningBarres
          lignes={lignesVisibles}
          debut={fenetre.debut}
          semaines={Math.ceil(fenetre.jours / 7)}
          nbJours={fenetre.jours}
          parJour
          col={fenetre.col}
          entete="Période"
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
