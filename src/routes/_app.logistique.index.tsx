import { PlanningJourMobile } from "@/components/logistique/PlanningJourMobile";
import { CalendrierChantierDialog } from "@/components/logistique/CalendrierChantierDialog";
import { useServerFn } from "@tanstack/react-start";
import { syncOutlookLogistiqueFn } from "@/lib/server-fns/outlook-logistique.functions";
import { AlertTriangle, CalendarDays, CalendarSync, Download, Monitor, Plus, Printer } from "lucide-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { requireCapability } from "@/lib/capability-guard";
import { useCapability } from "@/hooks/use-capability";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { conflitsVehicules, decalerEtape, joursIso, ETAPE_LABELS, ETAPE_TYPES } from "@/lib/logistique/etapes";
import { useEtapesLogistiques, useInvalidateEtapes, type EtapeLogistique } from "@/hooks/use-etapes-logistiques";
import { LegendeEtapes, PlanningLogistiqueGrid } from "@/components/logistique/PlanningLogistiqueGrid";
import { EtapeDialog } from "@/components/logistique/EtapeDialog";
import { RegrouperToggle, useRegrouperParChantier } from "@/components/logistique/EtapeGroupeCard";
import { NavigationSemaine } from "@/components/logistique/NavigationSemaine";
import { PlanningEquipes, lundiCourant, usePlanningTerrain, useDroitsTerrain } from "@/components/logistique/PlanningEquipes";
import { ImportPlanningHebdomadaire } from "@/components/logistique/ImportPlanningHebdomadaire";
import { HistoriqueAffectationsExport } from "@/components/logistique/HistoriqueAffectationsExport";
import { ImportHistoriqueConsolide } from "@/components/logistique/ImportHistoriqueConsolide";
import { ajouterJours, numeroSemaine, plageSemaine } from "@/lib/dispos";
import { alertesPlanning, estJeudiOuApres, filtrerEtapes, sansReponse, FILTRES_VIDES, type Alerte, type FiltresPlanning } from "@/lib/logistique/planning-semaine";

const VUES = ["etapes", "equipes", "personnes", "chef"] as const;
type Vue = (typeof VUES)[number];

export const Route = createFileRoute("/_app/logistique/")({
  beforeLoad: () => requireCapability("logistique.planning.view"),
  validateSearch: (s: Record<string, unknown>): { vue?: Vue } => ({ vue: VUES.includes(s.vue as Vue) ? (s.vue as Vue) : undefined }),
  head: () => ({
    meta: [
      { title: "Planning logistique — Setup Paris" },
      { name: "description", content: "Planifier et staffer au même endroit : étapes, équipes et personnes de la semaine." },
      { property: "og:title", content: "Planning logistique — Setup Paris" },
      { property: "og:description", content: "Étapes, équipes et personnes du planning logistique hebdomadaire." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanningLogistiquePage,
});

const CLE_FILTRES = "planning-logistique-filtres";

function PlanningLogistiquePage() {
  const { vue: vueUrl } = Route.useSearch();
  const navigate = useNavigate({ from: "/logistique/" });
  const canEdit = useCapability("logistique.etape.edit");
  const canTerrain = useCapability("dispos.view");
  const droitsTerrain = useDroitsTerrain();
  const ecritTerrain = !!droitsTerrain.data;
  const vue: Vue = vueUrl && (vueUrl === "etapes" || canTerrain) ? vueUrl : "etapes";
  const setVue = (v: Vue) => navigate({ search: { vue: v === "etapes" ? undefined : v } });

  const [debut, setDebut] = useState(lundiCourant);
  const [semaines, setSemaines] = useState<1 | 2 | 4>(1);
  const [filtres, setFiltresState] = useState<FiltresPlanning>(FILTRES_VIDES);
  useEffect(() => { try { const r = localStorage.getItem(CLE_FILTRES); if (r) setFiltresState({ ...FILTRES_VIDES, ...JSON.parse(r) }); } catch { /* préférence illisible ignorée */ } }, []);
  const setFiltres = (p: Partial<FiltresPlanning>) => setFiltresState((f) => { const n = { ...f, ...p }; try { localStorage.setItem(CLE_FILTRES, JSON.stringify(n)); } catch { /* stockage indisponible */ } return n; });
  const [focus, setFocus] = useState<{ etape_id?: string; jour?: string } | null>(null);
  const [aTraiterOuvert, setATraiterOuvert] = useState(false);

  const [calendrierOpen, setCalendrierOpen] = useState(false);
  const [regrouper, setRegrouper] = useRegrouperParChantier();
  // Vue Étapes : semaine glissante à partir d'aujourd'hui sur la semaine courante (J → J+6), sinon à partir du lundi affiché.
  const debutEtapes = debut === lundiCourant() ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()) : debut;
  const jours = useMemo(() => joursIso(new Date(`${debutEtapes}T12:00:00`), semaines * 7), [debutEtapes, semaines]);
  const { data: etapesBrutes = [], isLoading } = useEtapesLogistiques(jours[0], jours[jours.length - 1]);
  const invalidate = useInvalidateEtapes();
  const [dlg, setDlg] = useState<{ open: boolean; etape?: EtapeLogistique | null; date?: string }>({ open: false });

  // Données terrain partagées (alertes + vues Équipes/Personnes)
  const terrain = usePlanningTerrain(debut, canTerrain);
  const aujourdhui = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
  const dates = Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i));
  const affaireIds = useMemo(() => [...new Set((terrain.data?.etapes ?? []).filter((e) => e.type === "montage").map((e) => e.affaire_id))], [terrain.data]);
  const demontages = useQuery({
    queryKey: ["planning-demontages", affaireIds], enabled: affaireIds.length > 0,
    queryFn: async () => { const { data } = await supabase.from("affaire_etapes_logistiques").select("affaire_id").in("affaire_id", affaireIds).eq("type", "demontage").neq("statut", "annule"); return new Set((data ?? []).map((d) => d.affaire_id)); },
  });
  const relance = canTerrain && estJeudiOuApres(aujourdhui) && aujourdhui >= debut && aujourdhui <= ajouterJours(debut, 6);
  const semaineSuivante = usePlanningTerrain(ajouterJours(debut, 7), relance);
  const alertes: Alerte[] = useMemo(() => {
    if (!terrain.data) return [];
    const s = terrain.data;
    return alertesPlanning({
      dates, etapes: s.etapes, affectations: s.affectations, personnes: s.references.personnes, dispos: s.dispos, aujourdhui, libelles: ETAPE_LABELS,
      avecDemontage: demontages.data ?? new Set(affaireIds),
      sansReponseSemaineSuivante: relance && semaineSuivante.data ? sansReponse(s.references.personnes.filter((p) => p.origine === "dispos"), semaineSuivante.data.dispos) : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain.data, demontages.data, semaineSuivante.data, relance, aujourdhui]);

  // Étapes filtrées (vue Étapes) : chantier/opération directement, filtres terrain via les identifiants retenus.
  const idsTerrain = useMemo(() => terrain.data ? new Set(filtrerEtapes(terrain.data.etapes, filtres, { affectations: terrain.data.affectations, personnes: terrain.data.references.personnes, alertes }).map((e) => e.id)) : null, [terrain.data, filtres, alertes]);
  const etapes = useMemo(() => etapesBrutes.filter((e) => {
    if (filtres.chantier && !`${e.affaire?.numero ?? ""} ${e.affaire?.nom ?? ""}`.toLocaleLowerCase("fr").includes(filtres.chantier.toLocaleLowerCase("fr"))) return false;
    if (filtres.operation && e.type !== filtres.operation) return false;
    if ((filtres.personne || filtres.nonPourvu || filtres.alerte) && idsTerrain && e.date_debut <= dates[6] && !idsTerrain.has(e.id)) return false;
    return true;
  }), [etapesBrutes, filtres, idsTerrain, dates]);
  const conflits = useMemo(() => conflitsVehicules(etapes), [etapes]);

  const [syncing, setSyncing] = useState(false);
  const syncFn = useServerFn(syncOutlookLogistiqueFn);
  async function resync() {
    setSyncing(true);
    try {
      const r = await syncFn();
      if (!r.ok) toast.error("Synchronisation Outlook impossible", { description: r.error });
      else if (r.errors.length) toast.warning(`Outlook : ${r.errors.length} erreur(s)`, { description: r.errors[0] });
      else toast.success("Agenda Outlook à jour", { description: `${r.created} ajoutée(s), ${r.updated} modifiée(s), ${r.deleted} retirée(s)` });
    } finally { setSyncing(false); }
  }
  async function move(e: EtapeLogistique, delta: number) {
    const d = decalerEtape(e, delta);
    const { error } = await supabase.rpc("deplacer_etape_logistique", { _etape_id: e.id, _nouveau_debut: d.date_debut, _nouvelle_fin: d.date_fin ?? undefined });
    if (error) toast.error("Déplacement impossible", { description: error.message }); else toast.success("Étape déplacée");
    invalidate();
  }
  const [exportBusy, setExportBusy] = useState(false);
  async function exporter() {
    if (!terrain.data) return;
    setExportBusy(true);
    try {
      const { creerExportPlanning, nomFichierPlanning } = await import("@/lib/imports/planning-equipes-export");
      const s = terrain.data;
      const blob = await creerExportPlanning(dates, s.etapes, s.affectations, s.references.personnes);
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = nomFichierPlanning(debut, ajouterJours(debut, 6), numeroSemaine(debut)); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export impossible"); }
    finally { setExportBusy(false); }
  }
  const ouvrirAlerte = (a: Alerte) => { if (!a.etape_id) return; setVue("equipes"); setFocus({ etape_id: a.etape_id, jour: a.jour }); };
  const rouges = alertes.filter((a) => a.gravite === "rouge").length;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Planning logistique · semaine {numeroSemaine(debut)}</h1>
        <p className="text-sm text-muted-foreground">{plageSemaine(debut)}{conflits.size > 0 && <span className="ml-2 font-medium text-destructive">· {conflits.size} étape(s) en conflit de véhicule</span>}</p>
        <div className="flex flex-wrap items-center gap-2">
          <NavigationSemaine debut={debut} onChange={setDebut} choisir><Button variant="outline" size="sm" onClick={() => setDebut(lundiCourant())}>Cette semaine</Button></NavigationSemaine>
          {vue === "etapes" && ([1, 2, 4] as const).map((n) => <Button key={n} variant={semaines === n ? "default" : "outline"} size="sm" onClick={() => setSemaines(n)}>{n} sem.</Button>)}
          {canEdit && <Button size="sm" onClick={() => setDlg({ open: true })}><Plus className="mr-1 h-4 w-4" />Étape</Button>}
          {canTerrain && terrain.data && <Button size="sm" variant="outline" disabled={exportBusy} onClick={() => void exporter()}><Download className="mr-1 h-4 w-4" />{exportBusy ? "Export…" : "Exporter"}</Button>}
          {ecritTerrain && <ImportPlanningHebdomadaire />}
          {ecritTerrain && <HistoriqueAffectationsExport />}
          <Button size="sm" variant="outline" onClick={() => setCalendrierOpen(true)}><CalendarDays className="mr-1 h-4 w-4" />Calendrier chantier</Button>
          <Button size="sm" variant="outline" asChild><Link to="/logistique/imprimer"><Printer className="mr-1 h-4 w-4" />Imprimer</Link></Button>
          <Button size="sm" variant="outline" asChild><Link to="/ecran-atelier"><Monitor className="mr-1 h-4 w-4" />Écran atelier</Link></Button>
          {canEdit && <Button size="sm" variant="outline" disabled={syncing} onClick={resync}><CalendarSync className="mr-1 h-4 w-4" />{syncing ? "Synchro…" : "Outlook"}</Button>}
        </div>
      </div>

      {canTerrain && alertes.length > 0 && (aTraiterOuvert ? <section aria-label="À traiter" className="rounded-lg border border-border bg-card">
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left font-semibold" onClick={() => setATraiterOuvert(false)} aria-expanded="true">
          <AlertTriangle className="size-4 text-destructive" />À traiter · {alertes.length}{rouges > 0 && <span className="rounded bg-destructive px-1.5 text-xs text-destructive-foreground">{rouges} urgentes</span>}<span className="ml-auto text-xs font-normal text-muted-foreground">Masquer</span>
        </button>
        <ul className="max-h-64 divide-y divide-border overflow-auto border-t border-border">{alertes.map((a, i) => <li key={i}>
          <button type="button" disabled={!a.etape_id} onClick={() => ouvrirAlerte(a)} className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm enabled:hover:bg-muted">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${a.gravite === "rouge" ? "bg-destructive" : "bg-warning"}`} />
            {a.jour && <span className="shrink-0 text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric" }).format(new Date(`${a.jour}T12:00:00`))}</span>}
            <span>{a.texte}</span>
          </button></li>)}</ul>
      </section> : <Button type="button" variant="outline" size="sm" onClick={() => setATraiterOuvert(true)} aria-expanded="false" className="border-destructive/40 text-destructive">
        <AlertTriangle className="mr-1 h-4 w-4" />À traiter · {alertes.length}{rouges > 0 && <span className="ml-1 rounded bg-destructive px-1.5 text-xs text-destructive-foreground">{rouges} urgentes</span>}
      </Button>)}

      <Tabs value={vue} onValueChange={(v) => setVue(v as Vue)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="etapes">Étapes</TabsTrigger>
          {canTerrain && <TabsTrigger value="equipes">Équipes</TabsTrigger>}
          {canTerrain && <TabsTrigger value="personnes">Personnes</TabsTrigger>}
          {canTerrain && !ecritTerrain && <TabsTrigger value="chef">Mes chantiers</TabsTrigger>}
        </TabsList>
      </Tabs>

      <div className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-2 lg:grid-cols-6">
        <Input aria-label="Filtrer par chantier" placeholder="Chantier (n° ou nom)" value={filtres.chantier} onChange={(e) => setFiltres({ chantier: e.target.value })} />
        <select aria-label="Filtrer par opération" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filtres.operation} onChange={(e) => setFiltres({ operation: e.target.value })}>
          <option value="">Toutes opérations</option>{ETAPE_TYPES.map((t) => <option key={t} value={t}>{ETAPE_LABELS[t]}</option>)}
        </select>
        {canTerrain && <Input aria-label="Filtrer par personne" placeholder="Personne" value={filtres.personne} onChange={(e) => setFiltres({ personne: e.target.value })} />}
        {canTerrain && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filtres.nonPourvu} onChange={(e) => setFiltres({ nonPourvu: e.target.checked })} />Non pourvu</label>}
        {canTerrain && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filtres.alerte} onChange={(e) => setFiltres({ alerte: e.target.checked })} />Avec alerte</label>}
        <Button variant="ghost" size="sm" onClick={() => setFiltres(FILTRES_VIDES)}>Effacer les filtres</Button>
      </div>

      {vue === "etapes" ? <>
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="hidden md:block"><LegendeEtapes /></div><RegrouperToggle value={regrouper} onChange={setRegrouper} /></div>
        {isLoading ? <p className="text-sm text-muted-foreground">Chargement…</p> : <>
          <div className="md:hidden"><PlanningJourMobile jours={jours} etapes={etapes} conflits={conflits} regrouper={regrouper} onCardClick={canEdit ? (e) => setDlg({ open: true, etape: e }) : undefined} onAdd={canEdit ? (d) => setDlg({ open: true, date: d }) : undefined} /></div>
          <div className="hidden md:block"><PlanningLogistiqueGrid jours={jours} etapes={etapes} conflits={conflits} regrouper={regrouper} onCardClick={canEdit ? (e) => setDlg({ open: true, etape: e }) : undefined} onDayClick={canEdit ? (d) => setDlg({ open: true, date: d }) : undefined} onMove={canEdit ? move : undefined} /></div>
          {etapes.length === 0 && <p className="hidden text-center text-sm text-muted-foreground md:block">Aucune étape sur cette période.{canEdit && " Cliquez sur un jour pour en ajouter une."}</p>}
        </>}
      </> : <PlanningEquipes debut={debut} vue={vue} filtres={filtres} alertes={alertes} focus={focus} />}

      {vue !== "etapes" && ecritTerrain && <ImportHistoriqueConsolide />}
      <EtapeDialog open={dlg.open} onOpenChange={(o) => setDlg((p) => ({ ...p, open: o }))} etape={dlg.etape} defaultDate={dlg.date ?? debut} />
      {calendrierOpen && <CalendrierChantierDialog open={calendrierOpen} onOpenChange={setCalendrierOpen} etapes={etapes} />}
    </div>
  );
}
