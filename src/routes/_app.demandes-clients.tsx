import { ClientCombobox } from "@/components/clients/ClientCombobox";
import { EmailReaderDialog } from "@/components/emails/EmailReaderDialog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Inbox, Loader2, MailOpen, Sparkles, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useCapability } from "@/hooks/use-capability";
import { reanalyseSharedInboxes } from "@/lib/server-fns/shared-inbox-reanalyse.functions";
import { RefreshCw, Paperclip, Download, Eye } from "lucide-react";
import { listEmailAttachments, getEmailAttachment, type EmailAttachment } from "@/lib/server-fns/shared-inbox-attachments.functions";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useChargesAffaires } from "@/hooks/use-charges-affaires";
import { TAILLE_LABEL, TAILLE_ORDER, type OpportuniteTaille } from "@/lib/opportunites";
import { extractOriginalSender } from "@/lib/forwarded-email";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/demandes-clients")({
  beforeLoad: () => requireCapability("demandes_clients.view"),
  head: () => ({
    meta: [
      { title: "Demandes clients — devis@setup.paris" },
      { name: "description", content: "Demandes entrantes devis@ analysées par l'IA pour alimenter le pipeline." },
    ],
  }),
  component: DemandesClientsPage,
});

type Meta = {
  resume?: string | null;
  opp_client?: string | null;
  opp_projet?: string | null;
  opp_taille?: string | null;
  opp_date_evenement?: string | null;
  opp_lieu?: string | null;
  opp_besoins?: string | null;
};

type Row = {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  received_at: string;
  body_preview: string | null;
  body_full: string | null;
  body_content_type: string | null;
  categorie_ia: string | null;
  statut: "pending_review" | "validated" | "dismissed";
  opportunite_id: string | null;
  metadata_ia: Meta | null;
};

function DemandesClientsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"todo" | "done" | "dismissed">("todo");
  const [current, setCurrent] = useState<Row | null>(null);
  const [reading, setReading] = useState<Row | null>(null);
  const isAdmin = useCapability("section.admin");
  const reanalyse = useServerFn(reanalyseSharedInboxes);
  const [reanalysing, setReanalysing] = useState(false);
  async function runReanalyse() {
    setReanalysing(true);
    try {
      const r = await reanalyse({ data: { limit: 60 } });
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
      .select("id, from_email, from_name, subject, received_at, body_preview, body_full, body_content_type, categorie_ia, statut, opportunite_id, metadata_ia")
      .eq("source_boite", "devis")
      .order("received_at", { ascending: false })
      .limit(300);
    if (error) toast.error("Chargement impossible", { description: error.message });
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const lists = useMemo(() => ({
    todo: rows.filter((r) => r.statut === "pending_review" && !r.opportunite_id),
    done: rows.filter((r) => !!r.opportunite_id),
    dismissed: rows.filter((r) => r.statut === "dismissed" && !r.opportunite_id),
  }), [rows]);

  async function dismiss(r: Row) {
    const { error } = await supabase.from("emails_entrants").update({ statut: "dismissed" }).eq("id", r.id);
    if (error) return toast.error("Erreur", { description: error.message });
    void load();
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Demandes clients"
        description="Emails reçus sur devis@setup.paris — l'IA propose une opportunité pour chaque demande."
        actions={isAdmin ? (
          <Button size="sm" variant="outline" onClick={runReanalyse} disabled={reanalysing}>
            {reanalysing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Relancer l'analyse IA
          </Button>
        ) : undefined}
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="todo">À traiter <span className="ml-1.5 text-xs opacity-60">{lists.todo.length}</span></TabsTrigger>
          <TabsTrigger value="done">Converties <span className="ml-1.5 text-xs opacity-60">{lists.done.length}</span></TabsTrigger>
          <TabsTrigger value="dismissed">Écartées <span className="ml-1.5 text-xs opacity-60">{lists.dismissed.length}</span></TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : lists[tab].length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Aucune demande ici pour l'instant.
        </div>
      ) : (
        <div className="space-y-2">
          {lists[tab].map((r) => {
            const m = r.metadata_ia ?? {};
            return (
              <div key={r.id} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.subject || "(sans objet)"}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.from_name ? `${r.from_name} · ` : ""}{r.from_email} · {format(parseISO(r.received_at), "d MMM yyyy HH:mm", { locale: fr })}
                    </div>
                  </div>
                  {r.categorie_ia && r.categorie_ia !== "opportunite" && (
                    <Badge variant="outline">IA : {r.categorie_ia}</Badge>
                  )}
                </div>
                {(m.opp_client || m.opp_projet || m.resume) && (
                  <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                      <Sparkles className="h-3.5 w-3.5" /> Proposition IA
                    </div>
                    {(m.opp_client || m.opp_projet) && (
                      <div><b>{m.opp_client ?? "Client ?"}</b>{m.opp_projet ? ` — ${m.opp_projet}` : ""}</div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {m.opp_taille && m.opp_taille in TAILLE_LABEL && <Badge variant="secondary">{TAILLE_LABEL[m.opp_taille as OpportuniteTaille]}</Badge>}
                      {m.opp_date_evenement && <Badge variant="secondary">{m.opp_date_evenement}</Badge>}
                      {m.opp_lieu && <Badge variant="secondary">{m.opp_lieu}</Badge>}
                    </div>
                    {(m.opp_besoins || m.resume) && <p className="text-muted-foreground">{m.opp_besoins || m.resume}</p>}
                  </div>
                )}
                {!m.opp_client && r.body_preview && <p className="text-sm text-muted-foreground line-clamp-2">{r.body_preview}</p>}
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => setReading(r)}>
                    <MailOpen className="h-4 w-4 mr-1" /> Lire l'email
                  </Button>
                  {r.opportunite_id ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/opportunites/$affaireId" params={{ affaireId: r.opportunite_id }}>
                        <Trophy className="h-4 w-4 mr-1" /> Voir l'opportunité
                      </Link>
                    </Button>
                  ) : (
                    <>
                      {r.statut !== "dismissed" && (
                        <Button size="sm" variant="ghost" onClick={() => dismiss(r)}><X className="h-4 w-4 mr-1" /> Écarter</Button>
                      )}
                      <Button size="sm" onClick={() => setCurrent(r)}><Trophy className="h-4 w-4 mr-1" /> Créer l'opportunité</Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {current && (
        <CreateOppDialog email={current} onClose={() => setCurrent(null)} onDone={() => { setCurrent(null); void load(); }} />
      )}
      {reading && <EmailReaderDialog email={reading} onClose={() => setReading(null)} />}
    </div>
  );
}


function CreateOppDialog({ email, onClose, onDone }: { email: Row; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const { data: charges } = useChargesAffaires();
  const m = email.metadata_ia ?? {};
  const domain = email.from_email.split("@")[1]?.split(".")[0] ?? "";
  // Email transféré : le vrai client est l'expéditeur d'origine (bloc « De : »
  // le plus bas du corps), pas le collègue qui a transféré.
  const original = extractOriginalSender(email.body_full);
  const originalDomain = original?.email?.split("@")[1]?.split(".")[0];
  const clientEmail = original?.email ?? email.from_email;
  const fullDomain = clientEmail.split("@")[1]?.toLowerCase() ?? "";
  const isGenericDomain = /^(setup\.paris|groupe-smart\.fr|gmail\.com|hotmail\.|outlook\.|yahoo\.|icloud\.com|orange\.fr|free\.fr|wanadoo\.fr|live\.)/.test(fullDomain);
  const [client, setClient] = useState(
    m.opp_client ?? original?.name ?? originalDomain ?? email.from_name ?? domain,
  );
  const [clientId, setClientId] = useState<string | null>(null);
  const cleanSubject = (email.subject ?? "").replace(/^\s*((tr|re|fw|fwd)\s*:\s*)+/i, "").trim();
  const [nom, setNom] = useState(m.opp_projet ?? cleanSubject);
  const [code, setCode] = useState("");
  const [chargeId, setChargeId] = useState(user?.id ?? "");
  const [taille, setTaille] = useState<OpportuniteTaille>(
    m.opp_taille && m.opp_taille in TAILLE_LABEL ? (m.opp_taille as OpportuniteTaille) : "petit",
  );
  const [dateOpp, setDateOpp] = useState(new Date().toISOString().slice(0, 10));
  const [commentaires, setCommentaires] = useState(
    [m.opp_besoins, m.opp_lieu && `Lieu : ${m.opp_lieu}`, m.opp_date_evenement && `Date événement : ${m.opp_date_evenement}`, `Source : ${email.from_email}`]
      .filter(Boolean).join("\n"),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void supabase.rpc("next_affaire_numero", { _prefix: 9 }).then(({ data }) => data && setCode(String(data)));
    // Rapprochement CRM : domaine email puis nom normalisé.
    void (async () => {
      if (fullDomain && !isGenericDomain) {
        const { data } = await supabase.from("clients").select("id,nom").contains("domaines_email", [fullDomain]).limit(1);
        if (data?.[0]) { setClientId(data[0].id); setClient(data[0].nom); return; }
      }
      if (client.trim()) {
        const { data: norm } = await supabase.rpc("normalize_client_name", { p: client });
        if (norm) {
          const { data } = await supabase.from("clients").select("id,nom").eq("nom_normalise", norm).limit(1);
          if (data?.[0]) { setClientId(data[0].id); setClient(data[0].nom); }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!client.trim()) return toast.error("Client obligatoire");
    if (!/^9\d{3}$/.test(code)) return toast.error("Code invalide (9XXX)");
    if (!chargeId) return toast.error("Chargé d'affaires obligatoire");
    setSaving(true);
    // Alimente le CRM : crée la fiche prospect si elle n'existe pas encore.
    let cid = clientId;
    if (!cid) {
      const { data: norm } = await supabase.rpc("normalize_client_name", { p: client.trim() });
      const { data: found } = await supabase.from("clients").select("id").eq("nom_normalise", norm ?? "").limit(1);
      cid = found?.[0]?.id ?? null;
      if (!cid) {
        const { data: created, error: cErr } = await supabase.from("clients").insert({
          nom: client.trim(),
          nom_normalise: norm ?? client.trim().toLowerCase(),
          domaines_email: fullDomain && !isGenericDomain ? [fullDomain] : [],
          email: clientEmail.endsWith("@setup.paris") ? null : clientEmail,
          notes: "Prospect créé depuis une demande devis@",
        }).select("id").single();
        if (cErr) toast.warning("Fiche client non créée", { description: cErr.message });
        cid = created?.id ?? null;
      }
    }
    const { error } = await supabase.rpc("create_opportunite", {
      _client: client.trim(),
      _nom: nom.trim() || client.trim(),
      _code: code,
      _charge_affaires_id: chargeId,
      _taille: taille,
      _date_opportunite: dateOpp,
      _commentaires: commentaires.trim() || undefined,
    });
    if (error) { setSaving(false); return toast.error("Création impossible", { description: error.message }); }
    const { data: opp } = await supabase.from("affaires").select("id").eq("numero", code).maybeSingle();
    if (opp?.id) {
      if (cid) await supabase.from("affaires").update({ client_id: cid }).eq("id", opp.id);
      await supabase.from("emails_entrants")
        .update({ opportunite_id: opp.id, statut: "validated", categorie_ia: "opportunite" })
        .eq("id", email.id);
    }
    setSaving(false);
    toast.success(`Opportunité ${code} ajoutée au pipeline`);
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Créer l'opportunité</DialogTitle>
          <DialogDescription>Champs pré-remplis par l'IA à partir de l'email — vérifiez avant de valider.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
            <div><Label>Date</Label><Input type="date" value={dateOpp} onChange={(e) => setDateOpp(e.target.value)} /></div>
          </div>
          <div><Label>Client</Label><ClientCombobox value={client} clientId={clientId} onChange={(id, n) => { setClientId(id); setClient(n); }} />{!clientId && client.trim() && <p className="text-xs text-muted-foreground mt-1">Nouveau prospect « {client} » : sa fiche sera créée dans le carnet clients.</p>}</div>
          <div><Label>Projet</Label><Input value={nom} onChange={(e) => setNom(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Chargé d'affaires</Label>
              <Select value={chargeId} onValueChange={setChargeId}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  {(charges ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name ?? c.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Taille</Label>
              <Select value={taille} onValueChange={(v) => setTaille(v as OpportuniteTaille)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAILLE_ORDER.map((t) => <SelectItem key={t} value={t}>{TAILLE_LABEL[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Commentaires</Label><Textarea rows={4} value={commentaires} onChange={(e) => setCommentaires(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Ajouter au pipeline</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
