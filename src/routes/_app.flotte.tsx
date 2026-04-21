import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Truck, MapPin, AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import {
  useVehicules, useAdressesFavorites, alerteDate, alerteCT, dateExpirationCT,
  VEHICULE_TYPE_LABEL, PROPRIETAIRE_LABEL,
  type Vehicule, type AdresseFavorite, type AlerteNiveau,
} from "@/hooks/use-vehicules";
import { VehiculeDialog } from "@/components/flotte/VehiculeDialog";
import { AdresseFavoriteDialog } from "@/components/flotte/AdresseFavoriteDialog";

export const Route = createFileRoute("/_app/flotte")({
  head: () => ({ meta: [{ title: "Flotte — Setup Paris" }] }),
  component: FlottePage,
});

const ADRESSE_TYPE_LABEL: Record<AdresseFavorite["type"], string> = {
  entrepot: "Entrepôt",
  client: "Client",
  fournisseur: "Fournisseur",
  autre: "Autre",
};

/**
 * Badge d'alerte générique sur une date d'échéance.
 * Pour le CT, passer `kind="ct"` : la date stockée est la date du dernier contrôle,
 * l'échéance affichée est date + 2 ans.
 */
function AlerteBadge({
  date,
  label,
  kind = "echeance",
}: {
  date: string | null;
  label: string;
  kind?: "ct" | "echeance";
}) {
  const echeance = kind === "ct" ? dateExpirationCT(date) : date;
  const niveau: AlerteNiveau = kind === "ct" ? alerteCT(date) : alerteDate(date);
  if (niveau === "none") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (niveau === "ok") {
    return (
      <div className="text-xs">
        <div className="text-muted-foreground">{label}</div>
        <div>{new Date(echeance!).toLocaleDateString("fr-FR")}</div>
      </div>
    );
  }
  const isExpired = niveau === "expired";
  return (
    <div className="text-xs">
      <div className="text-muted-foreground">{label}</div>
      <Badge
        variant={isExpired ? "destructive" : "secondary"}
        className={
          isExpired
            ? ""
            : "bg-warning/15 text-warning-foreground border border-warning/40"
        }
      >
        <AlertTriangle className="h-3 w-3 mr-1" />
        {new Date(echeance!).toLocaleDateString("fr-FR")}
      </Badge>
    </div>
  );
}

function FlottePage() {
  const { vehicules, isLoading, refetch } = useVehicules();
  const { adresses, isLoading: loadAdr, refetch: refetchAdr } = useAdressesFavorites();
  const [tab, setTab] = useState<"interne" | "location" | "adresses">("interne");
  const [openDlg, setOpenDlg] = useState(false);
  const [editVeh, setEditVeh] = useState<Vehicule | null>(null);
  const [openAdrDlg, setOpenAdrDlg] = useState(false);
  const [editAdr, setEditAdr] = useState<AdresseFavorite | null>(null);

  const interne = useMemo(() => vehicules.filter((v) => v.proprietaire === "interne"), [vehicules]);
  const loues = useMemo(
    () => vehicules.filter((v) => v.proprietaire === "location" || v.proprietaire === "sous_traitance"),
    [vehicules],
  );

  const handleNewVehicule = () => {
    setEditVeh(null);
    setOpenDlg(true);
  };

  const handleEdit = (v: Vehicule) => {
    setEditVeh(v);
    setOpenDlg(true);
  };

  const handleDelete = async (v: Vehicule) => {
    if (!window.confirm(`Supprimer le véhicule « ${v.nom} » ?`)) return;
    const { error } = await supabase.from("vehicules").delete().eq("id", v.id);
    if (error) {
      toast.error("Suppression impossible", { description: error.message });
      return;
    }
    toast.success("Véhicule supprimé");
    void refetch();
  };

  const handleNewAdresse = () => {
    setEditAdr(null);
    setOpenAdrDlg(true);
  };

  const handleEditAdresse = (a: AdresseFavorite) => {
    setEditAdr(a);
    setOpenAdrDlg(true);
  };

  const handleDeleteAdresse = async (a: AdresseFavorite) => {
    if (!window.confirm(`Supprimer « ${a.nom} » ?`)) return;
    const { error } = await supabase.from("adresses_favorites").delete().eq("id", a.id);
    if (error) {
      toast.error("Suppression impossible", { description: error.message });
      return;
    }
    toast.success("Adresse supprimée");
    void refetchAdr();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Logistique / Flotte"
        title="Flotte de véhicules"
        description="Véhicules internes, locations, sous-traitance et adresses favorites pour les trajets."
        actions={
          tab === "adresses" ? (
            <Button onClick={handleNewAdresse}>
              <Plus className="h-4 w-4 mr-2" /> Nouvelle adresse
            </Button>
          ) : (
            <Button onClick={handleNewVehicule}>
              <Plus className="h-4 w-4 mr-2" /> Nouveau véhicule
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="interne">
            <Truck className="h-4 w-4 mr-2" /> Ma flotte ({interne.length})
          </TabsTrigger>
          <TabsTrigger value="location">
            <Truck className="h-4 w-4 mr-2" /> Loués / Sous-traitance ({loues.length})
          </TabsTrigger>
          <TabsTrigger value="adresses">
            <MapPin className="h-4 w-4 mr-2" /> Adresses favorites ({adresses.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="interne" className="mt-4">
          <VehiculesTable
            rows={interne}
            isLoading={isLoading}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </TabsContent>

        <TabsContent value="location" className="mt-4">
          <VehiculesTable
            rows={loues}
            isLoading={isLoading}
            onEdit={handleEdit}
            onDelete={handleDelete}
            showFournisseur
          />
        </TabsContent>

        <TabsContent value="adresses" className="mt-4">
          <AdressesTable
            rows={adresses}
            isLoading={loadAdr}
            onEdit={handleEditAdresse}
            onDelete={handleDeleteAdresse}
          />
        </TabsContent>
      </Tabs>

      <VehiculeDialog
        open={openDlg}
        onOpenChange={setOpenDlg}
        vehicule={editVeh}
        onSaved={() => void refetch()}
      />
      <AdresseFavoriteDialog
        open={openAdrDlg}
        onOpenChange={setOpenAdrDlg}
        adresse={editAdr}
        onSaved={() => void refetchAdr()}
      />
    </div>
  );
}

function VehiculesTable({
  rows, isLoading, onEdit, onDelete, showFournisseur,
}: {
  rows: Vehicule[];
  isLoading: boolean;
  onEdit: (v: Vehicule) => void;
  onDelete: (v: Vehicule) => void;
  showFournisseur?: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Aucun véhicule. Crée le premier avec « Nouveau véhicule ».
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Surnom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Immat.</TableHead>
              <TableHead>Permis</TableHead>
              {showFournisseur && <TableHead>Fournisseur</TableHead>}
              <TableHead>Propriétaire</TableHead>
              <TableHead>CT</TableHead>
              <TableHead>Révision</TableHead>
              <TableHead>Assurance</TableHead>
              <TableHead>Actif</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-semibold">{v.nom}</TableCell>
                <TableCell>
                  <Badge variant="outline">{VEHICULE_TYPE_LABEL[v.type]}</Badge>
                </TableCell>
                <TableCell className="text-xs font-mono">{v.immatriculation ?? "—"}</TableCell>
                <TableCell><Badge variant="secondary">{v.permis_requis}</Badge></TableCell>
                {showFournisseur && (
                  <TableCell className="text-xs">
                    {v.fournisseur_location ?? "—"}
                    {v.cout_journalier_eur && (
                      <span className="text-muted-foreground"> · {v.cout_journalier_eur} €/j</span>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <Badge
                    variant={v.proprietaire === "sous_traitance" ? "destructive" : "outline"}
                    className={v.proprietaire === "location" ? "bg-warning/10 border-warning/40" : ""}
                  >
                    {PROPRIETAIRE_LABEL[v.proprietaire]}
                  </Badge>
                </TableCell>
                <TableCell><AlerteBadge date={v.date_controle_technique} label="CT" kind="ct" /></TableCell>
                <TableCell><AlerteBadge date={v.date_prochaine_revision} label="Révision" /></TableCell>
                <TableCell><AlerteBadge date={v.date_expiration_assurance} label="Assurance" /></TableCell>
                <TableCell>
                  {v.actif ? (
                    <Badge className="bg-success/15 text-success-foreground border border-success/40">Actif</Badge>
                  ) : (
                    <Badge variant="outline">Inactif</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => onEdit(v)} title="Modifier">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => onDelete(v)} title="Supprimer">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AdressesTable({
  rows, isLoading, onEdit, onDelete,
}: {
  rows: AdresseFavorite[];
  isLoading: boolean;
  onEdit: (a: AdresseFavorite) => void;
  onDelete: (a: AdresseFavorite) => void;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Aucune adresse favorite. Crée la première avec « Nouvelle adresse ».
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Adresse</TableHead>
              <TableHead>Coordonnées</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-semibold">{a.nom}</TableCell>
                <TableCell><Badge variant="outline">{ADRESSE_TYPE_LABEL[a.type]}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{a.adresse_complete}</TableCell>
                <TableCell className="text-xs font-mono">
                  {a.latitude && a.longitude
                    ? `${Number(a.latitude).toFixed(4)}, ${Number(a.longitude).toFixed(4)}`
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => onEdit(a)} title="Modifier">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => onDelete(a)} title="Supprimer">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
