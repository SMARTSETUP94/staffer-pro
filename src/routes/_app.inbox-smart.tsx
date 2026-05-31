/**
 * Inbox SMART — tri humain des emails entrants smart@setup.paris.
 * Cap : inbox_smart.view (admin, rh, chef_chantier).
 */
import { createFileRoute } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Mail, RefreshCw, Check, X, UserPlus, Building2, Loader2, Inbox as InboxIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const METIERS_CANDIDATURE = [
  "construction",
  "métallerie",
  "peinture",
  "numérique",
  "tapisserie",
  "machiniste",
  "logistique",
  "suivi_projet",
];

type CategorieIA = "candidature" | "opportunite" | "pub" | "autre";
type StatutEmail = "pending_review" | "validated" | "dismissed";

interface EmailRow {
  id: string;
  message_id_outlook: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  received_at: string;
  body_preview: string | null;
  categorie_ia: CategorieIA | null;
  confiance_ia: number | null;
  metadata_ia: {
    metier?: string | null;
    poste_devine?: string | null;
    nom?: string | null;
    prenom?: string | null;
    resume?: string | null;
  } | null;
  statut: StatutEmail;
  archived_outlook: boolean;
  candidature_id: string | null;
  opportunite_id: string | null;
  dismiss_reason: string | null;
}

const CATEGORIE_LABEL: Record<CategorieIA, string> = {
  candidature: "Candidature",
  opportunite: "Opportunité",
  pub: "Pub / Spam",
  autre: "Autre",
};

const CATEGORIE_COLOR: Record<CategorieIA, string> = {
  candidature: "bg-blue-100 text-blue-800",
  opportunite: "bg-amber-100 text-amber-800",
  pub: "bg-slate-100 text-slate-600",
  autre: "bg-slate-100 text-slate-600",
};

export const Route = createFileRoute("/_app/inbox-smart")({
  beforeLoad: () => requireCapability("inbox_smart.view"),
  component: InboxSmartPage,
});

function InboxSmartPage() {
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [tab, setTab] = useState<"pending" | "candidature" | "opportunite" | "pub" | "all">("pending");
  const [selected, setSelected] = useState<EmailRow | null>(null);
  const [createCandidat, setCreateCandidat] = useState<EmailRow | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("emails_entrants")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("Erreur chargement", { description: error.message });
    } else {
      setEmails((data ?? []) as EmailRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    switch (tab) {
      case "pending":
        return emails.filter((e) => e.statut === "pending_review");
      case "candidature":
        return emails.filter((e) => e.categorie_ia === "candidature" && e.statut !== "dismissed");
      case "opportunite":
        return emails.filter((e) => e.categorie_ia === "opportunite" && e.statut !== "dismissed");
      case "pub":
        return emails.filter((e) => e.categorie_ia === "pub" || e.statut === "dismissed");
      case "all":
      default:
        return emails;
    }
  }, [emails, tab]);

  const counts = useMemo(
    () => ({
      pending: emails.filter((e) => e.statut === "pending_review").length,
      candidature: emails.filter((e) => e.categorie_ia === "candidature" && e.statut !== "dismissed").length,
      opportunite: emails.filter((e) => e.categorie_ia === "opportunite" && e.statut !== "dismissed").length,
      pub: emails.filter((e) => e.categorie_ia === "pub" || e.statut === "dismissed").length,
    }),
    [emails],
  );

  async function pollNow() {
    setPolling(true);
    try {
      const res = await fetch("/api/public/hooks/poll-smart-inbox", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        },
        body: "{}",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Erreur");
      toast.success(`Synchro OK : ${j.inserted ?? 0} nouveaux email(s)`);
      await load();
    } catch (e) {
      toast.error("Erreur synchro", { description: (e as Error).message });
    } finally {
      setPolling(false);
    }
  }

  async function dismissEmail(e: EmailRow, reason: string) {
    const { error } = await supabase
      .from("emails_entrants")
      .update({
        statut: "dismissed",
        dismiss_reason: reason,
        validated_at: new Date().toISOString(),
      })
      .eq("id", e.id);
    if (error) {
      toast.error("Erreur", { description: error.message });
      return;
    }
    toast.success("Email écarté");
    await load();
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <InboxIcon className="h-6 w-6" />
            Inbox SMART
          </h1>
          <p className="text-sm text-muted-foreground">
            Tri des emails entrants <code className="text-xs">smart@setup.paris</code> — relève toutes les 5 min.
          </p>
        </div>
        <Button onClick={pollNow} disabled={polling} variant="outline">
          {polling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Synchroniser maintenant</span>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="pending">À trier {counts.pending > 0 && <Badge variant="secondary" className="ml-1">{counts.pending}</Badge>}</TabsTrigger>
          <TabsTrigger value="candidature">Candidatures <span className="ml-1 text-xs opacity-60">{counts.candidature}</span></TabsTrigger>
          <TabsTrigger value="opportunite">Opportunités <span className="ml-1 text-xs opacity-60">{counts.opportunite}</span></TabsTrigger>
          <TabsTrigger value="pub">Pubs / Écartés <span className="ml-1 text-xs opacity-60">{counts.pub}</span></TabsTrigger>
          <TabsTrigger value="all">Tout</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Aucun email dans cet onglet.
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((e) => (
                <Card key={e.id} className="p-4 hover:shadow-sm transition">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {e.categorie_ia && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORIE_COLOR[e.categorie_ia]}`}>
                            {CATEGORIE_LABEL[e.categorie_ia]}
                          </span>
                        )}
                        {e.confiance_ia != null && (
                          <span className="text-xs text-muted-foreground">{Math.round(e.confiance_ia * 100)}%</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(e.received_at), "d MMM HH:mm", { locale: fr })}
                        </span>
                        {e.statut === "validated" && <Badge variant="default" className="text-xs">validé</Badge>}
                        {e.statut === "dismissed" && <Badge variant="outline" className="text-xs">écarté</Badge>}
                      </div>
                      <div className="font-medium mt-1 truncate">{e.subject ?? "(sans sujet)"}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.from_name ?? ""} &lt;{e.from_email}&gt;
                      </div>
                      {e.body_preview && (
                        <div className="text-sm mt-1 text-muted-foreground line-clamp-2">{e.body_preview}</div>
                      )}
                      {e.metadata_ia?.metier && (
                        <div className="text-xs mt-1">
                          <strong>Métier deviné :</strong> {e.metadata_ia.metier}
                          {e.metadata_ia.poste_devine && ` — ${e.metadata_ia.poste_devine}`}
                        </div>
                      )}
                    </div>
                    {e.statut === "pending_review" && (
                      <div className="flex gap-2 shrink-0">
                        {e.categorie_ia === "candidature" && (
                          <Button size="sm" onClick={() => setCreateCandidat(e)}>
                            <UserPlus className="h-3.5 w-3.5 mr-1" /> Créer candidat
                          </Button>
                        )}
                        {e.categorie_ia === "opportunite" && (
                          <Button size="sm" variant="outline" disabled title="À venir : créer opportunité depuis email">
                            <Building2 className="h-3.5 w-3.5 mr-1" /> Opportunité
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => dismissEmail(e, "manuel")}>
                          <X className="h-3.5 w-3.5 mr-1" /> Écarter
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {createCandidat && (
        <CreateCandidatDialog
          email={createCandidat}
          onClose={() => setCreateCandidat(null)}
          onDone={async () => {
            setCreateCandidat(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function CreateCandidatDialog({
  email,
  onClose,
  onDone,
}: {
  email: EmailRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const meta = email.metadata_ia ?? {};
  const [nom, setNom] = useState(meta.nom ?? "");
  const [prenom, setPrenom] = useState(meta.prenom ?? "");
  const [poste, setPoste] = useState(meta.poste_devine ?? "");
  const [metier, setMetier] = useState(meta.metier ?? "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!nom.trim()) {
      toast.error("Nom requis");
      return;
    }
    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { data: created, error } = await supabase
      .from("candidatures")
      .insert({
        nom: nom.trim(),
        prenom: prenom.trim() || null,
        email: email.from_email,
        poste_vise: poste.trim() || null,
        metier: metier || null,
        source_email_id: email.id,
        created_by: userId ?? null,
      })
      .select("id")
      .single();
    if (error || !created) {
      toast.error("Erreur", { description: error?.message });
      setSaving(false);
      return;
    }
    const { error: upErr } = await supabase
      .from("emails_entrants")
      .update({
        statut: "validated",
        candidature_id: created.id,
        validated_at: new Date().toISOString(),
        validated_by: userId ?? null,
      })
      .eq("id", email.id);
    if (upErr) {
      toast.error("Candidat créé mais email non lié", { description: upErr.message });
    } else {
      toast.success("Candidat créé");
    }
    setSaving(false);
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer la candidature</DialogTitle>
          <DialogDescription>
            Depuis l'email de <strong>{email.from_name ?? email.from_email}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Prénom</Label>
              <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} />
            </div>
            <div>
              <Label>Nom *</Label>
              <Input value={nom} onChange={(e) => setNom(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Poste visé</Label>
            <Input value={poste} onChange={(e) => setPoste(e.target.value)} placeholder="ex: Constructeur, Tapissier…" />
          </div>
          <div>
            <Label>Métier</Label>
            <Select value={metier} onValueChange={setMetier}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {METIERS_CANDIDATURE.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
