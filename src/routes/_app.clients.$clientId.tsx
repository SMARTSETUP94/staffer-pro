import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Pencil,
  ArrowLeft,
  Plus,
  Trash2,
  Mail,
  Briefcase,
  Users,
  FileText,
  MapPin,
  Phone,
  Globe,
  Link2,
  Search,
  Unlink,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { enrichClientFiche } from "@/lib/server-fns/client-enrichment.functions";
import type { ClientContactSuggestion } from "@/lib/client-enrichment";
import { ClientLegalPrefillDialog } from "@/components/clients/ClientLegalPrefillDialog";
import { sirenFromIdentifier } from "@/lib/client-legal-prefill";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/clients/$clientId")({
  beforeLoad: () => requireCapability("clients.view"),
  head: () => ({ meta: [
    { title: "Fiche client — Setup Paris" },
    { name: "description", content: "Coordonnées juridiques, contacts et chantiers du client Setup Paris." },
    { property: "og:title", content: "Fiche client — Setup Paris" },
    { property: "og:description", content: "Coordonnées juridiques, contacts et chantiers du client Setup Paris." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ClientDetailPage,
});

interface ClientFull {
  id: string;
  nom: string;
  domaines_email: string[];
  secteur: string | null;
  siret: string | null;
  dirigeant: string | null;
  notes: string | null;
  actif: boolean;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  site_web: string | null;
}

interface AffaireRow {
  id: string;
  numero: string;
  nom: string;
  statut: string;
  date_debut: string | null;
  date_fin_prevue: string | null;
}

interface ContactRow {
  id: string;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  fonction: string | null;
  actif: boolean;
  notes: string | null;
}

function extractLinkedIn(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/https?:\/\/[^\s)]*linkedin[^\s)]*/i);
  return m ? m[0] : null;
}

interface EmailRow {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  received_at: string;
  categorie_ia: string | null;
  statut: string;
}

function ClientDetailPage() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState<ClientFull | null>(null);
  const [affaires, setAffaires] = useState<AffaireRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [contactEdit, setContactEdit] = useState<Partial<ContactRow> | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);

  async function detachAffaire(affaireId: string, label: string) {
    if (!confirm(`Détacher le chantier ${label} de ce client ?`)) return;
    const { error } = await supabase
      .from("affaires")
      .update({ client_id: null })
      .eq("id", affaireId);
    if (error) {
      toast.error("Erreur", { description: error.message });
      return;
    }
    toast.success("Chantier détaché");
    void load();
  }

  async function load() {
    setLoading(true);
    const [c, a, ct, em] = await Promise.all([
      supabase
        .from("clients")
        .select("id, nom, domaines_email, secteur, siret, dirigeant, notes, actif, adresse, telephone, email, site_web")
        .eq("id", clientId)
        .maybeSingle(),
      supabase
        .from("affaires")
        .select("id, numero, nom, statut, date_debut, date_fin_prevue")
        .eq("client_id", clientId)
        .order("numero", { ascending: false }),
      supabase
        .from("client_contacts")
        .select("id, nom, prenom, email, telephone, fonction, actif, notes")
        .eq("client_id", clientId)
        .order("nom"),
      supabase
        .from("emails_entrants")
        .select("id, from_email, from_name, subject, received_at, categorie_ia, statut")
        .eq("client_id", clientId)
        .order("received_at", { ascending: false })
        .limit(100),
    ]);
    if (c.error) toast.error("Erreur client", { description: c.error.message });
    setClient((c.data as ClientFull | null) ?? null);
    setAffaires((a.data as AffaireRow[] | null) ?? []);
    setContacts((ct.data as ContactRow[] | null) ?? []);
    setEmails((em.data as EmailRow[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [clientId]);

  if (loading) {
    return (
      <div className="container mx-auto p-4 max-w-7xl">
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }
  if (!client) {
    return (
      <div className="container mx-auto p-4 max-w-7xl">
        <Card className="p-8 text-center text-muted-foreground">
          Client introuvable.
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate({ to: "/clients" })}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Retour aux clients
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const opportunites = affaires.filter((a) => a.numero?.startsWith("9"));
  const chantiers = affaires.filter((a) => !a.numero?.startsWith("9"));
  const chantiersEnCours = chantiers.filter(
    (a) => a.statut === "en_cours" || a.statut === "prospect",
  );
  const chantiersPasses = chantiers.filter(
    (a) => a.statut !== "en_cours" && a.statut !== "prospect",
  );

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-3">
      <PageHeader
        title={client.nom}
        description={[
          client.secteur,
          client.siret ? `SIRET ${client.siret}` : null,
          !client.actif ? "Inactif" : null,
        ].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/clients" })}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Liste
            </Button>
            <Button size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Éditer la fiche
            </Button>
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-3 items-start">
        {/* Colonne 1 : Informations juridiques */}
        <Card className="p-4 space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Informations juridiques
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={() => setLegalOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1" /> Pré-remplir avec l’IA
          </Button>
          {client.domaines_email.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {client.domaines_email.map((d) => (
                <Badge key={d} variant="secondary" className="text-[11px]">
                  @{d}
                </Badge>
              ))}
            </div>
          )}
          <div className="space-y-1.5 text-sm">
            <div className="flex items-start gap-2">
              <Users className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span>Dirigeant : {client.dirigeant || <span className="text-muted-foreground">—</span>}</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>
                SIREN :{" "}
                {sirenFromIdentifier(client.siret) ?? <span className="text-muted-foreground">—</span>}
                {client.siret?.length === 14 && <span className="block text-xs text-muted-foreground">SIRET : {client.siret}</span>}
              </span>
            </div>
            {client.adresse && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap">{client.adresse}</span>
              </div>
            )}
            {client.telephone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`tel:${client.telephone}`} className="hover:underline">
                  {client.telephone}
                </a>
              </div>
            )}
            {client.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${client.email}`} className="hover:underline">
                  {client.email}
                </a>
              </div>
            )}
            {client.site_web && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                <a
                  href={
                    client.site_web.startsWith("http")
                      ? client.site_web
                      : `https://${client.site_web}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {client.site_web}
                </a>
              </div>
            )}
          </div>
          {client.notes && (
            <div className="pt-2 border-t text-xs text-muted-foreground whitespace-pre-wrap">
              {client.notes}
            </div>
          )}
        </Card>

        {/* Colonne 2 : Contacts */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> Contacts ({contacts.length})
            </div>
            <Button size="sm" variant="outline" onClick={() => setContactEdit({})}>
              <Plus className="h-4 w-4 mr-1" /> Ajouter
            </Button>
          </div>
          {contacts.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              Aucun contact. Les emails entrants en créent automatiquement.
            </div>
          ) : (
            <ul className="divide-y">
              {contacts.map((c) => {
                const linkedin = extractLinkedIn(c.notes);
                return (
                  <li key={c.id} className="py-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <div className="font-medium truncate">
                        {[c.prenom, c.nom].filter(Boolean).join(" ") || "—"}
                        {c.fonction && (
                          <span className="ml-1 text-xs text-muted-foreground font-normal">
                            {c.fonction}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {c.email ? (
                          <a className="hover:underline" href={`mailto:${c.email}`}>
                            {c.email}
                          </a>
                        ) : (
                          "—"
                        )}
                        {c.telephone && <span> · {c.telephone}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {linkedin && (
                        <a
                          href={linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          LinkedIn
                        </a>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setContactEdit(c)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Colonne 3 : Chantiers & opportunités */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5" /> Chantiers & opportunités
            </div>
            <Button size="sm" variant="outline" onClick={() => setAttachOpen(true)}>
              <Link2 className="h-4 w-4 mr-1" /> Rattacher
            </Button>
          </div>
          <AffairesCompactList
            title={`En cours (${chantiersEnCours.length})`}
            rows={chantiersEnCours}
            emptyLabel="Aucun chantier en cours"
            onDetach={(a) => detachAffaire(a.id, a.numero)}
          />
          <AffairesCompactList
            title={`Passés (${chantiersPasses.length})`}
            rows={chantiersPasses}
            emptyLabel="Aucun chantier passé"
            onDetach={(a) => detachAffaire(a.id, a.numero)}
          />
          <AffairesCompactList
            title={`Opportunités (${opportunites.length})`}
            rows={opportunites}
            emptyLabel="Aucune opportunité"
            onDetach={(a) => detachAffaire(a.id, a.numero)}
          />
        </Card>
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold flex items-center gap-1 select-none">
          <Mail className="h-4 w-4" /> Emails ({emails.length})
          <span className="text-xs text-muted-foreground font-normal group-open:hidden">
            — cliquer pour afficher
          </span>
        </summary>
        <Card className="mt-2">
          {emails.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Aucun email rattaché.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reçu le</TableHead>
                  <TableHead>De</TableHead>
                  <TableHead>Sujet</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(parseISO(e.received_at), "d MMM yyyy HH:mm", {
                        locale: fr,
                      })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.from_name ?? e.from_email}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link
                        to="/inbox-smart"
                        className="hover:underline"
                        title={e.subject ?? ""}
                      >
                        {e.subject ?? "(sans sujet)"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {e.categorie_ia && (
                        <Badge variant="outline" className="text-[10px]">
                          {e.categorie_ia}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={e.statut === "validated" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {e.statut}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </details>

      {legalOpen && <ClientLegalPrefillDialog client={client} onClose={() => setLegalOpen(false)} onDone={() => { setLegalOpen(false); void load(); }} />}

      {editOpen && (
        <EditClientDialog
          client={client}
          onClose={() => setEditOpen(false)}
          onDone={async () => {
            setEditOpen(false);
            await load();
          }}
        />
      )}

      {contactEdit && (
        <EditContactDialog
          clientId={clientId}
          contact={contactEdit}
          onClose={() => setContactEdit(null)}
          onDone={async () => {
            setContactEdit(null);
            await load();
          }}
        />
      )}

      {attachOpen && (
        <AttachAffairesDialog
          clientId={clientId}
          clientNom={client.nom}
          domaines={client.domaines_email}
          existingIds={new Set(affaires.map((a) => a.id))}
          onClose={() => setAttachOpen(false)}
          onDone={async () => {
            setAttachOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AffairesCompactList({
  title,
  rows,
  emptyLabel,
  onDetach,
}: {
  title: string;
  rows: AffaireRow[];
  emptyLabel: string;
  onDetach: (a: AffaireRow) => void;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground mb-1">{title}</div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-1">{emptyLabel}</div>
      ) : (
        <ul className="divide-y">
          {rows.map((a) => (
            <li key={a.id} className="py-1.5 flex items-center justify-between gap-2">
              <div className="min-w-0 text-sm">
                <Link
                  to="/affaires/$affaireId"
                  params={{ affaireId: a.id }}
                  className="hover:underline font-medium"
                >
                  {a.numero}
                </Link>
                <span className="ml-1.5 text-xs text-muted-foreground truncate">
                  {a.nom}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {a.date_debut && (
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {format(parseISO(a.date_debut), "d MMM yy", { locale: fr })}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  title="Détacher de ce client"
                  onClick={() => onDetach(a)}
                >
                  <Unlink className="h-3 w-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EditClientDialog({
  client,
  onClose,
  onDone,
}: {
  client: ClientFull;
  onClose: () => void;
  onDone: () => void;
}) {
  const [nom, setNom] = useState(client.nom);
  const [domaines, setDomaines] = useState(client.domaines_email.join(", "));
  const [secteur, setSecteur] = useState(client.secteur ?? "");
  const [siret, setSiret] = useState(client.siret ?? "");
  const [dirigeant, setDirigeant] = useState(client.dirigeant ?? "");
  const [adresse, setAdresse] = useState(client.adresse ?? "");
  const [telephone, setTelephone] = useState(client.telephone ?? "");
  const [email, setEmail] = useState(client.email ?? "");
  const [siteWeb, setSiteWeb] = useState(client.site_web ?? "");
  const [notes, setNotes] = useState(client.notes ?? "");
  const [actif, setActif] = useState(client.actif);
  const [saving, setSaving] = useState(false);
  const enrich = useServerFn(enrichClientFiche);
  const [enriching, setEnriching] = useState(false);
  const [suggestedContacts, setSuggestedContacts] = useState<ClientContactSuggestion[]>([]);
  const [addedContacts, setAddedContacts] = useState<Set<number>>(new Set());

  async function prefillIA() {
    if (nom.trim().length < 2) {
      toast.error("Renseigne d'abord le nom de la société");
      return;
    }
    setEnriching(true);
    try {
      const firstDomain = domaines.split(/[,\s;]+/).map((d) => d.trim()).filter(Boolean)[0];
      const { suggestion, error } = await enrich({
        data: { nom: nom.trim(), domaine: firstDomain || undefined, email: email.trim() || undefined, siren: sirenFromIdentifier(siret) ?? undefined },
      });
      if (error || !suggestion) {
        toast.error("Recherche IA impossible", { description: error ?? undefined });
        return;
      }
      const filled: string[] = [];
      const setIfEmpty = (label: string, current: string, value: string | null, setter: (v: string) => void) => {
        if (!current.trim() && value?.trim()) {
          setter(value.trim());
          filled.push(label);
        }
      };
      setIfEmpty("secteur", secteur, suggestion.secteur, setSecteur);
      setIfEmpty("SIRET", siret, suggestion.siret, setSiret);
      setIfEmpty("dirigeant", dirigeant, suggestion.dirigeant, setDirigeant);
      setIfEmpty("adresse", adresse, suggestion.adresse, setAdresse);
      setIfEmpty("téléphone", telephone, suggestion.telephone, setTelephone);
      setIfEmpty("email", email, suggestion.email, setEmail);
      setIfEmpty("site web", siteWeb, suggestion.site_web, setSiteWeb);
      if (!domaines.trim() && suggestion.domaines_email?.length) {
        setDomaines(suggestion.domaines_email.join(", "));
        filled.push("domaines email");
      }
      const extras: string[] = [];
      if (suggestion.linkedin) extras.push(`LinkedIn : ${suggestion.linkedin}`);
      if (suggestion.description) extras.push(suggestion.description);
      if (extras.length && !notes.includes(extras[0])) {
        setNotes((n) => (n.trim() ? `${n.trim()}\n\n${extras.join("\n")}` : extras.join("\n")));
      }
      setSuggestedContacts(suggestion.contacts ?? []);
      setAddedContacts(new Set());
      if (filled.length === 0 && !(suggestion.contacts?.length)) {
        toast.info("Aucune information nouvelle trouvée", {
          description: "Les champs déjà remplis n'ont pas été écrasés.",
        });
      } else {
        toast.success(`Fiche pré-remplie : ${filled.join(", ") || "contacts suggérés"}`, {
          description: "Vérifie les informations avant d'enregistrer.",
        });
      }
    } catch (e) {
      toast.error("Recherche IA impossible", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setEnriching(false);
    }
  }

  async function addSuggestedContact(c: ClientContactSuggestion, idx: number) {
    const { error } = await supabase.from("client_contacts").insert({
      client_id: client.id,
      nom: c.nom?.trim() || null,
      prenom: c.prenom?.trim() || null,
      email: c.email?.trim() || null,
      telephone: c.telephone?.trim() || null,
      fonction: c.fonction?.trim() || null,
      notes: c.linkedin?.trim() ? `LinkedIn : ${c.linkedin.trim()}` : null,
    });
    if (error) {
      toast.error("Erreur", { description: error.message });
      return;
    }
    setAddedContacts((prev) => new Set(prev).add(idx));
    toast.success("Contact ajouté", { description: [c.prenom, c.nom].filter(Boolean).join(" ") || c.fonction || "" });
  }

  async function submit() {
    const domList = domaines
      .split(/[,\s;]+/)
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
    setSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({
        nom: nom.trim(),
        domaines_email: domList,
        secteur: secteur.trim() || null,
        siret: siret.trim() || null,
        dirigeant: dirigeant.trim() || null,
        adresse: adresse.trim() || null,
        telephone: telephone.trim() || null,
        email: email.trim() || null,
        site_web: siteWeb.trim() || null,
        notes: notes.trim() || null,
        actif,
      })
      .eq("id", client.id);
    setSaving(false);
    if (error) {
      toast.error("Erreur", { description: error.message });
      return;
    }
    toast.success("Client mis à jour");
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Éditer client</DialogTitle>
        </DialogHeader>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={prefillIA}
          disabled={enriching}
          className="w-full"
        >
          {enriching ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {enriching ? "Recherche sur internet…" : "Pré-remplir avec l'IA (web + LinkedIn)"}
        </Button>
        {suggestedContacts.length > 0 && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Contacts suggérés par l'IA
            </div>
            {suggestedContacts.map((c, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">
                    {[c.prenom, c.nom].filter(Boolean).join(" ") || "Contact"}
                  </span>
                  {c.fonction && <span className="text-muted-foreground"> — {c.fonction}</span>}
                  {c.linkedin && (
                    <a
                      href={c.linkedin}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-xs text-primary underline truncate"
                    >
                      {c.linkedin}
                    </a>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={addedContacts.has(idx)}
                  onClick={() => addSuggestedContact(c, idx)}
                >
                  {addedContacts.has(idx) ? "Ajouté" : "Ajouter"}
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <Label>Nom *</Label>
            <Input value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div>
            <Label>Domaines email</Label>
            <Input
              value={domaines}
              onChange={(e) => setDomaines(e.target.value)}
              placeholder="edf.fr, edf.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Secteur</Label>
              <Input value={secteur} onChange={(e) => setSecteur(e.target.value)} />
            </div>
            <div>
              <Label>SIRET</Label>
              <Input value={siret} onChange={(e) => setSiret(e.target.value)} />
            </div>
          </div>
          <div><Label htmlFor="edit-dirigeant">Dirigeant</Label><Input id="edit-dirigeant" value={dirigeant} onChange={(e) => setDirigeant(e.target.value)} /></div>

          <div className="pt-2 border-t">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Coordonnées société
            </div>
            <div className="space-y-3">
              <div>
                <Label>Adresse</Label>
                <Textarea
                  rows={2}
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                  placeholder="Rue, code postal, ville"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Téléphone</Label>
                  <Input
                    value={telephone}
                    onChange={(e) => setTelephone(e.target.value)}
                    placeholder="+33 1 23 45 67 89"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contact@société.fr"
                  />
                </div>
              </div>
              <div>
                <Label>Site web</Label>
                <Input
                  value={siteWeb}
                  onChange={(e) => setSiteWeb(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={actif}
              onChange={(e) => setActif(e.target.checked)}
            />
            Client actif
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditContactDialog({
  clientId,
  contact,
  onClose,
  onDone,
}: {
  clientId: string;
  contact: Partial<ContactRow>;
  onClose: () => void;
  onDone: () => void;
}) {
  const isNew = !contact.id;
  const [nom, setNom] = useState(contact.nom ?? "");
  const [prenom, setPrenom] = useState(contact.prenom ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [telephone, setTelephone] = useState(contact.telephone ?? "");
  const [fonction, setFonction] = useState(contact.fonction ?? "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const payload = {
      client_id: clientId,
      nom: nom.trim() || null,
      prenom: prenom.trim() || null,
      email: email.trim() || null,
      telephone: telephone.trim() || null,
      fonction: fonction.trim() || null,
    };
    const { error } = contact.id
      ? await supabase.from("client_contacts").update(payload).eq("id", contact.id)
      : await supabase.from("client_contacts").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Erreur", { description: error.message });
      return;
    }
    toast.success(isNew ? "Contact ajouté" : "Contact mis à jour");
    onDone();
  }

  async function remove() {
    if (!contact.id) return;
    if (!confirm("Supprimer ce contact ?")) return;
    const { error } = await supabase
      .from("client_contacts")
      .delete()
      .eq("id", contact.id);
    if (error) {
      toast.error("Erreur", { description: error.message });
      return;
    }
    toast.success("Contact supprimé");
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Nouveau contact" : "Éditer contact"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Prénom</Label>
              <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} />
            </div>
            <div>
              <Label>Nom</Label>
              <Input value={nom} onChange={(e) => setNom(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Téléphone</Label>
              <Input
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
              />
            </div>
            <div>
              <Label>Fonction</Label>
              <Input value={fonction} onChange={(e) => setFonction(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {!isNew ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={remove}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Supprimer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isNew ? "Ajouter" : "Enregistrer"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CandidateAffaire {
  id: string;
  numero: string;
  nom: string;
  client: string | null;
  statut: string;
  client_id: string | null;
}

function AttachAffairesDialog({
  clientId,
  clientNom,
  domaines,
  existingIds,
  onClose,
  onDone,
}: {
  clientId: string;
  clientNom: string;
  domaines: string[];
  existingIds: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [candidates, setCandidates] = useState<CandidateAffaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("affaires")
        .select("id, numero, nom, client, statut, client_id")
        .is("archived_at", null)
        .order("numero", { ascending: false })
        .limit(2000);
      if (error) {
        toast.error("Erreur", { description: error.message });
        setLoading(false);
        return;
      }
      setCandidates(
        ((data ?? []) as CandidateAffaire[]).filter(
          (a) => a.client_id !== clientId,
        ),
      );
      setLoading(false);
    }
    void load();
  }, [clientId]);

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const clientTokens = norm(clientNom)
    .split(/[\s,;\-]+/)
    .filter((t) => t.length >= 3);

  const filtered = useMemo(() => {
    const q = norm(search.trim());
    return candidates.filter((a) => {
      if (!showAll && a.client_id) return false;
      // Heuristique : suggéré si le nom du client matche le champ texte "client",
      // ou si un des domaines correspond.
      const txt = norm(a.client ?? "");
      const matchesClient =
        clientTokens.length > 0 && clientTokens.some((t) => txt.includes(t));
      if (!q && !showAll && !matchesClient) return false;
      if (!q) return true;
      return (
        a.numero.toLowerCase().includes(q) ||
        norm(a.nom).includes(q) ||
        norm(a.client ?? "").includes(q)
      );
    });
  }, [candidates, search, showAll, clientTokens]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0) return;
    setSaving(true);
    const { error } = await supabase
      .from("affaires")
      .update({ client_id: clientId })
      .in("id", Array.from(selected));
    setSaving(false);
    if (error) {
      toast.error("Erreur", { description: error.message });
      return;
    }
    toast.success(`${selected.size} chantier(s) rattaché(s)`);
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Rattacher des chantiers à « {clientNom} »</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3 py-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Recherche numéro, nom, client…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            Inclure chantiers déjà rattachés à un autre client
          </label>
        </div>
        <div className="flex-1 overflow-y-auto border rounded">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {search
                ? "Aucun résultat."
                : "Aucune suggestion. Tapez quelques lettres pour rechercher."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Numéro</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Client actuel</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map((a: CandidateAffaire) => (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer"
                    onClick={() => toggle(a.id)}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggle(a.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {a.numero}
                    </TableCell>
                    <TableCell className="text-sm">{a.nom}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.client_id ? (
                        <Badge variant="outline" className="text-[10px]">
                          {a.client ?? "—"} (déjà rattaché)
                        </Badge>
                      ) : (
                        a.client ?? "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {a.statut}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <DialogFooter>
          <div className="flex items-center gap-3 mr-auto text-sm text-muted-foreground">
            {selected.size} sélectionné(s)
            {filtered.length > 200 && ` · 200 premiers affichés sur ${filtered.length}`}
          </div>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving || selected.size === 0}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Rattacher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
