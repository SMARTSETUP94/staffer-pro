import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarPlus, Loader2, MailOpen, RefreshCw, Trash2, Truck, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { assistantEtapes } from "@/lib/server-fns/etapes-assistant.functions";
import { reanalyseSharedInboxes } from "@/lib/server-fns/shared-inbox-reanalyse.functions";
import { toast } from "sonner";
import { requireCapability } from "@/lib/capability-guard";
import { useCapability } from "@/hooks/use-capability";
import { supabase } from "@/integrations/supabase/client";
import { completerSuggestionsEmail } from "@/lib/logistique/suggestions-email";
import { suggestAffaires } from "@/lib/logistique/suggest-affaire";
import { EmailReaderDialog } from "@/components/emails/EmailReaderDialog";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_app/demandes-logistique")({
  beforeLoad: () => requireCapability("logistique.planning.view"),
  head: () => ({
    meta: [
      { title: "Demandes logistique — log@setup.paris" },
      { name: "description", content: "Emails log@ analysés par l'IA : échéances détectées et suggestions d'étapes logistiques." },
      { property: "og:title", content: "Demandes logistique — log@setup.paris" },
      { property: "og:description", content: "Emails log@ analysés par l'IA avec suggestions de planning." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DemandesLogistiquePage,
});

const TYPES = ["appro", "emballage", "chargement", "livraison", "tracage", "montage", "finitions", "permanence", "rotation", "demontage", "dechargement"] as const;
type EtapeType = (typeof TYPES)[number];
const TYPE_LABEL: Record<EtapeType, string> = {
  appro: "Appro", emballage: "Emballage", chargement: "Chargement", livraison: "Livraison", tracage: "Traçage", rotation: "Rotation", montage: "Montage",
  finitions: "Finitions", permanence: "Permanence", demontage: "Démontage", dechargement: "Déchargement",
};

type Echeance = { date: string; libelle: string; type?: string | null; affaire_numero?: string | null };
type Meta = { resume?: string | null; opp_client?: string | null; opp_projet?: string | null; opp_lieu?: string | null; echeances?: Echeance[] | null };
type Row = {
  id: string; from_email: string; from_name: string | null; subject: string | null; received_at: string;
  body_preview: string | null; body_full: string | null; body_content_type: string | null;
  statut: "pending_review" | "validated" | "dismissed"; metadata_ia: Meta | null;
};
type Aff = { id: string; numero: string; nom: string; phase: string; client?: string | null };

function DemandesLogistiquePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"todo" | "done" | "dismissed">("todo");
  const [reading, setReading] = useState<Row | null>(null);
  const [planning, setPlanning] = useState<Row | null>(null);
  const [affaires, setAffaires] = useState<Aff[]>([]);
  const canEdit = useCapability("logistique.etape.edit");
  const isAdmin = useCapability("section.admin");
  const reanalyse = useServerFn(reanalyseSharedInboxes);
  const [reanalysing, setReanalysing] = useState(false);
  async function runReanalyse() {
    setReanalysing(true);
    try {
      const r = await reanalyse({ data: { limit: 60, source: "logistique" } });
      toast.success(`Analyse relancée : ${r.updated}/${r.total} emails mis à jour`, {
        description: r.errors.length ? r.errors.join(" · ") : undefined,
      });
      await load();
    } catch (e) {
      toast.error("Relance impossible", { description: (e as Error).message });
    } finally {
      setReanalysing(false);
    }
  }

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("emails_entrants")
      .select("id, from_email, from_name, subject, received_at, body_preview, body_full, body_content_type, statut, metadata_ia")
      .eq("source_boite", "logistique")
      .order("received_at", { ascending: false })
      .limit(300);
    if (error) toast.error("Chargement impossible", { description: error.message });
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  }
  useEffect(() => {
    void load();
    void supabase.from("affaires").select("id, numero, nom, phase, client").is("archived_at", null)
      .order("numero", { ascending: false }).limit(2000).then(({ data }) => setAffaires((data ?? []) as Aff[]));
  }, []);

  const lists = useMemo(() => ({
    todo: rows.filter((r) => r.statut === "pending_review"),
    done: rows.filter((r) => r.statut === "validated"),
    dismissed: rows.filter((r) => r.statut === "dismissed"),
  }), [rows]);

  async function setStatut(r: Row, statut: Row["statut"]) {
    const { error } = await supabase.from("emails_entrants").update({ statut }).eq("id", r.id);
    if (error) return toast.error("Erreur", { description: error.message });
    void load();
  }

  const [releve, setReleve] = useState(false);
  async function relever() {
    setReleve(true);
    try {
      const r = await fetch("/api/public/hooks/poll-shared-inboxes", {
        method: "POST", headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? `Erreur ${r.status}`);
      const n = j.report?.["log@setup.paris"]?.inserted ?? 0;
      toast.success(n ? `${n} nouvel(s) email(s) importé(s)` : "Aucun nouvel email sur log@setup.paris");
      await load();
    } catch (e) { toast.error(`Relève impossible : ${(e as Error).message}`); } finally { setReleve(false); }
  }

  const list = lists[tab];
  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader title="Demandes logistique" description="Emails reçus sur log@setup.paris — l'IA repère les échéances et propose des étapes pour le planning."
        actions={<div className="flex gap-2">
          <Button size="sm" onClick={relever} disabled={releve}>
            {releve ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MailOpen className="h-4 w-4 mr-1" />}
            Relever les emails
          </Button>
          {isAdmin && (
          <Button size="sm" variant="outline" onClick={runReanalyse} disabled={reanalysing}>
            {reanalysing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Relancer l'analyse IA
          </Button>)}
        </div>} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="todo">À traiter <span className="ml-1.5 text-xs opacity-60">{lists.todo.length}</span></TabsTrigger>
          <TabsTrigger value="done">Planifiées <span className="ml-1.5 text-xs opacity-60">{lists.done.length}</span></TabsTrigger>
          <TabsTrigger value="dismissed">Écartées <span className="ml-1.5 text-xs opacity-60">{lists.dismissed.length}</span></TabsTrigger>
        </TabsList>
      </Tabs>
      {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Aucun email ici.</p>
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const m = r.metadata_ia ?? {};
            const ech = m.echeances ?? [];
            return (
              <div key={r.id} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{m.opp_projet || r.subject || "(sans objet)"}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.from_name ? `${r.from_name} · ` : ""}{r.from_email} · {format(parseISO(r.received_at), "d MMM yyyy HH:mm", { locale: fr })}
                      {m.opp_client ? ` · ${m.opp_client}` : ""}{m.opp_lieu ? ` · ${m.opp_lieu}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setReading(r)}><MailOpen className="mr-1 h-4 w-4" />Lire l'email</Button>
                    {canEdit && r.statut === "pending_review" && (
                      <>
                        <Button size="sm" onClick={() => setPlanning(r)}><CalendarPlus className="mr-1 h-4 w-4" />Ajouter au planning</Button>
                        <Button size="sm" variant="ghost" onClick={() => setStatut(r, "dismissed")} aria-label="Écarter"><X className="h-4 w-4" /></Button>
                      </>
                    )}
                    {canEdit && r.statut !== "pending_review" && (
                      <Button size="sm" variant="ghost" onClick={() => setStatut(r, "pending_review")}>Remettre à traiter</Button>
                    )}
                  </div>
                </div>
                {m.resume && <p className="text-sm">{m.resume}</p>}
                {ech.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ech.map((e, i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        <Truck className="h-3 w-3" />
                        {format(parseISO(e.date), "d MMM", { locale: fr })} · {e.libelle}
                        {e.affaire_numero ? ` · ${e.affaire_numero}` : ""}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {reading && <EmailReaderDialog email={reading} onClose={() => setReading(null)} />}
      {planning && (
        <PlanningDialog row={planning} affaires={affaires} onClose={() => setPlanning(null)}
          onDone={() => { setPlanning(null); void load(); }} />
      )}
    </div>
  );
}

type Line = { auto?: boolean; keep: boolean; date: string; type: EtapeType; contenu: string; hDebut: string; hFin: string; lieu: string; vehiculeId: string; nb?: string; commentaire?: string };
type Veh = { id: string; nom: string; immatriculation: string | null };

function PlanningDialog({ row, affaires, onClose, onDone }: { row: Row; affaires: Aff[]; onClose: () => void; onDone: () => void }) {
  const ech = row.metadata_ia?.echeances ?? [];
  const numero = ech.find((e) => e.affaire_numero)?.affaire_numero;
  const suggestions = useMemo(() => {
    const m = row.metadata_ia;
    const txt = [numero, row.subject, m?.opp_projet, m?.opp_client, m?.opp_lieu, m?.resume, (row.body_full ?? row.body_preview ?? "").replace(/<[^>]+>/g, " ").slice(0, 4000)].filter(Boolean).join(" ");
    return suggestAffaires(txt, affaires);
  }, [row, affaires, numero]);
  const [affaireId, setAffaireId] = useState<string>(affaires.find((a) => a.numero === numero)?.id ?? suggestions[0]?.affaire.id ?? "");
  const [lines, setLines] = useState<Line[]>(() => {
    const base = (ech.length ? ech : [{ date: format(new Date(), "yyyy-MM-dd"), libelle: row.subject ?? "", type: "livraison" }]).map((e) => ({
      keep: true, date: e.date, contenu: e.libelle, lieu: row.metadata_ia?.opp_lieu ?? "",
      type: ((TYPES as readonly string[]).includes(e.type ?? "") ? e.type : "livraison") as EtapeType,
    }));
    return completerSuggestionsEmail(base).map((x) => ({ ...x, hDebut: "", hFin: "", vehiculeId: "" }));
  });
  const [saving, setSaving] = useState(false);
  const [commentaire, setCommentaire] = useState("");
  const assist = useServerFn(assistantEtapes);
  const [consigne, setConsigne] = useState("");
  const [assisting, setAssisting] = useState(false);
  const [reponse, setReponse] = useState<string | null>(null);
  async function runAssist() {
    if (!consigne.trim()) return;
    setAssisting(true);
    try {
      const r = await assist({ data: { instruction: consigne, etapes: lines.map((l, index) => ({ index, coche: l.keep, date: l.date, type: l.type, contenu: l.contenu, heure_debut: l.hDebut || null, heure_fin: l.hFin || null, lieu: l.lieu || null, nb_personnes: l.nb ? Number(l.nb) : null, commentaire: l.commentaire || null })) } });
      setLines((ls) => ls.map((l, i) => {
        let out = l;
        for (const c of r.operations) {
          const hit = c.toutes || c.indices.includes(i) || c.types.includes(l.type);
          if (!hit) continue;
          out = { ...out,
            ...(c.nb_personnes != null && { nb: String(c.nb_personnes) }), ...(c.lieu != null && { lieu: c.lieu }),
            ...(c.heure_debut != null && { hDebut: c.heure_debut }), ...(c.heure_fin != null && { hFin: c.heure_fin }),
            ...(c.contenu != null && { contenu: c.contenu }), ...(c.commentaire != null && { commentaire: c.commentaire }),
            ...(c.keep != null && { keep: c.keep }) };
        }
        return out;
      }));
      setReponse(r.message || (r.operations.length ? "Modifications appliquées." : "Je n'ai pas compris la consigne."));
      if (r.operations.length) toast.success(r.message || "Étapes mises à jour");
      setConsigne("");
    } catch (e) { toast.error((e as Error).message); } finally { setAssisting(false); }
  }
  const [initial] = useState(() => lines.map((l) => ({ type: l.type, date: l.date, contenu: l.contenu, lieu: l.lieu || null })));
  const [q, setQ] = useState("");
  const [withOpps, setWithOpps] = useState(false);
  const [vehicules, setVehicules] = useState<Veh[]>([]);
  useEffect(() => {
    void supabase.from("vehicules").select("id, nom, immatriculation").eq("actif", true).order("nom")
      .then(({ data }) => setVehicules((data ?? []) as Veh[]));
  }, []);
  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return affaires.filter((a) => (withOpps || a.phase === "signe" || a.id === affaireId) && words.every((w) => `${a.numero} ${a.nom}`.toLowerCase().includes(w))).slice(0, 50);
  }, [q, affaires, withOpps, affaireId]);
  const selected = affaires.find((a) => a.id === affaireId);
  const isHtml = (row.body_content_type ?? "").toLowerCase() === "html";
  const body = row.body_full ?? row.body_preview ?? "";
  const upd = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  async function save() {
    const kept = lines.filter((l) => l.keep && /^\d{4}-\d{2}-\d{2}$/.test(l.date));
    if (!affaireId || kept.length === 0) return toast.error("Choisissez un chantier et au moins une étape datée");
    setSaving(true);
    const { error } = await supabase.from("affaire_etapes_logistiques").insert(kept.map((l) => ({
      affaire_id: affaireId, type: l.type, date_debut: l.date,
      heure_debut: l.hDebut || null, heure_fin: l.hFin || null,
      lieu_libre: l.lieu.trim() || null, vehicule_id: l.vehiculeId || null,
      nb_personnes: l.nb ? Number(l.nb) : null,
      commentaire_equipe: l.commentaire?.trim() || null,
      statut: "valide" as const, origine: "jalonnement" as const,
      note: `${l.contenu?.trim() ? `${l.contenu.trim()} — ` : ""}Depuis un email log@ : « ${(row.subject ?? "").slice(0, 120)} »`,
    })));
    if (!error) {
      await supabase.from("emails_entrants").update({ statut: "validated" }).eq("id", row.id);
      await supabase.from("ia_feedback_logistique").insert({
        email_id: row.id, email_subject: row.subject, propose: initial,
        retenu: kept.map((l) => ({ type: l.type, date: l.date, contenu: l.contenu, heure_debut: l.hDebut || null, heure_fin: l.hFin || null, lieu: l.lieu || null })),
        commentaire: commentaire.trim() || null,
      });
    }
    setSaving(false);
    if (error) return toast.error("Ajout impossible", { description: error.message });
    toast.success(`${kept.length} étape(s) ajoutée(s) au planning logistique`);
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Ajouter au planning logistique</DialogTitle>
          <DialogDescription>Suggestions de l'IA — corrigez, décochez ce qui ne doit pas être ajouté.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2 min-h-0">
        <div className="rounded-md border bg-muted/30 flex flex-col min-h-0">
          <div className="border-b px-3 py-2 text-xs">
            <p className="font-medium text-sm">{row.subject || "(sans objet)"}</p>
            <p className="text-muted-foreground">{row.from_name ? `${row.from_name} · ` : ""}{row.from_email} · {format(parseISO(row.received_at), "d MMM yyyy HH:mm", { locale: fr })}</p>
          </div>
          {isHtml ? (
            <iframe title="Email" sandbox="" srcDoc={body} className="w-full flex-1 min-h-[55vh] bg-background" />
          ) : (
            <pre className="flex-1 max-h-[60vh] overflow-auto whitespace-pre-wrap p-3 text-xs font-sans">{body}</pre>
          )}
        </div>
        <div className="space-y-3 min-w-0">
        <div className="space-y-1">
          <Label htmlFor="ia-comment" className="text-xs">Commentaire pour l'IA (facultatif)</Label>
          <Textarea id="ia-comment" rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Ex. : l'entrée prestataires n'est pas une étape ; la pose commence à 23h." />
          <p className="text-[11px] text-muted-foreground">Vos corrections et ce commentaire servent d'exemples à l'IA pour les prochains emails.</p>
        </div>
        <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-2">
          <Label htmlFor="ia-assist" className="text-xs">Demander à l'IA de remplir les étapes</Label>
          <div className="flex gap-2">
            <Input id="ia-assist" value={consigne} onChange={(e) => setConsigne(e.target.value)} disabled={assisting}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runAssist(); } }}
              placeholder="Ex. : une personne et lieu « Studio Lendit » sur toutes les étapes ; permanences de 8h à 20h" />
            <Button type="button" size="sm" onClick={runAssist} disabled={assisting || !consigne.trim()}>
              {assisting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Appliquer"}
            </Button>
          </div>
          {reponse && <p className="text-xs rounded bg-background px-2 py-1 border">🤖 {reponse}</p>}
          <p className="text-[11px] text-muted-foreground">Les champs sont modifiés ici seulement ; vérifiez puis validez.</p>
        </div>
        <div className="space-y-1.5">
          <Input placeholder="Rechercher un chantier (numéro, nom, mot clé)…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={withOpps} onCheckedChange={(v) => setWithOpps(!!v)} />
            Inclure les opportunités (9XXX) — le planning reste rattaché après signature
          </label>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Suggéré par l'IA :</span>
              {suggestions.map(({ affaire: a }) => (
                <Button key={a.id} type="button" size="sm" variant={a.id === affaireId ? "default" : "outline"} className="h-7 text-xs" onClick={() => setAffaireId(a.id)}>
                  {a.numero} — {a.nom}{a.phase !== "signe" ? " (opp.)" : ""}
                </Button>
              ))}
            </div>
          )}
          {selected && <p className="text-xs">Chantier choisi : <span className="font-medium">{selected.numero} — {selected.nom}</span></p>}
          <div className="max-h-40 overflow-auto rounded-md border">
            {filtered.length === 0 ? <p className="p-2 text-xs text-muted-foreground">Aucun chantier trouvé.</p> : filtered.map((a) => (
              <button key={a.id} type="button" onClick={() => setAffaireId(a.id)}
                className={`block w-full text-left px-2 py-1.5 text-sm hover:bg-accent ${a.id === affaireId ? "bg-accent font-medium" : ""}`}>
                {a.numero} — {a.nom}{a.phase !== "signe" && <span className="ml-1 text-[10px] text-muted-foreground">(opportunité)</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Checkbox checked={l.keep} onCheckedChange={(v) => upd(i, { keep: !!v })} />
              <Input type="date" className="w-40" value={l.date} onChange={(e) => upd(i, { date: e.target.value })} />
              <Select value={l.type} onValueChange={(v) => upd(i, { type: v as EtapeType })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
              {l.auto && <Badge variant="outline" className="text-[10px]">{l.type === "dechargement" ? "Optionnel" : "Suggéré"}</Badge>}
              <Input className="flex-1 min-w-40" value={l.contenu} onChange={(e) => upd(i, { contenu: e.target.value })} />
              <Button size="icon" variant="ghost" className="text-destructive" aria-label="Supprimer l'étape" title="Supprimer l'étape" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              <div className="flex w-full flex-wrap items-center gap-2 pl-6">
                <Input type="time" className="w-28" aria-label="Heure de début" value={l.hDebut} onChange={(e) => upd(i, { hDebut: e.target.value })} />
                <span className="text-xs text-muted-foreground">à</span>
                <Input type="time" className="w-28" aria-label="Heure de fin" value={l.hFin} onChange={(e) => upd(i, { hFin: e.target.value })} />
                <Input type="number" min={0} className="w-20" aria-label="Nombre de personnes" placeholder="Pers." value={l.nb ?? ""} onChange={(e) => upd(i, { nb: e.target.value })} />
                <Input className="flex-1 min-w-40" placeholder="Lieu" value={l.lieu} onChange={(e) => upd(i, { lieu: e.target.value })} />
                <Select value={l.vehiculeId || "none"} onValueChange={(v) => upd(i, { vehiculeId: v === "none" ? "" : v })}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="Véhicule" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sans véhicule</SelectItem>
                    {vehicules.map((v) => <SelectItem key={v.id} value={v.id}>{v.nom}{v.immatriculation ? ` · ${v.immatriculation}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full pl-6 pb-2 border-b">
                <Textarea rows={1} placeholder="Commentaire pour l'équipe (indications au chef logistique…)" value={l.commentaire ?? ""} onChange={(e) => upd(i, { commentaire: e.target.value })} />
              </div>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setLines((ls) => [...ls, { keep: true, date: format(new Date(), "yyyy-MM-dd"), type: "livraison", contenu: "", hDebut: "", hFin: "", lieu: row.metadata_ia?.opp_lieu ?? "", vehiculeId: "" }])}>+ Ajouter une étape</Button>
        </div>
        </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Ajouter au planning</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
