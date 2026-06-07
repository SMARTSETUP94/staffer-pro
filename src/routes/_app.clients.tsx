import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Search,
  Mail,
  Briefcase,
  Trophy,
  Users,
  Upload,
  Pencil,
  Trash2,
  GitMerge,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/use-capability";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NouveauClientDialog } from "@/components/clients/NouveauClientDialog";
import { ImportClientsDialog } from "@/components/clients/ImportClientsDialog";

export const Route = createFileRoute("/_app/clients")({
  beforeLoad: () => requireCapability("clients.view"),
  head: () => ({ meta: [{ title: "Clients — Setup Paris" }] }),
  component: ClientsListPage,
});

interface ClientRow {
  id: string;
  nom: string;
  domaines_email: string[];
  secteur: string | null;
  actif: boolean;
  nb_affaires: number;
  nb_opportunites: number;
  nb_contacts: number;
  dernier_email_at: string | null;
}

function ClientsListPage() {
  const navigate = useNavigate();
  const canManage = useCapability("clients.manage");
  const canMerge = useCapability("clients.merge");
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactifs, setShowInactifs] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ClientRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", confirmDelete.id);
    setDeleting(false);
    if (error) {
      toast.error("Suppression impossible", { description: error.message });
      return;
    }
    toast.success(`« ${confirmDelete.nom} » supprimé`);
    setConfirmDelete(null);
    void load();
  }


  async function load() {
    setLoading(true);
    const { data: clients, error } = await supabase
      .from("clients")
      .select("id, nom, domaines_email, secteur, actif")
      .order("nom");
    if (error) {
      toast.error("Erreur", { description: error.message });
      setLoading(false);
      return;
    }
    const ids = (clients ?? []).map((c) => c.id);
    const [affRes, contactRes, emailRes] = await Promise.all([
      supabase.from("affaires").select("client_id, numero").in("client_id", ids),
      supabase.from("client_contacts").select("client_id").in("client_id", ids),
      supabase
        .from("emails_entrants")
        .select("client_id, received_at")
        .in("client_id", ids)
        .order("received_at", { ascending: false }),
    ]);
    const affByClient = new Map<string, { aff: number; opp: number }>();
    (affRes.data ?? []).forEach((a) => {
      if (!a.client_id) return;
      const cur = affByClient.get(a.client_id) ?? { aff: 0, opp: 0 };
      if (a.numero?.startsWith("9")) cur.opp += 1;
      else cur.aff += 1;
      affByClient.set(a.client_id, cur);
    });
    const contactByClient = new Map<string, number>();
    (contactRes.data ?? []).forEach((c) => {
      if (!c.client_id) return;
      contactByClient.set(c.client_id, (contactByClient.get(c.client_id) ?? 0) + 1);
    });
    const lastEmailByClient = new Map<string, string>();
    (emailRes.data ?? []).forEach((e) => {
      if (!e.client_id || !e.received_at) return;
      if (!lastEmailByClient.has(e.client_id)) {
        lastEmailByClient.set(e.client_id, e.received_at);
      }
    });
    setRows(
      (clients ?? []).map((c) => ({
        id: c.id,
        nom: c.nom,
        domaines_email: c.domaines_email ?? [],
        secteur: c.secteur,
        actif: c.actif,
        nb_affaires: affByClient.get(c.id)?.aff ?? 0,
        nb_opportunites: affByClient.get(c.id)?.opp ?? 0,
        nb_contacts: contactByClient.get(c.id) ?? 0,
        dernier_email_at: lastEmailByClient.get(c.id) ?? null,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showInactifs && !r.actif) return false;
      if (!q) return true;
      return (
        r.nom.toLowerCase().includes(q) ||
        r.domaines_email.some((d) => d.includes(q)) ||
        (r.secteur ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, showInactifs]);

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-4">
      <PageHeader
        title="Clients"
        description="Hub centralisé : chantiers, opportunités, contacts et emails par client"
        actions={
          <div className="flex flex-wrap gap-2">
            {canMerge && (
              <Button
                variant="outline"
                onClick={() => navigate({ to: "/clients/admin/fusion" })}
              >
                <GitMerge className="h-4 w-4 mr-1" /> Fusionner doublons
              </Button>
            )}
            {canManage && (
              <Button variant="outline" onClick={() => setOpenImport(true)}>
                <Upload className="h-4 w-4 mr-1" /> Importer CSV
              </Button>
            )}
            {canManage && (
              <Button onClick={() => setOpenCreate(true)}>
                <Plus className="h-4 w-4 mr-1" /> Nouveau client
              </Button>
            )}
          </div>
        }
      />

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Recherche nom, domaine, secteur…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="show-inactifs"
              checked={showInactifs}
              onCheckedChange={setShowInactifs}
            />
            <Label htmlFor="show-inactifs" className="text-sm">
              Inclure inactifs
            </Label>
          </div>
          <div className="text-xs text-muted-foreground ml-auto">
            {filtered.length} client{filtered.length > 1 ? "s" : ""}
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Aucun client.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Domaines</TableHead>
                <TableHead>Secteur</TableHead>
                <TableHead className="text-right">
                  <Briefcase className="h-3 w-3 inline mr-1" />
                  Affaires
                </TableHead>
                <TableHead className="text-right">
                  <Trophy className="h-3 w-3 inline mr-1" />
                  Opp.
                </TableHead>
                <TableHead className="text-right">
                  <Users className="h-3 w-3 inline mr-1" />
                  Contacts
                </TableHead>
                <TableHead className="text-right">
                  <Mail className="h-3 w-3 inline mr-1" />
                  Dernier email
                </TableHead>
                {canManage && <TableHead className="w-24"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer">
                  <TableCell>
                    <Link
                      to="/clients/$clientId"
                      params={{ clientId: r.id }}
                      className="font-medium hover:underline"
                    >
                      {r.nom}
                    </Link>
                    {!r.actif && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        inactif
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.domaines_email.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        r.domaines_email.map((d) => (
                          <Badge key={d} variant="secondary" className="text-[10px]">
                            @{d}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.secteur ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.nb_affaires}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.nb_opportunites}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.nb_contacts}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {r.dernier_email_at
                      ? new Date(r.dernier_email_at).toLocaleDateString("fr-FR")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {openCreate && (
        <NouveauClientDialog
          onClose={() => setOpenCreate(false)}
          onDone={async () => {
            setOpenCreate(false);
            await load();
          }}
        />
      )}
    </div>
  );
}
