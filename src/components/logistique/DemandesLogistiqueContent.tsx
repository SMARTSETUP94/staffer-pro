import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarPlus, Loader2, MailOpen, RefreshCw, Trash2, Truck, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { assistantEtapes } from "@/lib/server-fns/etapes-assistant.functions";
import { reanalyseSharedInboxes } from "@/lib/server-fns/shared-inbox-reanalyse.functions";
import { toast } from "sonner";
import { useCapability } from "@/hooks/use-capability";
import { supabase } from "@/integrations/supabase/client";
import { completerSuggestionsEmail } from "@/lib/logistique/suggestions-email";
import { appliquerReglesEcheances, rapprocherLieu, type EcheanceRegle, type LieuConnu, type AliasLieu } from "@/lib/logistique/extraction-regles";
import { suggestAffaires } from "@/lib/logistique/suggest-affaire";
import { commentaireEquipe, trouverVehicule, type EcheanceEnrichie } from "@/lib/logistique/gabarit-demande";
import { DemandeLogistiqueForm } from "@/components/logistique/DemandeLogistiqueForm";
import { EmailReaderDialog } from "@/components/emails/EmailReaderDialog";
import { PiecesJointesMailSelection } from "@/components/logistique/PiecesJointesMailSelection";
import { PageHeader } from "@/components/PageHeader";
import { TriFileDialog } from "@/components/logistique/TriFileDialog";
import { QualitePlanning } from "@/components/logistique/QualitePlanning";
import { DoublonChoix, HoraireAvertissement, ResponsableRapproche, useDoublons, useEmployesActifs } from "@/components/logistique/SourceEtapes";
import { avertissementHoraire, rapprocherResponsable, repartirSelonDoublons, type ChoixDoublon } from "@/lib/logistique/source-etapes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPES = ["appro", "emballage", "chargement", "livraison", "tracage", "montage", "finitions", "permanence", "rotation", "demontage", "dechargement"] as const;
type EtapeType = (typeof TYPES)[number];
const TYPE_LABEL: Record<EtapeType, string> = {
  appro: "Appro", emballage: "Emballage", chargement: "Chargement", livraison: "Livraison", tracage: "Traçage", rotation: "Rotation", montage: "Montage",
  finitions: "Finitions", permanence: "Permanence", demontage: "Démontage", dechargement: "Déchargement",
};

type Echeance = Omit<EcheanceEnrichie, "type" | "affaire_numero"> & { type?: string | null; affaire_numero?: string | null };
type Meta = { origine?: string | null; affaire_id?: string | null; fichiers?: string[] | null; resume?: string | null; opp_client?: string | null; opp_projet?: string | null; opp_lieu?: string | null; echeances?: Echeance[] | null };
type Row = {
  id: string; from_email: string; from_name: string | null; subject: string | null; received_at: string;
  body_preview: string | null; body_full: string | null; body_content_type: string | null;
  statut: "pending_review" | "validated" | "dismissed"; metadata_ia: Meta | null; has_attachments?: boolean | null;
};
type Aff = { id: string; numero: string; nom: string; phase: string; client?: string | null };

export function DemandesLogistiqueContent() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"todo" | "done" | "dismissed">("todo");
  const [reading, setReading] = useState<Row | null>(null);
  const [planning, setPlanning] = useState<Row | null>(null);
  const [affaires, setAffaires] = useState<Aff[]>([]);
  const canEdit = useCapability("logistique.etape.edit");
  const isAdmin = useCapability("section.admin");
  const [triOuvert, setTriOuvert] = useState(false);
  const reanalyse = useServerFn(reanalyseSharedInboxes);
  const [reanalysing, setReanalysing] = useState(false);
  const [nouvelle, setNouvelle] = useState(false);
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
      .select("id, from_email, from_name, subject, received_at, body_preview, body_full, body_content_type, statut, metadata_ia, has_attachments")
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
    <div className="space-y-4">
      <PageHeader title="Demandes logistiques" description="Emails reçus sur log@setup.paris — l'IA repère les échéances et propose des étapes pour le planning."
        actions={<div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setNouvelle(true)}>+ Nouvelle demande</Button>
          <Button size="sm" onClick={relever} disabled={releve}>
            {releve ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MailOpen className="h-4 w-4 mr-1" />}
            Relever les emails
          </Button>
          {isAdmin && (
          <Button size="sm" variant="outline" onClick={runReanalyse} disabled={reanalysing}>
            {reanalysing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Relancer l'analyse IA
          </Button>)}
          {isAdmin && <Button size="sm" variant="outline" onClick={() => setTriOuvert(true)}>Reclasser la file</Button>}
        </div>} />
      {isAdmin && <TriFileDialog open={triOuvert} onOpenChange={setTriOuvert} onDone={() => void load()} />}
      <QualitePlanning />
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
                    <p className="font-medium truncate">
                      {m.origine === "formulaire" && <Badge className="mr-2 align-middle">Formulaire</Badge>}
                      {m.opp_projet || r.subject || "(sans objet)"}
                    </p>
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
                        {e.source === "gabarit" ? " · gabarit" : ""}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {nouvelle && (
        <Dialog open onOpenChange={(o) => !o && setNouvelle(false)}>
          <DialogContent className="max-w-3xl max-h-[92vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Nouvelle demande logistique</DialogTitle>
              <DialogDescription>La demande arrive dans « À traiter » ; elle n'est pas ajoutée directement au planning.</DialogDescription>
            </DialogHeader>
            <DemandeLogistiqueForm onDone={() => void load()} />
          </DialogContent>
        </Dialog>
      )}
      {reading && <EmailReaderDialog email={reading} onClose={() => setReading(null)} />}
      {planning && (
        <PlanningDialog row={planning} affaires={affaires} onClose={() => setPlanning(null)}
          onDone={() => { setPlanning(null); void load(); }} />
      )}
    </div>
  );
}

type Line = { auto?: boolean; keep: boolean; date: string; type: EtapeType; contenu: string; hDebut: string; hFin: string; lieu: string; vehiculeId: string; nb?: string; commentaire?: string; responsable?: string; acces?: string; vehiculeTexte?: string; vehiculeSuggere?: string; src?: Echeance };
type Veh = { id: string; nom: string; immatriculation: string | null };

function PlanningDialog({ row, affaires, onClose, onDone }: { row: Row; affaires: Aff[]; onClose: () => void; onDone: () => void }) {
  // Règles L1 appliquées aussi à l'affichage : heures normalisées, année déduite de la réception, dates trop anciennes écartées.
  const ech = useMemo(() => appliquerReglesEcheances((row.metadata_ia?.echeances ?? []) as EcheanceRegle[], row.received_at).echeances as Echeance[], [row]);
  const numero = ech.find((e) => e.affaire_numero)?.affaire_numero;
  const suggestions = useMemo(() => {
    const m = row.metadata_ia;
    const txt = [numero, row.subject, m?.opp_projet, m?.opp_client, m?.opp_lieu, m?.resume, (row.body_full ?? row.body_preview ?? "").replace(/<[^>]+>/g, " ").slice(0, 4000)].filter(Boolean).join(" ");
    return suggestAffaires(txt, affaires);
  }, [row, affaires, numero]);
  const [affaireId, setAffaireId] = useState<string>(row.metadata_ia?.affaire_id ?? affaires.find((a) => a.numero === numero)?.id ?? suggestions[0]?.affaire.id ?? "");
  const [lines, setLines] = useState<Line[]>(() => {
    const base = (ech.length ? ech : [{ date: format(new Date(), "yyyy-MM-dd"), libelle: row.subject ?? "", type: "livraison" }]).map((e) => ({
      keep: true, date: e.date, contenu: e.libelle, lieu: ("lieu" in e && e.lieu) || row.metadata_ia?.opp_lieu || "",
      type: ((TYPES as readonly string[]).includes(e.type ?? "") ? e.type : "livraison") as EtapeType,
      src: e as Echeance,
    }));
    const texteMail = `${row.subject ?? ""} ${(row.body_full ?? row.body_preview ?? "").replace(/<[^>]+>/g, " ")}`;
    return completerSuggestionsEmail(base, undefined, texteMail).map((x) => {
      const e = (x as typeof x & { src?: Echeance }).src;
      return { ...x, src: e, hDebut: e?.heure_debut ?? "", hFin: e?.heure_fin ?? "", vehiculeId: "",
        nb: e?.nb_personnes != null ? String(e.nb_personnes) : undefined, responsable: e?.responsable ?? "",
        acces: e?.acces ?? "", vehiculeTexte: e?.vehicule ?? "",
        commentaire: e ? commentaireEquipe({ ...e, acces: null, vehicule: e.vehicule ?? null }, false) || undefined : undefined };
    });
  });
  const [saving, setSaving] = useState(false);
  const [pjMail, setPjMail] = useState<string[]>([]);
  const [commentaire, setCommentaire] = useState("");
  const assist = useServerFn(assistantEtapes);
  const [consigne, setConsigne] = useState("");
  const [assisting, setAssisting] = useState(false);
  const [reponse, setReponse] = useState<string | null>(null);
  async function runAssist() {
    if (!consigne.trim()) return;
    setAssisting(true);
    try {
      const r = await assist({ data: { instruction: consigne, etapes: lines.map((l, index) => ({ index, coche: l.keep, date: l.date, type: l.type, contenu: l.contenu, heure_debut: l.hDebut || null, heure_fin: l.hFin || null, lieu: l.lieu || null, nb_personnes: l.nb ? Number(l.nb) : null, commentaire: l.commentaire || null })), contexte: [`Objet : ${row.subject ?? ""}`, selected ? `Chantier choisi : ${selected.numero} — ${selected.nom}` : "", (row.body_full ?? row.body_preview ?? "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").slice(0, 25000)].filter(Boolean).join("\n") } });
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
  const [initial] = useState(() => lines.map((l) => ({ type: l.type, date: l.date, contenu: l.contenu, lieu: l.lieu || null, heure_debut: l.hDebut || null, heure_fin: l.hFin || null })));
  const [q, setQ] = useState("");
  const [withOpps, setWithOpps] = useState(false);
  const [vehicules, setVehicules] = useState<Veh[]>([]);
  useEffect(() => {
    void supabase.from("vehicules").select("id, nom, immatriculation").eq("actif", true).order("nom")
      .then(({ data }) => {
        const flotte = (data ?? []) as Veh[];
        setVehicules(flotte);
        // Véhicule écrit dans le mail → véhicule de la flotte ; sinon il reste dans le commentaire.
        setLines((ls) => ls.map((l) => {
          const v = (l.src && "vehicule_id" in l.src && flotte.find((f) => f.id === (l.src as { vehicule_id?: string }).vehicule_id)) || trouverVehicule(l.vehiculeTexte, flotte);
          // Véhicule seulement suggéré : jamais affecté sans un clic.
          if (!v || l.vehiculeId) return l;
          return { ...l, vehiculeSuggere: v.id };
        }));
      });
  }, []);
  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return affaires.filter((a) => (withOpps || a.phase === "signe" || a.id === affaireId) && words.every((w) => `${a.numero} ${a.nom}`.toLowerCase().includes(w))).slice(0, 50);
  }, [q, affaires, withOpps, affaireId]);
  const selected = affaires.find((a) => a.id === affaireId);
  const isHtml = (row.body_content_type ?? "").toLowerCase() === "html";
  const body = row.body_full ?? row.body_preview ?? "";
  const employes = useEmployesActifs();
  const doublons = useDoublons(affaireId, lines.map((l) => ({ type: l.type, date_debut: l.date, heure_debut: l.hDebut || null })));
  const [choix, setChoix] = useState<Record<number, ChoixDoublon>>({});
  const upd = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  async function save() {
    const keptIdx = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.keep && /^\d{4}-\d{2}-\d{2}$/.test(l.date));
    if (!affaireId || keptIdx.length === 0) return toast.error("Choisissez un chantier et au moins une étape datée");
    const refus = keptIdx.find(({ l }) => avertissementHoraire(l.hDebut, l.hFin)?.niveau === "refus");
    if (refus) return toast.error(`Étape du ${refus.l.date} : heure de fin identique à l'heure de début`);
    // Doublons : « Fusionner » et « Ignorer » ne recréent pas l'étape déjà au planning.
    const rep = repartirSelonDoublons(lines.length, doublons, choix);
    const kept = keptIdx.filter(({ i }) => rep.aCreer.includes(i)).map(({ l }) => l);
    setSaving(true);
    const [{ data: lieux }, { data: alias }] = await Promise.all([
      supabase.from("lieux").select("id,label,adresse_complete").eq("actif", true),
      supabase.from("lieux_alias").select("alias,lieu_id"),
    ]);
    const feedback = {
      propose: initial,
      retenu: keptIdx.map(({ l }) => ({ type: l.type, date: l.date, contenu: l.contenu, heure_debut: l.hDebut || null, heure_fin: l.hFin || null, lieu: l.lieu || null })),
      commentaire: commentaire.trim() || null,
    };
    let error: { message: string } | null = null;
    if (kept.length) {
      const r = await supabase.rpc("logistique_valider_demande", { _email_id: row.id, _affaire_id: affaireId, _feedback: feedback as never, _etapes: kept.map((l) => {
        const src = l.src as (Echeance & { duree_minutes?: number | null; a_partir_de?: boolean | null }) | undefined;
        const lieu = rapprocherLieu(l.lieu, (lieux ?? []) as LieuConnu[], (alias ?? []) as AliasLieu[]);
        const resp = rapprocherResponsable(l.responsable, employes);
        return {
          type: l.type, date_debut: l.date, heure_debut: l.hDebut || null, heure_fin: l.hFin || null,
          a_partir_de: src?.a_partir_de ?? null, duree_minutes: src?.duree_minutes ?? null,
          lieu_id: lieu.lieu_id, lieu_douteux: lieu.lieu_douteux, lieu_libre: l.lieu.trim() || null, vehicule_id: l.vehiculeId || null,
          nb_personnes: l.nb ? Number(l.nb) : null, commentaire_equipe: l.commentaire?.trim() || null,
          responsable: resp?.nom ?? (l.responsable?.trim() || null), acces: l.acces?.trim() || null, origine: "jalonnement",
          note: `${l.contenu?.trim() ? `${l.contenu.trim()} — ` : ""}Depuis un email log@ : « ${(row.subject ?? "").slice(0, 120)} »`,
        };
      }) as never });
      error = r.error;
    } else {
      // Tout est déjà au planning : on clôt seulement le mail et on garde la correction pour l'IA.
      const u = await supabase.from("emails_entrants").update({ statut: "validated" }).eq("id", row.id);
      error = u.error;
      if (!error) await supabase.from("ia_feedback_logistique").insert({ email_id: row.id, email_subject: row.subject, ...feedback } as never);
    }
    if (!error) {
      if (pjMail.length > 0) {
        const { saveEmailDocument } = await import("@/lib/server-fns/save-email-document.functions");
        let ok = 0; let ko = 0;
        for (const attachmentId of pjMail) {
          try { await saveEmailDocument({ data: { emailId: row.id, attachmentId, affaireId } }); ok++; } catch { ko++; }
        }
        if (ok) toast.success(`${ok} pièce(s) jointe(s) rattachée(s) aux documents du chantier`);
        if (ko) toast.error(`${ko} pièce(s) jointe(s) non rattachée(s)`);
      }
      if ((row.metadata_ia?.fichiers ?? []).length > 0) {
        try {
          const { rattacherFichiersDemande } = await import("@/lib/server-fns/demande-logistique-documents.functions");
          const r = await rattacherFichiersDemande({ data: { emailId: row.id, affaireId, etapes: kept.map((l) => `${l.type} ${l.date}`).join(", ").slice(0, 290) } });
          if (r.ajoutes) toast.success(`${r.ajoutes} pièce(s) jointe(s) rattachée(s) aux documents du chantier`);
        } catch (e) {
          toast.error("Pièces jointes non rattachées", { description: (e as Error).message });
        }
      }
    }
    setSaving(false);
    if (error) return toast.error("Ajout impossible", { description: error.message });
    toast.success(`${kept.length} étape(s) ajoutée(s) au planning logistique${rep.ecartees.length ? ` · ${rep.ecartees.length} déjà présente(s), non recréée(s)` : ""}`);
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Ajouter au planning logistique</DialogTitle>
          <DialogDescription>
            {ech.some((e) => e.source === "gabarit") ? "Lu depuis le gabarit du mail (sans IA)" : "Suggestions de l'IA"} — corrigez, décochez ce qui ne doit pas être ajouté.

          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2 min-h-0">
        <div className="rounded-md border bg-muted/30 flex flex-col min-h-0">
          <div className="border-b px-3 py-2 text-xs">
            <p className="font-medium text-sm">{row.subject || "(sans objet)"}</p>
            <p className="text-muted-foreground">{row.from_name ? `${row.from_name} · ` : ""}{row.from_email} · {format(parseISO(row.received_at), "d MMM yyyy HH:mm", { locale: fr })}</p>
          </div>
          {row.metadata_ia?.origine === "formulaire" ? (
            <div className="space-y-2 p-3 text-sm">
              <p>Demande envoyée depuis le formulaire par <span className="font-medium">{row.from_name}</span>.</p>
              <FichiersDemande chemins={row.metadata_ia?.fichiers ?? []} />
              {(row.metadata_ia?.fichiers ?? []).length > 0 && <p className="text-xs text-muted-foreground">Ces pièces seront rattachées aux documents du chantier choisi.</p>}
            </div>
          ) : isHtml ? (
            <iframe title="Email" sandbox="" srcDoc={body} className="w-full flex-1 min-h-[55vh] bg-background" />
          ) : (
            <pre className="flex-1 max-h-[60vh] overflow-auto whitespace-pre-wrap p-3 text-xs font-sans">{body}</pre>
          )}
        </div>
        <div className="space-y-3 min-w-0">
        {row.has_attachments && row.metadata_ia?.origine !== "formulaire" && <PiecesJointesMailSelection emailId={row.id} selection={pjMail} onChange={setPjMail} />}
        <details className="rounded-md border bg-muted/30 px-2 py-1 text-xs" open={!!reponse || undefined}>
          <summary className="cursor-pointer select-none py-1 text-muted-foreground">Aide IA (facultatif) — consigne de remplissage, commentaire d'apprentissage</summary>
          <div className="space-y-2 pb-2 pt-1">
            <div className="flex gap-2">
              <Input id="ia-assist" aria-label="Demander à l'IA de remplir les étapes" className="h-8" value={consigne} onChange={(e) => setConsigne(e.target.value)} disabled={assisting}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runAssist(); } }}
                placeholder="Remplir les étapes, ex. : 1 personne et lieu « Studio Lendit » partout" />
              <Button type="button" size="sm" className="h-8" onClick={runAssist} disabled={assisting || !consigne.trim()}>
                {assisting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Appliquer"}
              </Button>
            </div>
            {reponse && <p className="rounded border bg-background px-2 py-1">🤖 {reponse}</p>}
            <Textarea id="ia-comment" aria-label="Commentaire pour l'IA" rows={1} className="min-h-8 text-xs" value={commentaire} onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Commentaire d'apprentissage, ex. : l'entrée prestataires n'est pas une étape" />
          </div>
        </details>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Input className="h-8" placeholder="Rechercher un chantier…" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Le planning reste rattaché après signature">
              <Checkbox checked={withOpps} onCheckedChange={(v) => setWithOpps(!!v)} /> Opp. 9XXX
            </label>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-muted-foreground">IA :</span>
              {suggestions.map(({ affaire: a }) => (
                <Button key={a.id} type="button" size="sm" variant={a.id === affaireId ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={() => setAffaireId(a.id)}>
                  {a.numero} — {a.nom}{a.phase !== "signe" ? " (opp.)" : ""}
                </Button>
              ))}
            </div>
          )}
          {q.trim() && (
            <div className="max-h-28 overflow-auto rounded-md border">
              {filtered.length === 0 ? <p className="p-2 text-xs text-muted-foreground">Aucun chantier trouvé.</p> : filtered.map((a) => (
                <button key={a.id} type="button" onClick={() => { setAffaireId(a.id); setQ(""); }}
                  className={`block w-full px-2 py-1 text-left text-xs hover:bg-accent ${a.id === affaireId ? "bg-accent font-medium" : ""}`}>
                  {a.numero} — {a.nom}{a.phase !== "signe" && <span className="ml-1 text-[10px] text-muted-foreground">(opportunité)</span>}
                </button>
              ))}
            </div>
          )}
          {selected && <p className="text-xs">Chantier : <span className="font-medium">{selected.numero} — {selected.nom}</span></p>}
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className={`space-y-1.5 rounded-md border p-2 ${l.keep ? "" : "opacity-50"}`}>
              <div className="flex items-center gap-1.5">
                <Checkbox checked={l.keep} onCheckedChange={(v) => upd(i, { keep: !!v })} aria-label="Garder l'étape" />
                <Input type="date" className="h-8 w-36 text-xs" value={l.date} onChange={(e) => upd(i, { date: e.target.value })} />
                <Select value={l.type} onValueChange={(v) => upd(i, { type: v as EtapeType })}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
                {l.auto && <Badge variant="outline" className="shrink-0 text-[10px]">{l.type === "dechargement" ? "Optionnel" : "Suggéré"}</Badge>}
                <Input className="h-8 min-w-0 flex-1 text-xs" aria-label="Libellé" value={l.contenu} onChange={(e) => upd(i, { contenu: e.target.value })} />
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" aria-label="Supprimer l'étape" title="Supprimer l'étape" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="grid grid-cols-[6rem_6rem_4rem_minmax(0,1fr)] gap-1.5 pl-6">
                <Input type="time" className="h-8 text-xs" aria-label="Heure de début" value={l.hDebut} onChange={(e) => upd(i, { hDebut: e.target.value })} />
                <Input type="time" className="h-8 text-xs" aria-label="Heure de fin" value={l.hFin} onChange={(e) => upd(i, { hFin: e.target.value })} />
                <Input type="number" min={0} className="h-8 text-xs" aria-label="Nombre de personnes" placeholder="Pers." value={l.nb ?? ""} onChange={(e) => upd(i, { nb: e.target.value })} />
                <Input className="h-8 text-xs" placeholder="Lieu" value={l.lieu} onChange={(e) => upd(i, { lieu: e.target.value })} />
              </div>
              <div className="grid grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 pl-6">
                <Select value={l.vehiculeId || "none"} onValueChange={(v) => upd(i, { vehiculeId: v === "none" ? "" : v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Véhicule" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sans véhicule</SelectItem>
                    {vehicules.map((v) => <SelectItem key={v.id} value={v.id}>{v.nom}{v.immatriculation ? ` · ${v.immatriculation}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input className="h-8 text-xs" placeholder="Chef d'équipe" aria-label="Responsable" value={l.responsable ?? ""} onChange={(e) => upd(i, { responsable: e.target.value })} />
                <Input className="h-8 text-xs" placeholder="Accès / contraintes" aria-label="Accès" value={l.acces ?? ""} onChange={(e) => upd(i, { acces: e.target.value })} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6">
                <HoraireAvertissement debut={l.hDebut} fin={l.hFin} />
                <ResponsableRapproche texte={l.responsable} employes={employes} />
                {l.vehiculeSuggere && !l.vehiculeId && (() => { const v = vehicules.find((x) => x.id === l.vehiculeSuggere); return v ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">Véhicule cité : {v.nom}
                    <Button type="button" size="sm" variant="outline" className="h-5 px-1.5 text-[10px]" onClick={() => upd(i, { vehiculeId: v.id })}>Affecter</Button></span>) : null; })()}
              </div>
              {l.keep && <div className="pl-6"><DoublonChoix doublons={doublons.filter((d) => d.index === i)} choix={choix[i] ?? "fusionner"} onChoix={(c) => setChoix((m) => ({ ...m, [i]: c }))} /></div>}
              <div className="pl-6">
                <Input className="h-8 text-xs" placeholder="Commentaire pour l'équipe" aria-label="Commentaire pour l'équipe" value={l.commentaire ?? ""} onChange={(e) => upd(i, { commentaire: e.target.value })} />
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

function FichiersDemande({ chemins }: { chemins: string[] }) {
  const [urls, setUrls] = useState<Array<{ path: string; url: string }>>([]);
  useEffect(() => {
    if (!chemins.length) return;
    void supabase.storage.from("demandes-logistique").createSignedUrls(chemins, 3600)
      .then(({ data }) => setUrls((data ?? []).filter((d) => d.signedUrl).map((d) => ({ path: d.path ?? "", url: d.signedUrl as string }))));
  }, [chemins.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!chemins.length) return <p className="text-xs text-muted-foreground">Aucune pièce jointe.</p>;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">Pièces jointes</p>
      {urls.map((u, i) => <a key={u.path} href={u.url} target="_blank" rel="noreferrer" className="block text-xs text-primary underline">Pièce jointe {i + 1} ({u.path.split(".").pop()?.toUpperCase()})</a>)}
    </div>
  );
}
