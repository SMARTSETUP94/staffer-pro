import { createFileRoute, Link } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Link2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/clients/admin/orphelins")({
  beforeLoad: () => requireCapability("clients.manage"),
  head: () => ({ meta: [{ title: "Affaires sans client — Setup Paris" }] }),
  component: OrphelinsPage,
});

interface OrphelinRow {
  id: string;
  numero: string | null;
  nom: string | null;
  client: string | null;
  statut: string | null;
  date_debut: string | null;
}

interface ClientOption {
  id: string;
  nom: string;
}

function OrphelinsPage() {
  const [rows, setRows] = useState<OrphelinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientQuery, setClientQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);

  async function load() {
    setLoading(true);
    const [orphRes, cliRes] = await Promise.all([
      supabase
        .from("affaires")
        .select("id, numero, nom, client, statut, date_debut")
        .is("client_id", null)
        .order("numero", { ascending: false }),
      supabase.from("clients").select("id, nom").eq("actif", true).order("nom"),
    ]);
    if (orphRes.error) toast.error(orphRes.error.message);
    if (cliRes.error) toast.error(cliRes.error.message);
    setRows((orphRes.data ?? []) as OrphelinRow[]);
    setClients((cliRes.data ?? []) as ClientOption[]);
    setSelected(new Set());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.numero ?? "").toLowerCase().includes(q) ||
        (r.nom ?? "").toLowerCase().includes(q) ||
        (r.client ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients
      .filter((c) => c.nom.toLowerCase().includes(q))
      .slice(0, 8);
  }, [clients, clientQuery]);

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  }

  async function attachSelected() {
    if (!selectedClientId || selected.size === 0) return;
    setAttaching(true);
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("affaires")
      .update({ client_id: selectedClientId })
      .in("id", ids);
    setAttaching(false);
    if (error) {
      toast.error("Rattachement impossible", { description: error.message });
      return;
    }
    toast.success(
      `${ids.length} affaire(s) rattachée(s) à « ${selectedClient?.nom} »`,
    );
    void load();
  }

  async function autoAttachByName() {
    setAttaching(true);
    // Tentative : pour chaque ligne sélectionnée avec un nom de client non vide,
    // chercher un client existant par nom exact (insensible casse/espaces).
    const targets = filtered.filter(
      (r) => selected.has(r.id) && (r.client ?? "").trim() !== "",
    );
    if (targets.length === 0) {
      setAttaching(false);
      toast.info("Aucune ligne sélectionnée avec un nom de client renseigné.");
      return;
    }
    let ok = 0;
    let miss = 0;
    for (const t of targets) {
      const norm = (t.client ?? "").trim().toLowerCase();
      const match = clients.find((c) => c.nom.trim().toLowerCase() === norm);
      if (!match) {
        miss += 1;
        continue;
      }
      const { error } = await supabase
        .from("affaires")
        .update({ client_id: match.id })
        .eq("id", t.id);
      if (!error) ok += 1;
    }
    setAttaching(false);
    toast.success(`${ok} rattachée(s)`, {
      description: miss > 0 ? `${miss} sans correspondance` : undefined,
    });
    void load();
  }

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-4">
      <PageHeader
        title="Affaires sans client"
        description="Liste des chantiers et opportunités non rattachés à un client. Rattachez-les par lot."
        actions={
          <Button variant="outline" asChild>
            <Link to="/clients">← Retour</Link>
          </Button>
        }
      />

      <Card className="p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filtrer (numéro, nom, client texte)…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="text-xs text-muted-foreground ml-auto">
            {filtered.length} affaire(s) — {selected.size} sélectionnée(s)
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t pt-3">
          <div className="flex-1 min-w-[280px]">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Rattacher au client
            </label>
            <div className="relative">
              <Input
                placeholder="Rechercher un client…"
                value={selectedClient ? selectedClient.nom : clientQuery}
                onChange={(e) => {
                  setClientQuery(e.target.value);
                  setSelectedClientId(null);
                }}
              />
              {!selectedClient && clientQuery.trim() && (
                <div className="absolute z-10 mt-1 w-full bg-popover border rounded-md shadow-md max-h-60 overflow-auto">
                  {filteredClients.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">
                      Aucun client trouvé.
                    </div>
                  ) : (
                    filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={() => {
                          setSelectedClientId(c.id);
                          setClientQuery("");
                        }}
                      >
                        {c.nom}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          <Button
            onClick={() => void attachSelected()}
            disabled={!selectedClientId || selected.size === 0 || attaching}
          >
            {attaching ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Link2 className="h-4 w-4 mr-1" />
            )}
            Rattacher la sélection
          </Button>
          <Button
            variant="outline"
            onClick={() => void autoAttachByName()}
            disabled={selected.size === 0 || attaching}
            title="Tente de rattacher chaque affaire sélectionnée au client dont le nom correspond au champ 'client' libre."
          >
            Auto‑rattacher par nom
          </Button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            🎉 Toutes les affaires sont rattachées à un client.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={
                      filtered.length > 0 && selected.size === filtered.length
                    }
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Numéro</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Client (texte libre)</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date début</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const isOpp = r.numero?.startsWith("9");
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggle(r.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <Link
                        to="/affaires/$affaireId"
                        params={{ affaireId: r.id }}
                        className="hover:underline"
                      >
                        {r.numero ?? "—"}
                      </Link>
                      {isOpp && (
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          opp.
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{r.nom ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.client?.trim() ? (
                        r.client
                      ) : (
                        <span className="text-muted-foreground italic">
                          (vide)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.statut ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.date_debut
                        ? new Date(r.date_debut).toLocaleDateString("fr-FR")
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
