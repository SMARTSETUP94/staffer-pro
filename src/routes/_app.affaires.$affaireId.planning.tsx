import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCapability } from "@/hooks/use-capability";
import { EtapeDialog } from "@/components/logistique/EtapeDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EtapeLogistique } from "@/hooks/use-etapes-logistiques";

import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { PlanningBarres, type Barre, type LigneBarres } from "@/components/planning-simple/PlanningBarres";
import { useEtapesAffaire } from "@/hooks/use-etapes-logistiques";
import { useAffaireRoles, useAffecterRole, useEmployesActifs, useRoleReferents } from "@/hooks/use-equipe-projet";
import { ETAPE_LABELS } from "@/lib/logistique/etapes";
import { addDays, dayOfWeek, diffDays } from "@/lib/staffing/date-utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Edition = { kind: "atelier" | "be"; titre: string; metier: number | null; roleId?: string; employe: string; debut: string; fin: string; heures: string; nouveau: boolean };

export const Route = createFileRoute("/_app/affaires/$affaireId/planning")({
  beforeLoad: () => requireCapability("section.affaires"),
  head: () => ({ meta: [{ title: "Planning — Affaire — Setup Paris" }] }),
  component: AffairePlanningPage,
});


/**
 * Rétroplanning de l'affaire : bureau d'étude, atelier et logistique sur une
 * seule frise, en lecture seule. Les modifications restent dans les plannings
 * dédiés (/planning-be, /planning-atelier, onglet Logistique).
 */
function AffairePlanningPage() {
  const { affaireId } = Route.useParams();
  const [edit, setEdit] = useState<Edition | null>(null);
  const [etapeEdit, setEtapeEdit] = useState<{ etape: EtapeLogistique | null; cle: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const affecter = useAffecterRole();
  const canBe = useCapability("affaires.edit");
  const canLog = useCapability("section.affaires");
  const { data: referents = [] } = useRoleReferents();
  const [mobile, setMobile] = useState(false);
  useEffect(() => { const m = window.matchMedia("(max-width: 767px)"); const u = () => setMobile(m.matches); u(); m.addEventListener("change", u); return () => m.removeEventListener("change", u); }, []);
  const droitAtelier = useQuery({
    queryKey: ["planning-atelier-ecriture"],
    staleTime: 5 * 60_000,
    queryFn: async () => { const r = await supabase.rpc("planning_atelier_ecriture_autorisee"); return r.data === true; },
  });
  const editAtelier = !mobile && droitAtelier.data === true;
  const editBe = !mobile && canBe;
  const editLog = !mobile && canLog;
  const [vue, setVue] = useState<"jour" | "semaine" | "mois">("semaine");
  const [mode, setMode] = useState<"periodes" | "personnes">("periodes");
  const persQ = useQuery({
    queryKey: ["affaire-planning-personnes", affaireId],
    enabled: mode === "personnes",
    queryFn: async () => {
      const { data, error } = await supabase.from("assignations")
        .select("employe_id,date,metier_id,atelier_planning_id,etape_logistique_id,employes(prenom,nom)")
        .eq("affaire_id", affaireId).eq("historique_terrain", false).not("employe_id", "is", null);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as { employe_id: string; date: string; metier_id: number | null; atelier_planning_id: string | null; etape_logistique_id: string | null; employes: { prenom: string | null; nom: string | null } | null }[];
    },
  });

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
        barres: [{ id: `be:${r.id}`, affaireId: "be", libelle: "Conception", debut, fin, previsionnel: true, metier: 8 }],
      });
    }
    if (d.affaire.atelier_date_debut && d.affaire.atelier_date_fin) {
      const debut = d.affaire.atelier_date_debut, fin = d.affaire.atelier_date_fin;
      out.push({
        id: "atelier", libelle: "Atelier · période globale", detail: periode(debut, fin),
        barres: [{ id: `atelier:${affaireId}`, affaireId: "atelier", libelle: "Atelier", debut, fin, previsionnel }],
      });
    }
    const ordreMetier = (id: number) => d.metiers.find((x) => x.id === id)?.ordre ?? 99;
    const periodesTriees = [...d.periodes].sort((a, b) => ordreMetier(Number(a.metier_id)) - ordreMetier(Number(b.metier_id)) || a.date_debut.localeCompare(b.date_debut));
    for (const p of periodesTriees) {
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

  const lignesPersonnes = useMemo<LigneBarres[]>(() => {
    const periodes = atelierQ.data?.periodes ?? [];
    const libMetier = (id: number | null) => atelierQ.data?.metiers.find((m) => m.id === id)?.libelle ?? "Atelier";
    const par = new Map<string, { nom: string; jours: Map<string, { cat: string; metier: number | null; lib: string }> }>();
    const ajout = (id: string, nom: string, date: string, cat: string, metier: number | null, lib: string) => {
      const p = par.get(id) ?? { nom, jours: new Map() };
      if (!p.jours.has(`${date}|${cat}`)) p.jours.set(`${date}|${cat}`, { cat, metier, lib });
      par.set(id, p);
    };
    for (const a of persQ.data ?? []) {
      const nom = `${a.employes?.prenom ?? ""} ${a.employes?.nom ? a.employes.nom[0] + "." : ""}`.trim() || "—";
      if (a.etape_logistique_id) ajout(a.employe_id, nom, a.date, "log", 7, "Logistique");
      else {
        const m = a.metier_id ?? (periodes.find((p) => p.id === a.atelier_planning_id)?.metier_id ?? null);
        ajout(a.employe_id, nom, a.date, `at${m ?? ""}`, m != null ? Number(m) : null, libMetier(m != null ? Number(m) : null));
      }
    }
    for (const r of roles.filter((r) => r.role === "concepteur" && r.date_debut && r.date_fin)) {
      const e = employes.find((x) => x.id === r.employe_id);
      const nom = e ? `${e.prenom ?? ""} ${e.nom ? e.nom[0] + "." : ""}`.trim() : "Concepteur";
      for (let d = r.date_debut as string; d <= (r.date_fin as string); d = addDays(d, 1)) ajout(r.employe_id, nom, d, "be", 8, "Bureau d'étude");
    }
    const out: LigneBarres[] = [];
    for (const [id, p] of par) {
      const tri = [...p.jours.entries()].map(([k, v]) => ({ date: k.split("|")[0], ...v })).sort((a, b) => a.cat.localeCompare(b.cat) || a.date.localeCompare(b.date));
      const barres: Barre[] = [];
      for (const j of tri) {
        const der = barres.at(-1);
        if (der && der.id.startsWith(`${id}:${j.cat}:`) && addDays(der.fin, 1) === j.date) { der.fin = j.date; continue; }
        barres.push({ id: `${id}:${j.cat}:${j.date}`, affaireId: "pers", libelle: j.lib, debut: j.date, fin: j.date, previsionnel: j.cat === "be", metier: j.metier });
      }
      const nbJ = new Set(tri.map((t) => t.date)).size;
      const acts = [...new Set(tri.map((t) => t.lib))].join(", ");
      out.push({ id: `p:${id}`, libelle: p.nom, detail: `${nbJ} j · ${acts}`, barres });
    }
    return out.sort((a, b) => String(a.libelle).localeCompare(String(b.libelle)));
  }, [persQ.data, atelierQ.data, roles, employes]);

  const refetchAll = async () => {
    await Promise.all([
      atelierQ.refetch(),
      qc.invalidateQueries({ queryKey: ["planning-simple"] }),
      qc.invalidateQueries({ queryKey: ["affaire-roles", affaireId] }),
    ]);
  };
  const ouvrir = (b: Barre, debut = b.debut, fin = b.fin) => {
    const d = atelierQ.data;
    if (b.id.startsWith("log:")) {
      const e = etapes.find((x) => `log:${x.id}` === b.id);
      if (!e) return;
      if (!editLog) { toast.info("Lecture seule : modifiable depuis l'onglet Logistique."); return; }
      setEtapeEdit({ etape: { ...e, date_debut: debut, date_fin: fin }, cle: Date.now() });
      return;
    }
    if (b.id.startsWith("be:")) {
      const r = roles.find((x) => `be:${x.id}` === b.id);
      if (!r) return;
      setEdit({ kind: "be", titre: "Bureau d'étude", metier: null, roleId: r.id, employe: r.employe_id, debut, fin, heures: "", nouveau: false });
      return;
    }
    if (b.id.startsWith("metier:")) {
      const p = d?.periodes.find((x) => `metier:${x.id}` === b.id);
      if (!p) return;
      const m = d?.metiers.find((x) => x.id === p.metier_id);
      setEdit({ kind: "atelier", titre: m?.libelle ?? "Métier", metier: p.metier_id, employe: "", debut, fin, heures: p.heures_prevues != null ? String(p.heures_prevues) : "", nouveau: false });
      return;
    }
    setEdit({ kind: "atelier", titre: "Période atelier globale", metier: null, employe: "", debut, fin, heures: "", nouveau: false });
  };
  const peutModifier = (e: Edition) => (e.kind === "be" ? editBe : editAtelier);
  const enregistrer = async (e: Edition) => {
    if (!e.debut || !e.fin || e.fin < e.debut) { toast.error("Dates invalides"); return; }
    if (e.heures && (!Number.isFinite(Number(e.heures)) || Number(e.heures) < 0)) { toast.error("Heures invalides"); return; }
    setSaving(true);
    try {
      if (e.kind === "atelier") {
        const r = await supabase.rpc("planning_atelier_enregistrer", {
          _affaire: affaireId, _metier: e.metier as number, _debut: e.debut, _fin: e.fin,
          _heures: e.heures ? Number(e.heures) : undefined,
        });
        if (r.error) throw r.error;
      } else {
        if (!e.employe) throw new Error("Choisir un concepteur");
        await affecter({ affaireId, role: "concepteur", employeId: e.employe, dateDebut: e.debut, dateFin: e.fin, remplacerDates: true });
      }
      await refetchAll();
      setEdit(null);
      toast.success("Période enregistrée");
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Enregistrement impossible");
    } finally { setSaving(false); }
  };
  const retirer = async (e: Edition) => {
    if (!window.confirm(e.metier == null ? "Retirer ce chantier du planning atelier (toutes ses périodes métier) ?" : "Retirer cette période métier du planning atelier ?")) return;
    setSaving(true);
    try {
      const r = await supabase.rpc("planning_atelier_retirer", { _affaire: affaireId, _metier: e.metier ?? undefined });
      if (r.error) throw r.error;
      await refetchAll();
      setEdit(null);
      toast.success("Retiré du planning");
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? "Suppression impossible");
    } finally { setSaving(false); }
  };
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const concepteurs = referents.filter((r) => r.role === "concepteur");
  const nomEmp = (id: string) => { const e = employes.find((x) => x.id === id); return e ? `${e.prenom ?? ""} ${e.nom ?? ""}`.trim() : "—"; };
  const metiersAtelier = (atelierQ.data?.metiers ?? []).filter((m) => [1, 2, 3, 4, 5, 6, 9].includes(m.id));

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
  const lignesVisibles = (mode === "personnes" ? lignesPersonnes : lignes).filter((l) => l.barres.some((x) => x.debut <= finFenetre && x.fin >= fenetre.debut));
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
            Une ligne par période, dans l'ordre : bureau d'étude, atelier (par métier), logistique. Pointillés = prévisionnel. Les modifications sont partagées avec les plannings atelier, bureau d'étude et logistique.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Affichage">
            {(["periodes", "personnes"] as const).map((v) => (
              <Button key={v} size="sm" variant={mode === v ? "default" : "ghost"} className="h-6 px-2 text-xs" onClick={() => setMode(v)}>
                {v === "periodes" ? "Périodes" : "Personnes"}
              </Button>
            ))}
          </div>
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

      {mode === "personnes" && (
        <p className="text-[11px] text-muted-foreground">
          Une ligne par personne staffée sur ce chantier, couleur du métier (atelier), logistique ou bureau d'étude (pointillés). Pour ajouter ou retirer quelqu'un, passez par le planning atelier ou logistique.
        </p>
      )}
      {mode === "periodes" && (editAtelier || editBe || editLog) && (
        <div className="flex flex-wrap gap-1.5">
          {editAtelier && (
            <Button size="sm" className="h-7 text-xs" onClick={() => setEdit({ kind: "atelier", titre: "Nouvelle période atelier", metier: null, employe: "", debut: atelierQ.data?.affaire.atelier_date_debut ?? aujourdHui, fin: atelierQ.data?.affaire.atelier_date_fin ?? addDays(aujourdHui, 4), heures: "", nouveau: true })}>
              <Plus className="mr-1 h-3.5 w-3.5" />Période atelier
            </Button>
          )}
          {editBe && (
            <Button size="sm" className="h-7 text-xs" onClick={() => setEdit({ kind: "be", titre: "Nouvelle période bureau d'étude", metier: null, employe: "", debut: aujourdHui, fin: addDays(aujourdHui, 4), heures: "", nouveau: true })}>
              <Plus className="mr-1 h-3.5 w-3.5" />Bureau d'étude
            </Button>
          )}
          {editLog && (
            <Button size="sm" className="h-7 text-xs" onClick={() => setEtapeEdit({ etape: null, cle: Date.now() })}>
              <Plus className="mr-1 h-3.5 w-3.5" />Étape logistique
            </Button>
          )}
          <span className="self-center text-[11px] text-muted-foreground">Glissez une barre pour la déplacer, ses bords pour l'allonger ; cliquez pour modifier.</span>
        </div>
      )}

      {!lignesVisibles.length ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {mode === "personnes" ? (persQ.isLoading ? "Chargement…" : "Personne n'est staffé sur cette période.") : "Rien de planifié sur cette période pour ce chantier."}
        </p>
      ) : (
        <PlanningBarres
          lignes={lignesVisibles}
          debut={fenetre.debut}
          semaines={Math.ceil(fenetre.jours / 7)}
          nbJours={fenetre.jours}
          parJour
          col={fenetre.col}
          entete={mode === "personnes" ? "Personne" : "Période"}
          editable={mode === "periodes" && !mobile && vue !== "jour" && (editAtelier || editBe || editLog)}
          onOpen={(b) => { if (mode === "periodes") ouvrir(b); }}
          onMove={(b, debut, fin) => ouvrir(b, debut, fin)}
        />
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          {edit && (() => {
            const ro = !peutModifier(edit);
            const set = (patch: Partial<Edition>) => setEdit({ ...edit, ...patch });
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{edit.titre}</DialogTitle>
                  <DialogDescription>
                    {ro ? "Lecture seule : vous n'avez pas le droit de modifier cette période." : "Enregistré dans le planning " + (edit.kind === "be" ? "bureau d'étude" : "atelier") + " : les deux vues restent identiques."}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                  {edit.kind === "atelier" && edit.nouveau && (
                    <div className="grid gap-1">
                      <Label>Période</Label>
                      <Select value={edit.metier == null ? "global" : String(edit.metier)} onValueChange={(v) => set({ metier: v === "global" ? null : Number(v) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="global">Période atelier globale</SelectItem>
                          {metiersAtelier.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.libelle}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {edit.kind === "be" && (
                    <div className="grid gap-1">
                      <Label>Concepteur</Label>
                      <Select value={edit.employe} disabled={ro || !edit.nouveau} onValueChange={(v) => set({ employe: v })}>
                        <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                        <SelectContent>
                          {concepteurs.map((c) => <SelectItem key={c.employe_id} value={c.employe_id}>{nomEmp(c.employe_id)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1"><Label>Début</Label><Input type="date" disabled={ro} value={edit.debut} onChange={(e) => set({ debut: e.target.value })} /></div>
                    <div className="grid gap-1"><Label>Fin</Label><Input type="date" disabled={ro} value={edit.fin} onChange={(e) => set({ fin: e.target.value })} /></div>
                  </div>
                  {edit.kind === "atelier" && edit.metier != null && (
                    <div className="grid gap-1">
                      <Label>Heures prévues (vide = heures du devis)</Label>
                      <Input inputMode="decimal" disabled={ro} value={edit.heures} onChange={(e) => set({ heures: e.target.value })} />
                      {edit.heures && Number(edit.heures) > 0 && <p className="text-[11px] text-muted-foreground">{Math.round((Number(edit.heures) / 8) * 10) / 10} jours/homme</p>}
                    </div>
                  )}
                </div>
                <DialogFooter className="gap-2 sm:justify-between">
                  {edit.kind === "atelier" && !edit.nouveau && !ro ? (
                    <Button variant="outline" disabled={saving} onClick={() => retirer(edit)}>Retirer du planning</Button>
                  ) : <span />}
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setEdit(null)}>Fermer</Button>
                    {!ro && <Button disabled={saving} onClick={() => enregistrer(edit)}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Enregistrer</Button>}
                  </div>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {etapeEdit && (
        <EtapeDialog
          key={etapeEdit.cle}
          open
          onOpenChange={(o) => { if (!o) setEtapeEdit(null); }}
          etape={etapeEdit.etape}
          defaultAffaireId={affaireId}
          defaultDate={aujourdHui}
        />
      )}
    </div>
  );
}
