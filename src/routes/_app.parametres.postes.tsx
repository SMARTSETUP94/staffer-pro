import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2, Briefcase, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
import { requireCapability } from "@/lib/capability-guard";
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { useCapability } from "@/hooks/use-capability";
import { supabase } from "@/integrations/supabase/client";
import { MetiersPostesTabs } from "@/components/parametres/MetiersPostesTabs";

export const Route = createFileRoute("/_app/parametres/postes")({
  beforeLoad: () => requireCapability("section.admin"),
  head: () => ({ meta: [{ title: "Postes contractuels — Paramètres" }] }),
  component: PostesPage,
});

interface Poste {
  id: string;
  libelle: string;
  ordre: number;
  actif: boolean;
}

interface EditState {
  open: boolean;
  mode: "create" | "edit";
  id?: string;
  libelle: string;
  ordre: number;
  actif: boolean;
}

const EMPTY: EditState = { open: false, mode: "create", libelle: "", ordre: 100, actif: true };

function PostesPage() {
  const navigate = useNavigate();
  const { loading } = useAuth();
  const canAdmin = useCapability("section.admin");
  const [edit, setEdit] = useState<EditState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Poste | null>(null);

  useEffect(() => {
    if (!loading && !canAdmin) navigate({ to: "/planning" });
  }, [loading, canAdmin, navigate]);

  const { data: postes, refetch, isLoading } = useQuery({
    queryKey: ["postes-catalogue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("postes_catalogue")
        .select("id, libelle, ordre, actif")
        .order("ordre")
        .order("libelle");
      if (error) throw error;
      return data as Poste[];
    },
  });

  async function handleSave() {
    const libelle = edit.libelle.trim();
    if (!libelle) return toast.error("Libellé requis");
    setSaving(true);
    const payload = { libelle, ordre: edit.ordre, actif: edit.actif };
    if (edit.mode === "create") {
      const { error } = await supabase.from("postes_catalogue").insert(payload);
      if (error) { toast.error("Erreur création : " + error.message); setSaving(false); return; }
      toast.success(`Poste « ${libelle} » créé`);
    } else if (edit.id) {
      const { error } = await supabase.from("postes_catalogue").update(payload).eq("id", edit.id);
      if (error) { toast.error("Erreur modification : " + error.message); setSaving(false); return; }
      toast.success(`Poste « ${libelle} » modifié`);
    }
    setSaving(false);
    setEdit(EMPTY);
    void refetch();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const { error } = await supabase.from("postes_catalogue").delete().eq("id", confirmDelete.id);
    if (error) return toast.error("Erreur suppression : " + error.message);
    toast.success(`Poste « ${confirmDelete.libelle} » supprimé`);
    setConfirmDelete(null);
    void refetch();
  }

  if (loading || !canAdmin) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <MetiersPostesTabs current="postes" />
      <div className="flex items-center gap-3">
        <Briefcase className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Postes contractuels</h1>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Liste des <strong>postes / qualités</strong> proposés au moment du staffing d'un intermittent.
          Le poste sélectionné est imprimé sur le contrat de travail (CDDU). Tu peux ajouter, désactiver ou supprimer
          un poste — l'ordre détermine la priorité dans le menu déroulant.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Catalogue ({postes?.length ?? 0})</CardTitle>
              <CardDescription className="mt-1.5">
                Postes proposés dans l'écran de staffing mobile et la table RH des contrats.
              </CardDescription>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setEdit({ ...EMPTY, open: true, mode: "create", ordre: (postes?.length ?? 0) * 10 + 10 })}>
              <Plus className="h-4 w-4" /> Nouveau poste
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !postes?.length ? (
            <p className="text-sm text-muted-foreground py-4">Aucun poste défini.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Ordre</TableHead>
                  <TableHead>Libellé</TableHead>
                  <TableHead className="w-[100px]">Statut</TableHead>
                  <TableHead className="w-[180px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {postes.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.ordre}</TableCell>
                    <TableCell className="font-medium">{p.libelle}</TableCell>
                    <TableCell>
                      <Badge variant={p.actif ? "default" : "outline"}>
                        {p.actif ? "Actif" : "Inactif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEdit({ open: true, mode: "edit", id: p.id, libelle: p.libelle, ordre: p.ordre, actif: p.actif })}>
                          Modifier
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(p)}>
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

      <Dialog open={edit.open} onOpenChange={(o) => !o && setEdit(EMPTY)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{edit.mode === "create" ? "Nouveau poste" : "Modifier le poste"}</DialogTitle>
            <DialogDescription>Le libellé apparaîtra tel quel sur le contrat.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-lib">Libellé *</Label>
              <Input id="p-lib" placeholder="ex: Technicien de plateau" value={edit.libelle} onChange={(e) => setEdit({ ...edit, libelle: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-ordre">Ordre d'affichage</Label>
              <Input id="p-ordre" type="number" value={edit.ordre} onChange={(e) => setEdit({ ...edit, ordre: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <Label htmlFor="p-actif" className="cursor-pointer">Poste actif</Label>
              <input id="p-actif" type="checkbox" checked={edit.actif} onChange={(e) => setEdit({ ...edit, actif: e.target.checked })} className="h-4 w-4" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(EMPTY)} disabled={saving}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              <Save className="h-4 w-4 mr-1.5" />
              {edit.mode === "create" ? "Créer" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer ce poste ?</DialogTitle>
            <DialogDescription>
              Le poste « {confirmDelete?.libelle} » sera supprimé du catalogue. Les contrats déjà émis avec ce poste ne seront pas impactés (le libellé est figé sur chaque contrat).
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
