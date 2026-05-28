// Sprint 3b.2 — Page admin : carnet sous-traitants
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loader2, Search, Plus, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
import { requireCapability } from "@/lib/capability-guard";
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSousTraitants } from "@/hooks/use-sous-traitants";
import { SousTraitantDialog } from "@/components/sous-traitants/SousTraitantDialog";
import {
  SOUS_TRAITANT_TYPE_LABEL,
  formatTarif,
  type SousTraitant,
  type SousTraitantType,
} from "@/lib/sous-traitants";

export const Route = createFileRoute("/_app/parametres/sous-traitants")({
  beforeLoad: () => requireCapability("section.admin"),
  head: () => ({ meta: [{ title: "Sous-traitants — Paramètres" }] }),
  component: SousTraitantsPage,
});

function SousTraitantsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"__all__" | SousTraitantType>("__all__");
  const [actifOnly, setActifOnly] = useState(true);
  const { data, loading, reload } = useSousTraitants({ actifOnly });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SousTraitant | null>(null);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return data.filter((st) => {
      if (typeFilter !== "__all__" && st.type !== typeFilter) return false;
      if (!s) return true;
      return (
        st.nom.toLowerCase().includes(s) ||
        (st.contact_nom?.toLowerCase().includes(s) ?? false) ||
        (st.email?.toLowerCase().includes(s) ?? false)
      );
    });
  }, [data, search, typeFilter]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(st: SousTraitant) {
    setEditing(st);
    setDialogOpen(true);
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Carnet sous-traitants</CardTitle>
            <CardDescription>
              Transporteurs, manutentionnaires et autres prestataires partenaires.
            </CardDescription>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Ajouter
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher (nom, contact, email)"
                className="pl-8"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous types</SelectItem>
                {(Object.keys(SOUS_TRAITANT_TYPE_LABEL) as SousTraitantType[]).map((t) => (
                  <SelectItem key={t} value={t}>{SOUS_TRAITANT_TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={actifOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setActifOnly((v) => !v)}
            >
              {actifOnly ? "Actifs uniquement" : "Tous"}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              Aucun sous-traitant. Clique sur « Ajouter » pour commencer le carnet.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Tarif jour</TableHead>
                    <TableHead>Tarif km</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((st) => (
                    <TableRow key={st.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{st.nom}</span>
                          {!st.actif && <Badge variant="outline" className="text-xs">Inactif</Badge>}
                        </div>
                        {st.email && (
                          <div className="text-xs text-muted-foreground">{st.email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{SOUS_TRAITANT_TYPE_LABEL[st.type]}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{st.contact_nom ?? "—"}</TableCell>
                      <TableCell className="text-sm">{st.telephone ?? "—"}</TableCell>
                      <TableCell className="text-sm">{formatTarif(st.tarif_jour_eur, "/jour")}</TableCell>
                      <TableCell className="text-sm">{formatTarif(st.tarif_km_eur, "/km")}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(st)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SousTraitantDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existing={editing}
        onSaved={() => {
          void reload();
        }}
      />
    </div>
  );
}
