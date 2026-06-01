/**
 * Inbox SMART — tri humain des emails entrants smart@setup.paris.
 * Cap : inbox_smart.view (admin, rh, chef_chantier).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Mail,
  RefreshCw,
  X,
  UserPlus,
  Building2,
  Loader2,
  Inbox as InboxIcon,
  Megaphone,
  HelpCircle,
  CheckCircle2,
  Paperclip,
  Unlink,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getOutlookFullBody } from "@/server/inbox-smart.functions";
import { useAuth } from "@/lib/auth-context";
import { useChargesAffaires } from "@/hooks/use-charges-affaires";
import { NouvelleOpportuniteDialog } from "@/components/opportunites/NouvelleOpportuniteDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  conversation_id: string | null;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  received_at: string;
  body_preview: string | null;
  body_full: string | null;
  body_content_type: string | null;
  has_attachments?: boolean | null;
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
  client_id: string | null;
  contact_id: string | null;
  dismiss_reason: string | null;
}

function normalizeSubject(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/^(\s*(re|ré|fwd?|tr|fw)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CATEGORIE_LABEL: Record<CategorieIA, string> = {
  candidature: "Candidature",
  opportunite: "Opportunité",
  pub: "Pub / Spam",
  autre: "Autre",
};

const CATEGORIE_COLOR: Record<CategorieIA, string> = {
  candidature: "bg-blue-100 text-blue-800 border-blue-200",
  opportunite: "bg-amber-100 text-amber-800 border-amber-200",
  pub: "bg-slate-100 text-slate-600 border-slate-200",
  autre: "bg-slate-100 text-slate-600 border-slate-200",
};

export const Route = createFileRoute("/_app/inbox-smart")({
  beforeLoad: () => requireCapability("inbox_smart.view"),
  component: InboxSmartPage,
});

function InboxSmartPage() {
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [tab, setTab] = useState<"pending" | "candidature" | "opportunite" | "pub" | "all">(
    "pending",
  );
  const [selected, setSelected] = useState<EmailRow | null>(null);
  const [createCandidat, setCreateCandidat] = useState<EmailRow | null>(null);
  const [attachOpp, setAttachOpp] = useState<EmailRow | null>(null);
  const [q, setQ] = useState("");
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});

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
    const base = (() => {
      switch (tab) {
        case "pending":
          return emails.filter((e) => e.statut === "pending_review");
        case "candidature":
          return emails.filter(
            (e) => e.categorie_ia === "candidature" && e.statut !== "dismissed",
          );
        case "opportunite":
          return emails.filter(
            (e) => e.categorie_ia === "opportunite" && e.statut !== "dismissed",
          );
        case "pub":
          return emails.filter((e) => e.categorie_ia === "pub" || e.statut === "dismissed");
        case "all":
        default:
          return emails;
      }
    })();
    const needle = q.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((e) => {
      const hay = [
        e.subject,
        e.from_email,
        e.from_name,
        e.body_preview,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [emails, tab, q]);

  const oppGroups = useMemo(() => {
    if (tab !== "opportunite") return [] as Array<{ key: string; subject: string; items: EmailRow[]; latest: string }>;
    const map = new Map<string, EmailRow[]>();
    for (const e of filtered) {
      const key = e.conversation_id?.trim() || `subj:${normalizeSubject(e.subject)}|${e.from_email.toLowerCase()}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    const groups = Array.from(map.entries()).map(([key, items]) => {
      const sorted = [...items].sort((a, b) => (a.received_at < b.received_at ? 1 : -1));
      return {
        key,
        items: sorted,
        latest: sorted[0]?.received_at ?? "",
        subject: sorted[0]?.subject ?? "(sans sujet)",
      };
    });
    groups.sort((a, b) => (a.latest < b.latest ? 1 : -1));
    return groups;
  }, [filtered, tab]);


  const counts = useMemo(
    () => ({
      pending: emails.filter((e) => e.statut === "pending_review").length,
      candidature: emails.filter(
        (e) => e.categorie_ia === "candidature" && e.statut !== "dismissed",
      ).length,
      opportunite: emails.filter(
        (e) => e.categorie_ia === "opportunite" && e.statut !== "dismissed",
      ).length,
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

  async function reclassify(e: EmailRow, newCat: CategorieIA) {
    // Si la catégorie change ET que l'email était écarté/validé,
    // on le replace en "à trier" pour qu'il bouge bien d'onglet et soit re-validé.
    const categoryChanged = e.categorie_ia !== newCat;
    const wasFinalized = e.statut === "dismissed" || e.statut === "validated";
    const patch: {
      categorie_ia: CategorieIA;
      statut?: StatutEmail;
      dismiss_reason?: string | null;
      validated_at?: string | null;
      validated_by?: string | null;
    } = { categorie_ia: newCat };
    if (categoryChanged && wasFinalized) {
      patch.statut = "pending_review";
      patch.dismiss_reason = null;
      patch.validated_at = null;
      patch.validated_by = null;
    }

    const { error } = await supabase
      .from("emails_entrants")
      .update(patch)
      .eq("id", e.id);
    if (error) {
      toast.error("Erreur", { description: error.message });
      return;
    }
    toast.success(`Reclassé : ${CATEGORIE_LABEL[newCat]}`);
    await load();
    setSelected((cur) =>
      cur && cur.id === e.id
        ? {
            ...cur,
            categorie_ia: newCat,
            ...(categoryChanged && wasFinalized
              ? { statut: "pending_review" as StatutEmail, dismiss_reason: null }
              : {}),
          }
        : cur,
    );
  }


  async function validateClassification(e: EmailRow) {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase
      .from("emails_entrants")
      .update({
        statut: "validated",
        validated_at: new Date().toISOString(),
        validated_by: userId ?? null,
      })
      .eq("id", e.id);
    if (error) {
      toast.error("Erreur", { description: error.message });
      return;
    }
    toast.success("Classement validé");
    await load();
    setSelected(null);
  }

  async function detachOpportunite(e: EmailRow) {
    const { error } = await supabase
      .from("emails_entrants")
      .update({
        opportunite_id: null,
        statut: "pending_review",
        validated_at: null,
        validated_by: null,
      })
      .eq("id", e.id);
    if (error) {
      toast.error("Erreur", { description: error.message });
      return;
    }
    toast.success("Email détaché de l'opportunité");
    await load();
    setSelected((cur) =>
      cur && cur.id === e.id
        ? { ...cur, opportunite_id: null, statut: "pending_review" }
        : cur,
    );
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
            Tri des emails entrants{" "}
            <code className="text-xs">smart@setup.paris</code> — relève toutes les 5 min.
          </p>
        </div>
        <Button onClick={pollNow} disabled={polling} variant="outline">
          {polling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Synchroniser maintenant</span>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        {/* Scrollable horizontalement sur mobile pour éviter le chevauchement */}
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="inline-flex w-max gap-1">
            <TabsTrigger value="pending" className="whitespace-nowrap">
              À trier
              {counts.pending > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
                  {counts.pending}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="candidature" className="whitespace-nowrap">
              Candidatures
              <span className="ml-1.5 text-xs opacity-60">{counts.candidature}</span>
            </TabsTrigger>
            <TabsTrigger value="opportunite" className="whitespace-nowrap">
              Opportunités
              <span className="ml-1.5 text-xs opacity-60">{counts.opportunite}</span>
            </TabsTrigger>
            <TabsTrigger value="pub" className="whitespace-nowrap">
              Pubs / Écartés
              <span className="ml-1.5 text-xs opacity-60">{counts.pub}</span>
            </TabsTrigger>
            <TabsTrigger value="all" className="whitespace-nowrap">
              Tout
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={tab} className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher (sujet, expéditeur, contenu)…"
              className="pl-8 h-9"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Effacer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {(() => {
            const renderCard = (e: EmailRow) => (
              <Card
                key={e.id}
                className="p-3 hover:shadow-md transition cursor-pointer active:scale-[0.99]"
                onClick={() => setSelected(e)}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {e.categorie_ia && (
                        <span
                          className={`text-[11px] px-1.5 py-0.5 rounded border font-medium ${CATEGORIE_COLOR[e.categorie_ia]}`}
                        >
                          {CATEGORIE_LABEL[e.categorie_ia]}
                        </span>
                      )}
                      {e.confiance_ia != null && (
                        <span className="text-[11px] text-muted-foreground">
                          {Math.round(e.confiance_ia * 100)}%
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {format(parseISO(e.received_at), "d MMM HH:mm", { locale: fr })}
                      </span>
                      {e.has_attachments && (
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                      )}
                      {e.statut === "validated" && (
                        <Badge variant="default" className="text-[10px] h-4 px-1">
                          validé
                        </Badge>
                      )}
                      {e.statut === "dismissed" && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                          écarté
                        </Badge>
                      )}
                    </div>
                    <div className="font-medium text-sm truncate">
                      {e.subject ?? "(sans sujet)"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {e.from_name ? `${e.from_name} ` : ""}
                      <span className="opacity-70">&lt;{e.from_email}&gt;</span>
                    </div>
                    {e.body_preview && (
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {e.body_preview}
                      </div>
                    )}
                  </div>
                  {e.statut === "pending_review" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-8 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        validateClassification(e);
                      }}
                      title={
                        e.categorie_ia
                          ? `Valider comme ${CATEGORIE_LABEL[e.categorie_ia]}`
                          : "Valider le classement"
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Valider</span>
                    </Button>
                  )}
                </div>
              </Card>
            );

            if (loading) {
              return (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              );
            }
            if (filtered.length === 0) {
              return (
                <Card className="p-8 text-center text-muted-foreground">
                  <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  {q ? "Aucun résultat pour cette recherche." : "Aucun email dans cet onglet."}
                </Card>
              );
            }
            if (tab === "opportunite") {
              return (
                <div className="space-y-2">
                  {oppGroups.map((g) => {
                    const isOpen = openThreads[g.key] ?? g.items.length === 1;
                    const head = g.items[0];
                    return (
                      <Card key={g.key} className="overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenThreads((prev) => ({ ...prev, [g.key]: !isOpen }))
                          }
                          className="w-full text-left p-3 flex items-start gap-2 hover:bg-muted/40 transition"
                        >
                          <div className="mt-0.5 text-muted-foreground">
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                {g.items.length} message{g.items.length > 1 ? "s" : ""}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">
                                Dernier : {format(parseISO(g.latest), "d MMM HH:mm", { locale: fr })}
                              </span>
                              {g.items.some((i) => i.has_attachments) && (
                                <Paperclip className="h-3 w-3 text-muted-foreground" />
                              )}
                              {g.items.some((i) => i.statut === "pending_review") && (
                                <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-300 text-amber-700">
                                  à trier
                                </Badge>
                              )}
                            </div>
                            <div className="font-medium text-sm truncate">
                              {normalizeSubject(g.subject) ? g.subject : "(sans sujet)"}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {head.from_name ? `${head.from_name} ` : ""}
                              <span className="opacity-70">&lt;{head.from_email}&gt;</span>
                            </div>
                          </div>
                        </button>
                        {isOpen && (
                          <div className="border-t bg-muted/20 p-2 space-y-2">
                            {g.items.map((it) => renderCard(it))}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              );
            }
            return <div className="space-y-2">{filtered.map((e) => renderCard(e))}</div>;
          })()}
        </TabsContent>
      </Tabs>


      {selected && (
        <EmailDetailDialog
          email={selected}
          onClose={() => setSelected(null)}
          onReclassify={(cat) => reclassify(selected, cat)}
          onValidate={() => validateClassification(selected)}
          onDismiss={() => {
            dismissEmail(selected, "manuel");
            setSelected(null);
          }}
          onCreateCandidat={() => {
            setCreateCandidat(selected);
            setSelected(null);
          }}
          onAttachOpportunite={() => {
            setAttachOpp(selected);
            setSelected(null);
          }}
          onDetachOpportunite={() => detachOpportunite(selected)}
        />
      )}

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

      {attachOpp && (
        <AttachOpportuniteDialog
          email={attachOpp}
          onClose={() => setAttachOpp(null)}
          onDone={async () => {
            setAttachOpp(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function EmailDetailDialog({
  email,
  onClose,
  onReclassify,
  onValidate,
  onDismiss,
  onCreateCandidat,
  onAttachOpportunite,
  onDetachOpportunite,
}: {
  email: EmailRow;
  onClose: () => void;
  onReclassify: (cat: CategorieIA) => void;
  onValidate: () => void;
  onDismiss: () => void;
  onCreateCandidat: () => void;
  onAttachOpportunite: () => void;
  onDetachOpportunite: () => void;
}) {
  const fetchBody = useServerFn(getOutlookFullBody);
  const [body, setBody] = useState<{
    contentType: "HTML" | "Text";
    content: string;
  } | null>(null);
  const [loadingBody, setLoadingBody] = useState(true);
  const [bodyError, setBodyError] = useState<string | null>(null);

  useEffect(() => {
    // Si on a déjà le corps en BDD (poll récent), on l'utilise direct.
    if (email.body_full) {
      const ct = (email.body_content_type ?? "").toString().toLowerCase() === "html" ? "HTML" : "Text";
      setBody({
        contentType: ct as "HTML" | "Text",
        content: email.body_full,
      });
      setLoadingBody(false);
      return;
    }
    // Sinon, fallback Graph (legacy : email archivé avant la migration body_full).
    let cancelled = false;
    setLoadingBody(true);
    setBodyError(null);
    fetchBody({ data: { messageIdOutlook: email.message_id_outlook } })
      .then((res) => {
        if (cancelled) return;
        setBody({ contentType: res.bodyContentType, content: res.bodyContent });
      })
      .catch((e: Error) => {
        if (cancelled) return;
        // Outlook change l'ID au move → ErrorItemNotFound pour les anciens emails archivés.
        const friendly = /ItemNotFound|404/.test(e.message)
          ? "Email archivé dans Outlook avant la mise à jour — corps complet indisponible (seul l'aperçu est conservé)."
          : e.message;
        setBodyError(friendly);
      })
      .finally(() => {
        if (!cancelled) setLoadingBody(false);
      });
    return () => {
      cancelled = true;
    };
  }, [email.message_id_outlook, email.body_full, email.body_content_type, fetchBody]);

  // Charge l'info client si l'email est rattaché à un client
  const [clientInfo, setClientInfo] = useState<{ id: string; nom: string } | null>(null);
  useEffect(() => {
    if (!email.client_id) {
      setClientInfo(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("clients")
      .select("id, nom")
      .eq("id", email.client_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setClientInfo(data);
      });
    return () => { cancelled = true; };
  }, [email.client_id]);


  const CAT_OPTIONS: Array<{ key: CategorieIA; label: string; icon: typeof Building2 }> = [
    { key: "candidature", label: "Candidature", icon: UserPlus },
    { key: "opportunite", label: "Opportunité", icon: Building2 },
    { key: "pub", label: "Pub", icon: Megaphone },
    { key: "autre", label: "Autre", icon: HelpCircle },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle className="text-base pr-6 leading-snug">
            {email.subject ?? "(sans sujet)"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-xs space-y-0.5 mt-1">
              <div>
                <span className="font-medium text-foreground">
                  {email.from_name ?? email.from_email}
                </span>{" "}
                <span className="opacity-70">&lt;{email.from_email}&gt;</span>
              </div>
              <div>
                {format(parseISO(email.received_at), "EEEE d MMMM yyyy 'à' HH:mm", {
                  locale: fr,
                })}
              </div>
              {clientInfo && (
                <div className="flex items-center gap-1.5 pt-1">
                  <Building2 className="h-3 w-3 text-primary" />
                  <span className="text-foreground font-medium">Client :</span>
                  <Link
                    to="/clients/$clientId"
                    params={{ clientId: clientInfo.id }}
                    className="text-primary hover:underline"
                  >
                    {clientInfo.nom}
                  </Link>
                </div>
              )}
            </div>
          </DialogDescription>

        </DialogHeader>

        {/* Reclassement rapide */}
        <div className="px-4 py-2 border-b bg-muted/30">
          <div className="text-[11px] text-muted-foreground mb-1.5">
            Classement IA — corriger si besoin :
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CAT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = email.categorie_ia === opt.key;
              return (
                <Button
                  key={opt.key}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className="h-7 px-2 text-xs"
                  onClick={() => onReclassify(opt.key)}
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {opt.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Corps */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-3">
            {loadingBody ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement du contenu…
              </div>
            ) : bodyError ? (
              <div className="text-sm text-destructive py-4">
                Impossible de charger le corps : {bodyError}
                {email.body_preview && (
                  <div className="mt-3 text-muted-foreground whitespace-pre-wrap">
                    <div className="text-xs uppercase tracking-wide mb-1">Aperçu :</div>
                    {email.body_preview}
                  </div>
                )}
              </div>
            ) : body?.contentType === "HTML" ? (
              <div
                className="prose prose-sm max-w-none break-words [&_a]:text-primary [&_img]:max-w-full [&_table]:max-w-full"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: body.content }}
              />
            ) : (
              <pre className="whitespace-pre-wrap text-sm font-sans break-words">
                {body?.content ?? ""}
              </pre>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-4 py-3 border-t flex-row flex-wrap gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            <X className="h-4 w-4 mr-1" /> Écarter
          </Button>
          <div className="flex gap-2 flex-wrap">
            {email.categorie_ia === "candidature" && email.statut === "pending_review" && (
              <Button size="sm" variant="outline" onClick={onCreateCandidat}>
                <UserPlus className="h-4 w-4 mr-1" /> Créer candidat
              </Button>
            )}
            {email.categorie_ia === "opportunite" && !email.opportunite_id && (
              <Button size="sm" variant="outline" onClick={onAttachOpportunite}>
                <Building2 className="h-4 w-4 mr-1" /> Rattacher / créer opportunité
              </Button>
            )}
            {email.opportunite_id && (
              <>
                <Button size="sm" variant="outline" onClick={onAttachOpportunite}>
                  <Building2 className="h-4 w-4 mr-1" /> Changer d'opportunité
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={onDetachOpportunite}
                >
                  <Unlink className="h-4 w-4 mr-1" /> Détacher
                </Button>
              </>
            )}
            {email.statut === "pending_review" && (
              <Button size="sm" onClick={onValidate}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Valider classement
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
            <Input
              value={poste}
              onChange={(e) => setPoste(e.target.value)}
              placeholder="ex: Constructeur, Tapissier…"
            />
          </div>
          <div>
            <Label>Métier</Label>
            <Select value={metier} onValueChange={setMetier}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {METIERS_CANDIDATURE.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface OppRow {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  date_opportunite: string | null;
  statut_opportunite: string | null;
}

function AttachOpportuniteDialog({
  email,
  onClose,
  onDone,
}: {
  email: EmailRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const { data: charges } = useChargesAffaires();
  const [opps, setOpps] = useState<OppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [attaching, setAttaching] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdSince, setCreatedSince] = useState<string | null>(null);

  async function loadOpps() {
    setLoading(true);
    const { data, error } = await supabase
      .from("affaires")
      .select("id, numero, nom, client, date_opportunite, statut_opportunite")
      .like("numero", "9%")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("Erreur chargement opportunités", { description: error.message });
    } else {
      setOpps((data ?? []) as OppRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadOpps();
  }, []);

  const emailDomain = useMemo(() => {
    const m = email.from_email?.match(/@([^>\s]+)/);
    return m ? m[1].toLowerCase() : null;
  }, [email.from_email]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return opps;
    return opps.filter(
      (o) =>
        o.numero.toLowerCase().includes(s) ||
        (o.nom ?? "").toLowerCase().includes(s) ||
        (o.client ?? "").toLowerCase().includes(s),
    );
  }, [opps, q]);

  // Suggestions : opportunités dont le client matche le nom de l'expéditeur ou le domaine email
  const suggestedIds = useMemo(() => {
    const senderTokens = (email.from_name ?? "")
      .toLowerCase()
      .split(/[\s,.\-_]+/)
      .filter((t) => t.length >= 3);
    const domainRoot = emailDomain?.split(".")[0] ?? null;
    const ids = new Set<string>();
    for (const o of opps) {
      const client = (o.client ?? "").toLowerCase();
      if (!client) continue;
      if (domainRoot && domainRoot.length >= 3 && client.includes(domainRoot)) ids.add(o.id);
      else if (senderTokens.some((t) => client.includes(t))) ids.add(o.id);
    }
    return ids;
  }, [opps, email.from_name, emailDomain]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const sa = suggestedIds.has(a.id) ? 0 : 1;
      const sb = suggestedIds.has(b.id) ? 0 : 1;
      return sa - sb;
    });
  }, [filtered, suggestedIds]);

  async function attach(oppId: string) {
    setAttaching(oppId);
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase
      .from("emails_entrants")
      .update({
        statut: "validated",
        opportunite_id: oppId,
        categorie_ia: "opportunite",
        validated_at: new Date().toISOString(),
        validated_by: userId ?? null,
      })
      .eq("id", email.id);
    setAttaching(null);
    if (error) {
      toast.error("Erreur", { description: error.message });
      return;
    }
    toast.success("Email rattaché à l'opportunité");
    onDone();
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-3 border-b">
            <DialogTitle>Rattacher à une opportunité 9XXX</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-1">
                <div className="rounded-md border bg-primary/5 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Expéditeur
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="font-semibold text-foreground">
                      {email.from_name ?? email.from_email}
                    </span>
                    <span className="font-mono text-sm text-primary select-all">
                      &lt;{email.from_email}&gt;
                    </span>
                    {emailDomain && (
                      <Badge variant="secondary" className="text-[10px] h-5">
                        @{emailDomain}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 italic truncate">
                    {email.subject ?? "(sans sujet)"}
                  </div>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>


          <div className="px-4 py-3 border-b flex flex-wrap gap-2 items-center">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher (n° 9XXX, client, nom…)"
              className="flex-1 min-w-[200px]"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCreatedSince(new Date().toISOString());
                setCreateOpen(true);
              }}
            >
              <Building2 className="h-4 w-4 mr-1" /> Créer une nouvelle 9XXX
            </Button>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 space-y-1.5">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Aucune opportunité trouvée. Créez-en une nouvelle.
                </div>
              ) : (
                sorted.map((o) => {
                  const isSuggested = suggestedIds.has(o.id);
                  return (
                  <Card
                    key={o.id}
                    className={`p-2.5 hover:bg-accent/40 cursor-pointer flex items-center gap-2 ${isSuggested ? "border-primary/60 bg-primary/5" : ""}`}
                    onClick={() => attach(o.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold">{o.numero}</span>
                        {isSuggested && (
                          <Badge className="text-[10px] h-4 px-1 bg-primary/15 text-primary border-primary/30">
                            Suggestion
                          </Badge>
                        )}
                        {o.statut_opportunite && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                            {o.statut_opportunite}
                          </Badge>
                        )}
                        {o.date_opportunite && (
                          <span className="text-[11px] text-muted-foreground">
                            {format(parseISO(o.date_opportunite), "d MMM yyyy", { locale: fr })}
                          </span>
                        )}
                      </div>
                      <div className="text-sm truncate">
                        {o.client ? <strong>{o.client}</strong> : null}
                        {o.client && o.nom ? " — " : ""}
                        {o.nom}
                      </div>
                    </div>
                    {attaching === o.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Button size="sm" variant="ghost">
                        Rattacher
                      </Button>
                    )}
                  </Card>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="px-4 py-3 border-t">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NouvelleOpportuniteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultChargeId={user?.id ?? null}
        charges={charges ?? []}
        onCreated={async () => {
          await loadOpps();
          // Auto-rattachement de la dernière opp créée depuis l'ouverture du formulaire.
          if (createdSince) {
            const { data } = await supabase
              .from("affaires")
              .select("id")
              .like("numero", "9%")
              .gte("created_at", createdSince)
              .order("created_at", { ascending: false })
              .limit(1);
            const newId = data?.[0]?.id;
            if (newId) {
              await attach(newId);
            }
          }
        }}
      />
    </>
  );
}
