import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, Copy, EyeOff, Loader2, Mail, PhoneCall, Sparkles } from "lucide-react";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCapability } from "@/hooks/use-capability";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { redigerRelance } from "@/lib/server-fns/relances.functions";
import {
  CANAUX_RELANCE, MAILTO_LIMITE_CORPS, MOTIFS, dimancheDeLaSemaine, libelleMotif, lienOutlook, prochaineActionParDefaut,
  type CanalRelance, type LigneRelance, type ReponseRelances,
} from "@/lib/relances/regles";

export const Route = createFileRoute("/_app/relances")({
  beforeLoad: () => requireCapability("commercial.relances"),
  head: () => ({
    meta: [
      { title: "À relancer — Setup Paris" },
      { name: "description", content: "Opportunités à relancer cette semaine, avec brouillon de relance et suivi dans l'opportunité." },
      { property: "og:title", content: "À relancer — Setup Paris" },
      { property: "og:description", content: "Relances commerciales de la semaine : motifs, montants HT retenus et brouillons." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelancesPage,
});

const STATUTS: Record<string, string> = { a_faire: "À faire", envoye: "Envoyé", a_l_etude: "À l'étude", presque_gagne: "Presque gagné" };
const eur = (n: number | null) => n == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const dateFr = (iso: string | null | undefined) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—";
const aujourdhui = () => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
type Filtre = { mode: "mes" } | { mode: "charge"; id: string } | { mode: "tous" };

function RelancesPage() {
  const { user } = useAuth();
  const estAdmin = useCapability("section.admin");
  const voitTout = useCapability("opportunites.read.all");
  const [filtre, setFiltre] = useState<Filtre>({ mode: "mes" });
  const [ouverte, setOuverte] = useState<LigneRelance | null>(null);
  const chargeId = filtre.mode === "charge" ? filtre.id : null; const tous = filtre.mode === "tous";
  const cle = ["relances", filtre.mode, chargeId, tous] as const;
  const q = useQuery({
    queryKey: cle,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("relances_a_faire", { ...(chargeId ? { p_charge_id: chargeId } : {}), p_tous: tous });
      if (error) throw error; return data as unknown as ReponseRelances;
    },
  });
  const charges = useQuery({
    queryKey: ["relances-charges"], enabled: voitTout,
    queryFn: async () => {
      const { data: a } = await supabase.from("affaires").select("charge_affaires_id").eq("phase", "opportunite").not("charge_affaires_id", "is", null).is("archived_at", null);
      const ids = [...new Set((a ?? []).map(x => x.charge_affaires_id as string))];
      if (!ids.length) return [];
      const { data: p } = await supabase.from("profiles").select("id,full_name").in("id", ids);
      return (p ?? []).filter(x => x.id !== user?.id).sort((x, y) => (x.full_name ?? "").localeCompare(y.full_name ?? ""));
    },
  });
  const valeur = filtre.mode === "charge" ? `c:${filtre.id}` : filtre.mode;
  const lignes = q.data?.lignes ?? [];
  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6">
      <PageHeader number="02" eyebrow="Commercial" title="À relancer"
        description="Opportunités du pipeline actif à relancer, de la plus urgente à la moins urgente. L'application prépare des brouillons ; elle n'envoie jamais d'e-mail."
        actions={<Link to="/opportunites" className="text-xs font-semibold text-muted-foreground hover:text-primary hover:underline">← Pipeline</Link>} />
      <div className="flex flex-wrap items-center gap-3">
        <Select value={valeur} onValueChange={(v) => setFiltre(v === "mes" ? { mode: "mes" } : v === "tous" ? { mode: "tous" } : { mode: "charge", id: v.slice(2) })}>
          <SelectTrigger className="h-9 w-[260px]" aria-label="Périmètre"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mes">Mes affaires</SelectItem>
            {voitTout && (charges.data ?? []).map(c => <SelectItem key={c.id} value={`c:${c.id}`}>{c.full_name ?? "Sans nom"}</SelectItem>)}
            {estAdmin && <SelectItem value="tous">Tous les chargés d'affaires</SelectItem>}
          </SelectContent>
        </Select>
        {q.data && <p className="text-sm text-muted-foreground">{q.data.nb} à relancer sur {q.data.nb_actives} opportunités actives · délais {q.data.parametres.delai_envoi} / {q.data.parametres.delai_validite} / {q.data.parametres.delai_inactivite} j</p>}
      </div>
      {q.isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : q.error ? <p className="text-sm text-destructive">Lecture impossible : {(q.error as Error).message}</p>
        : lignes.length === 0 ? <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">Rien à relancer pour ce périmètre.</p>
        : <>
          <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-2 py-2">Affaire</th><th className="px-2 py-2">Client / contact</th><th className="px-2 py-2 text-right">Montant HT</th><th className="px-2 py-2">Statut</th><th className="px-2 py-2">Motifs</th><th className="px-2 py-2">Dernière action</th><th className="px-2 py-2 text-right">Jours</th><th className="px-2 py-2" /></tr>
              </thead>
              <tbody>{lignes.map(l => (
                <tr key={l.affaire_id} className="border-t align-top hover:bg-muted/30">
                  <td className="px-2 py-2"><Link to="/affaires/$affaireId" params={{ affaireId: l.affaire_id }} className="font-semibold hover:underline">{l.numero}</Link><div className="max-w-[180px] truncate text-xs text-muted-foreground">{l.titre}</div>{tous || filtre.mode === "charge" ? <div className="text-xs text-muted-foreground">{l.charge_affaires_nom ?? "Sans chargé"}</div> : null}</td>
                  <td className="px-2 py-2"><div className="max-w-[140px] truncate">{l.client ?? "—"}</div><div className="max-w-[140px] truncate text-xs text-muted-foreground">{l.contact?.nom || "Aucun contact"}</div></td>
                  <td className="px-2 py-2 text-right tabular-nums">{eur(l.montant_ht)}{l.source_montant === "estime" && <div className="text-xs text-muted-foreground">estimé</div>}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{STATUTS[l.statut] ?? l.statut}{l.devis_numero && <div className="text-xs text-muted-foreground">{l.devis_numero}</div>}</td>
                  <td className="px-2 py-2"><Motifs l={l} /></td>
                  <td className="px-2 py-2 text-xs">{l.derniere_action ? <><span className="font-medium">{dateFr(l.derniere_action.date)}</span><div className="max-w-[150px] truncate text-muted-foreground">{l.derniere_action.texte}</div></> : "Aucune"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.jours_attente != null ? `${l.jours_attente} j` : "—"}</td>
                  <td className="px-2 py-2"><Button size="sm" aria-label={`Préparer la relance ${l.numero}`} onClick={() => setOuverte(l)}>Préparer</Button></td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">{lignes.map(l => (
            <div key={l.affaire_id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold">{l.numero} · {STATUTS[l.statut]}</p><p className="truncate text-sm text-muted-foreground">{l.titre}</p></div><p className="shrink-0 font-semibold tabular-nums">{eur(l.montant_ht)}</p></div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{l.client ?? "—"} · {l.contact?.nom || "Aucun contact"}</p>
              <div className="mt-2"><Motifs l={l} /></div>
              <p className="mt-2 text-xs text-muted-foreground">Dernière action : {l.derniere_action ? `${dateFr(l.derniere_action.date)} — ${l.derniere_action.texte}` : "aucune"}{l.jours_attente != null ? ` · ${l.jours_attente} j` : ""}</p>
              <Button size="sm" className="mt-3 w-full" onClick={() => setOuverte(l)}>Préparer la relance</Button>
            </div>))}</div>
        </>}
      <PanneauRelance ligne={ouverte} chargeId={chargeId} tous={tous} onClose={() => setOuverte(null)} />
    </div>
  );
}

function Motifs({ l }: { l: LigneRelance }) {
  return <div className="flex flex-wrap gap-1">{l.motifs.map(m => (
    <Badge key={m.code} variant={m.priorite <= 2 ? "destructive" : "secondary"} className="whitespace-nowrap font-normal" title={libelleMotif(m)}>
      {MOTIFS[m.code].court}{m.jours != null ? ` · ${m.code === "validite_proche" ? `J-${m.jours}` : `${m.jours} j`}` : ""}
    </Badge>))}</div>;
}

function PanneauRelance({ ligne, chargeId, tous, onClose }: { ligne: LigneRelance | null; chargeId: string | null; tous: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const rediger = useServerFn(redigerRelance);
  const [montant, setMontant] = useState(false);
  const [objet, setObjet] = useState(""); const [corps, setCorps] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [vue, setVue] = useState<"brouillon" | "faite" | "reporter" | "ignorer">("brouillon");
  const [canal, setCanal] = useState<CanalRelance>("relance_email");
  const [note, setNote] = useState(""); const [prochaine, setProchaine] = useState(prochaineActionParDefaut(aujourdhui()));
  const [dateReport, setDateReport] = useState(prochaineActionParDefaut(aujourdhui())); const [motif, setMotif] = useState("");
  const outlook = useMemo(() => lienOutlook({ a: ligne?.contact?.email ?? null, objet, corps }), [ligne, objet, corps]);
  const fermer = () => { setObjet(""); setCorps(""); setVue("brouillon"); setNote(""); setMotif(""); setMontant(false); onClose(); };
  const recharger = () => qc.invalidateQueries({ queryKey: ["relances"] });

  async function generer() {
    if (!ligne) return; setEnCours(true);
    try {
      const r = await rediger({ data: { affaireId: ligne.affaire_id, chargeId, tous, mentionnerMontant: montant } });
      if (r.error || !r.brouillon) toast.error(r.error ?? "Brouillon indisponible"); else { setObjet(r.brouillon.objet); setCorps(r.brouillon.corps); }
    } catch (e) { toast.error((e as Error).message); } finally { setEnCours(false); }
  }
  async function relanceFaite() {
    if (!ligne || !note.trim()) return toast.error("Ajoutez une note"); setEnCours(true);
    const { error } = await supabase.rpc("app_ajouter_action_opportunite", { _affaire_id: ligne.affaire_id, _type: canal, _note: note.trim(), _echeance: prochaine || undefined });
    setEnCours(false); if (error) return toast.error(error.message);
    toast.success("Relance enregistrée dans l'opportunité"); recharger(); fermer();
  }
  async function reporter(type: "reporter" | "ignorer") {
    if (!ligne) return; if (type === "ignorer" && !motif.trim()) return toast.error("Indiquez un motif");
    const { data: u } = await supabase.auth.getUser(); setEnCours(true);
    const { error } = await supabase.from("relances_reports").insert({ affaire_id: ligne.affaire_id, type, jusqu_au: type === "ignorer" ? dimancheDeLaSemaine(aujourdhui()) : dateReport, motif: motif.trim() || null, auteur_id: u.user?.id as string });
    setEnCours(false); if (error) return toast.error(error.message);
    toast.success(type === "ignorer" ? "Ignorée jusqu'à dimanche" : `Reportée au ${dateFr(dateReport)}`); recharger(); fermer();
  }
  async function copier() { await navigator.clipboard.writeText(objet ? `Objet : ${objet}\n\n${corps}` : corps); toast.success("Brouillon copié"); }

  return (
    <Sheet open={!!ligne} onOpenChange={(o) => { if (!o) fermer(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {ligne && <>
          <SheetHeader>
            <SheetTitle>Relance {ligne.numero}</SheetTitle>
            <SheetDescription>{ligne.titre} · {ligne.client ?? "client inconnu"}{ligne.contact?.nom ? ` · ${ligne.contact.nom}` : ""}</SheetDescription>
          </SheetHeader>
          <div className="mt-3"><Motifs l={ligne} /></div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["brouillon", "faite", "reporter", "ignorer"] as const).map(v => (
              <Button key={v} size="sm" variant={vue === v ? "default" : "outline"} onClick={() => setVue(v)}>
                {v === "brouillon" ? <><Sparkles className="mr-1 h-3.5 w-3.5" />Brouillon</> : v === "faite" ? <><PhoneCall className="mr-1 h-3.5 w-3.5" />Relance faite</> : v === "reporter" ? <><CalendarClock className="mr-1 h-3.5 w-3.5" />Reporter</> : <><EyeOff className="mr-1 h-3.5 w-3.5" />Ignorer cette semaine</>}
              </Button>))}
          </div>
          {vue === "brouillon" && <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={montant} onCheckedChange={(c) => setMontant(c === true)} />Mentionner le montant HT ({eur(ligne.montant_ht)})</label>
            <Button onClick={generer} disabled={enCours}>{enCours ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{corps ? "Rédiger à nouveau" : "Rédiger le brouillon"}</Button>
            {corps && <>
              <div><Label htmlFor="rl-objet">Objet</Label><Input id="rl-objet" value={objet} onChange={(e) => setObjet(e.target.value)} /></div>
              <div><Label htmlFor="rl-corps">Message</Label><Textarea id="rl-corps" rows={12} value={corps} onChange={(e) => setCorps(e.target.value)} /></div>
              {outlook.tronqueRisque && <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Message de plus de {MAILTO_LIMITE_CORPS} caractères : « Ouvrir dans Outlook » peut le couper. Utilisez « Copier ».</p>}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={copier}><Copy className="mr-2 h-4 w-4" />Copier</Button>
                <Button variant="outline" asChild><a href={outlook.href}><Mail className="mr-2 h-4 w-4" />Ouvrir dans Outlook</a></Button>
              </div>
              <p className="text-xs text-muted-foreground">Rien n'est envoyé par l'application. Après l'envoi depuis Outlook, cliquez sur « Relance faite ».</p>
            </>}
          </div>}
          {vue === "faite" && <div className="mt-4 space-y-3">
            <div><Label>Canal</Label><Select value={canal} onValueChange={(v) => setCanal(v as CanalRelance)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CANAUX_RELANCE.map(c => <SelectItem key={c.valeur} value={c.valeur}>{c.libelle}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="rl-note">Note</Label><Textarea id="rl-note" rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : relance envoyée, attend retour du client mardi" /></div>
            <div><Label htmlFor="rl-proch">Prochaine action le</Label><Input id="rl-proch" type="date" value={prochaine} onChange={(e) => setProchaine(e.target.value)} /></div>
            <Button onClick={relanceFaite} disabled={enCours}>Enregistrer la relance</Button>
          </div>}
          {vue === "reporter" && <div className="mt-4 space-y-3">
            <div><Label htmlFor="rl-rep">Reporter jusqu'au</Label><Input id="rl-rep" type="date" min={aujourdhui()} value={dateReport} onChange={(e) => setDateReport(e.target.value)} /></div>
            <div><Label htmlFor="rl-rep-m">Motif (facultatif)</Label><Input id="rl-rep-m" value={motif} maxLength={500} onChange={(e) => setMotif(e.target.value)} /></div>
            <Button onClick={() => reporter("reporter")} disabled={enCours}>Reporter</Button>
            <p className="text-xs text-muted-foreground">Aucune action n'est ajoutée à l'opportunité.</p>
          </div>}
          {vue === "ignorer" && <div className="mt-4 space-y-3">
            <div><Label htmlFor="rl-ign">Motif</Label><Input id="rl-ign" value={motif} maxLength={500} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : client en congés" /></div>
            <Button onClick={() => reporter("ignorer")} disabled={enCours}>Ignorer jusqu'à dimanche</Button>
            <p className="text-xs text-muted-foreground">Aucune action n'est ajoutée à l'opportunité.</p>
          </div>}
        </>}
      </SheetContent>
    </Sheet>
  );
}
