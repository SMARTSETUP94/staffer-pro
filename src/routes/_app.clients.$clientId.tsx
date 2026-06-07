import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { useEffect, useState } from "react";
import {
  Loader2,
  Pencil,
  ArrowLeft,
  Plus,
  Trash2,
  Mail,
  Briefcase,
  Trophy,
  Users,
  FileText,
  MapPin,
  Phone,
  Globe,
  Link2,
  Search,
  Unlink,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  head: () => ({ meta: [{ title: "Fiche client — Setup Paris" }] }),
  component: ClientDetailPage,
});

interface ClientFull {
  id: string;
  nom: string;
  domaines_email: string[];
  secteur: string | null;
  siret: string | null;
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
  const [contactEdit, setContactEdit] = useState<Partial<ContactRow> | null>(null);

  async function load() {
    setLoading(true);
    const [c, a, ct, em] = await Promise.all([
      supabase
        .from("clients")
        .select("id, nom, domaines_email, secteur, siret, notes, actif")
        .eq("id", clientId)
        .maybeSingle(),
      supabase
        .from("affaires")
        .select("id, numero, nom, statut, date_debut, date_fin_prevue")
        .eq("client_id", clientId)
        .order("numero", { ascending: false }),
      supabase
        .from("client_contacts")
        .select("id, nom, prenom, email, telephone, fonction, actif")
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

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-4">
      <PageHeader
        title={client.nom}
        description={[
          client.secteur,
          client.siret ? `SIRET ${client.siret}` : null,
          !client.actif ? "Inactif" : null,
        ].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate({ to: "/clients" })}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Liste
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Éditer
            </Button>
          </>
        }
      />

      {client.domaines_email.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Domaines :</span>
          {client.domaines_email.map((d) => (
            <Badge key={d} variant="secondary" className="text-[11px]">
              @{d}
            </Badge>
          ))}
        </div>
      )}


      <Tabs defaultValue="affaires">
        <TabsList>
          <TabsTrigger value="affaires">
            <Briefcase className="h-3 w-3 mr-1" />
            Chantiers ({chantiers.length})
          </TabsTrigger>
          <TabsTrigger value="opportunites">
            <Trophy className="h-3 w-3 mr-1" />
            Opportunités ({opportunites.length})
          </TabsTrigger>
          <TabsTrigger value="contacts">
            <Users className="h-3 w-3 mr-1" />
            Contacts ({contacts.length})
          </TabsTrigger>
          <TabsTrigger value="emails">
            <Mail className="h-3 w-3 mr-1" />
            Emails ({emails.length})
          </TabsTrigger>
          <TabsTrigger value="notes">
            <FileText className="h-3 w-3 mr-1" />
            Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="affaires">
          <AffairesTable rows={chantiers} emptyLabel="Aucun chantier" />
        </TabsContent>

        <TabsContent value="opportunites">
          <AffairesTable rows={opportunites} emptyLabel="Aucune opportunité" />
        </TabsContent>

        <TabsContent value="contacts">
          <Card>
            <div className="p-3 border-b flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {contacts.length} contact{contacts.length > 1 ? "s" : ""}
              </div>
              <Button size="sm" onClick={() => setContactEdit({})}>
                <Plus className="h-4 w-4 mr-1" /> Ajouter
              </Button>
            </div>
            {contacts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Aucun contact. Les emails entrants en créent automatiquement.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Fonction</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        {[c.prenom, c.nom].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.email ? (
                          <a className="hover:underline" href={`mailto:${c.email}`}>
                            {c.email}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{c.telephone ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.fonction ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setContactEdit(c)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="emails">
          <Card>
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
        </TabsContent>

        <TabsContent value="notes">
          <Card className="p-4">
            <div className="text-sm whitespace-pre-wrap">
              {client.notes ?? (
                <span className="text-muted-foreground">
                  Aucune note. Cliquez sur Éditer pour ajouter.
                </span>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

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
    </div>
  );
}

function AffairesTable({
  rows,
  emptyLabel,
}: {
  rows: AffaireRow[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <Card className="py-8 text-center text-muted-foreground text-sm">
        {emptyLabel}
      </Card>
    );
  }
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Numéro</TableHead>
            <TableHead>Nom</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Début</TableHead>
            <TableHead>Fin prévue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-mono text-sm">
                <Link
                  to="/affaires/$affaireId"
                  params={{ affaireId: a.id }}
                  className="hover:underline"
                >
                  {a.numero}
                </Link>
              </TableCell>
              <TableCell>{a.nom}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px]">
                  {a.statut}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {a.date_debut
                  ? format(parseISO(a.date_debut), "d MMM yyyy", { locale: fr })
                  : "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {a.date_fin_prevue
                  ? format(parseISO(a.date_fin_prevue), "d MMM yyyy", { locale: fr })
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
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
  const [notes, setNotes] = useState(client.notes ?? "");
  const [actif, setActif] = useState(client.actif);
  const [saving, setSaving] = useState(false);

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Éditer client</DialogTitle>
        </DialogHeader>
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
