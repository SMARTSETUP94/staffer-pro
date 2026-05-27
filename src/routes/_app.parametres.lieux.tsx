import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2, Warehouse, Building2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useCapability } from "@/hooks/use-capability";
import { supabase } from "@/integrations/supabase/client";
import { useLieux, type LieuType } from "@/hooks/use-lieux";
import { AddressAutocomplete } from "@/components/flotte/AddressAutocomplete";
import { useAdressesFavorites } from "@/hooks/use-vehicules";

export const Route = createFileRoute("/_app/parametres/lieux")({
  head: () => ({ meta: [{ title: "Lieux entreprise — Paramètres" }] }),
  component: LieuxPage,
});

interface EditState {
  open: boolean;
  mode: "create" | "edit";
  id?: string;
  label: string;
  type: LieuType;
  adresse_complete: string;
  latitude: number | null;
  longitude: number | null;
  actif: boolean;
}

const EMPTY: EditState = {
  open: false, mode: "create",
  label: "", type: "stockage", adresse_complete: "",
  latitude: null, longitude: null, actif: true,
};

const TYPE_LABEL: Record<LieuType, string> = {
  atelier: "Atelier",
  stockage: "Stockage",
};

function LieuxPage() {
  const navigate = useNavigate();
  const { loading } = useAuth();
  const canAdmin = useCapability("section.admin");
  const { lieux, atelier, refresh } = useLieux();
  const { adresses } = useAdressesFavorites();
  const [edit, setEdit] = useState<EditState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<typeof lieux[number] | null>(null);

  useEffect(() => {
    if (!loading && !canAdmin) navigate({ to: "/planning" });
  }, [loading, canAdmin, navigate]);

  function openCreate(type: LieuType) {
    if (type === "atelier" && atelier) {
      toast.error("Un atelier existe déjà. Modifie l'atelier existant.");
      return;
    }
    setEdit({ ...EMPTY, open: true, mode: "create", type });
  }

  function openEdit(l: typeof lieux[number]) {
    setEdit({
      open: true, mode: "edit", id: l.id,
      label: l.label, type: l.type, adresse_complete: l.adresse_complete,
      latitude: l.latitude, longitude: l.longitude, actif: l.actif,
    });
  }

  async function handleSave() {
    const label = edit.label.trim();
    const adresse = edit.adresse_complete.trim();
    if (!label) return toast.error("Libellé requis");
    if (!adresse) return toast.error("Adresse requise");

    // Vérif unicité atelier (création)
    if (edit.mode === "create" && edit.type === "atelier" && atelier) {
      return toast.error("Un atelier existe déjà.");
    }

    setSaving(true);
    const payload = {
      label, type: edit.type, adresse_complete: adresse,
      latitude: edit.latitude, longitude: edit.longitude, actif: edit.actif,
    };
    if (edit.mode === "create") {
      const { error } = await supabase.from("lieux").insert(payload);
      if (error) {
        toast.error("Erreur création : " + error.message);
        setSaving(false);
        return;
      }
      toast.success(`${TYPE_LABEL[edit.type]} "${label}" créé`);
    } else if (edit.id) {
      const { error } = await supabase.from("lieux").update(payload).eq("id", edit.id);
      if (error) {
        toast.error("Erreur modification : " + error.message);
        setSaving(false);
        return;
      }
      toast.success(`${TYPE_LABEL[edit.type]} "${label}" modifié`);
    }
    setSaving(false);
    setEdit(EMPTY);
    void refresh();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const { error } = await supabase.from("lieux").delete().eq("id", confirmDelete.id);
    if (error) {
      toast.error("Erreur suppression : " + error.message);
      return;
    }
    toast.success(`Lieu "${confirmDelete.label}" supprimé`);
    setConfirmDelete(null);
    void refresh();
  }

  if (loading || !canAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const ateliers = lieux.filter((l) => l.type === "atelier");
  const stockages = lieux.filter((l) => l.type === "stockage");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Warehouse className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Lieux entreprise</h1>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Définis l'<strong>atelier</strong> (1 unique) et tes <strong>lieux de stockage</strong> (1 ou plusieurs).
          Ces lieux servent aux <strong>suggestions automatiques de trajets</strong> (montage / démontage chantier)
          et au pré-remplissage des adresses dans le planning flotte.
        </AlertDescription>
      </Alert>

      {/* === ATELIER === */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Atelier
              </CardTitle>
              <CardDescription className="mt-1.5">
                Lieu unique de départ pour les trajets de montage / d'arrivée pour le démontage.
              </CardDescription>
            </div>
            {!atelier && (
              <Button size="sm" className="gap-1.5" onClick={() => openCreate("atelier")}>
                <Plus className="h-4 w-4" /> Définir l'atelier
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {ateliers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Aucun atelier défini. Les suggestions de trajets ne fonctionneront pas.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Libellé</TableHead>
                  <TableHead>Adresse</TableHead>
                  <TableHead className="w-[100px]">Statut</TableHead>
                  <TableHead className="w-[180px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ateliers.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.label}</TableCell>
                    <TableCell className="text-sm">{l.adresse_complete}</TableCell>
                    <TableCell>
                      <Badge variant={l.actif ? "default" : "outline"}>
                        {l.actif ? "Actif" : "Inactif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(l)}>
                          Modifier
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setConfirmDelete(l)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* === STOCKAGE === */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Warehouse className="h-5 w-5" />
                Lieux de stockage
              </CardTitle>
              <CardDescription className="mt-1.5">
                {stockages.length} lieu{stockages.length > 1 ? "x" : ""} de stockage.
                Pour le démontage, le retour peut se faire vers l'atelier OU un de ces stockages.
              </CardDescription>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => openCreate("stockage")}>
              <Plus className="h-4 w-4" /> Nouveau stockage
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {stockages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Aucun lieu de stockage.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Libellé</TableHead>
                  <TableHead>Adresse</TableHead>
                  <TableHead className="w-[100px]">Statut</TableHead>
                  <TableHead className="w-[180px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockages.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.label}</TableCell>
                    <TableCell className="text-sm">{l.adresse_complete}</TableCell>
                    <TableCell>
                      <Badge variant={l.actif ? "default" : "outline"}>
                        {l.actif ? "Actif" : "Inactif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(l)}>
                          Modifier
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setConfirmDelete(l)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* === Dialog édition === */}
      <Dialog open={edit.open} onOpenChange={(o) => !o && setEdit(EMPTY)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {edit.mode === "create" ? `Nouveau ${TYPE_LABEL[edit.type].toLowerCase()}` : "Modifier le lieu"}
            </DialogTitle>
            <DialogDescription>
              {edit.type === "atelier"
                ? "L'atelier est utilisé comme point de départ pour les montages."
                : "Les stockages sont utilisés comme destinations possibles au démontage."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="l-type">Type</Label>
              <Select
                value={edit.type}
                onValueChange={(v) => setEdit({ ...edit, type: v as LieuType })}
                disabled={edit.mode === "edit"}
              >
                <SelectTrigger id="l-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="atelier" disabled={!!atelier && edit.mode === "create"}>
                    Atelier (unique)
                  </SelectItem>
                  <SelectItem value="stockage">Stockage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-label">Libellé *</Label>
              <Input
                id="l-label"
                placeholder={edit.type === "atelier" ? "ex: Atelier Setup Paris" : "ex: Stockage Gennevilliers"}
                value={edit.label}
                onChange={(e) => setEdit({ ...edit, label: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Adresse complète *</Label>
              <AddressAutocomplete
                value={edit.adresse_complete}
                onValueChange={(v) => setEdit({ ...edit, adresse_complete: v })}
                favorites={adresses}
                placeholder="Rue, code postal, ville…"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <Label htmlFor="l-actif" className="cursor-pointer">Lieu actif</Label>
              <input
                id="l-actif"
                type="checkbox"
                checked={edit.actif}
                onChange={(e) => setEdit({ ...edit, actif: e.target.checked })}
                className="h-4 w-4"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(EMPTY)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              <Save className="h-4 w-4 mr-1.5" />
              {edit.mode === "create" ? "Créer" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Dialog confirmation suppression === */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer ce lieu ?</DialogTitle>
            <DialogDescription>
              Le lieu « {confirmDelete?.label} » sera supprimé définitivement.
              Les trajets déjà créés ne seront pas impactés (l'adresse est figée dans chaque trajet).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
