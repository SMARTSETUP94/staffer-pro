// Sprint 3b.1 — Section liste des autorisations véhicules d'un employé
// Utilisable dans modale fiche employé ou en standalone.
import { useState } from "react";
import { Pencil, Plus, Trash2, FileText, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useAutorisationsVehicules } from "@/hooks/use-autorisations-vehicules";
import {
  AUTORISATION_LABELS,
  AUTORISATION_SHORT,
  STATUT_BADGE_CLASS,
  STATUT_LABELS,
  joursAvantExpiration,
  statutFromExpiration,
  type AutorisationVehicule,
} from "@/lib/autorisations-vehicules";
import { AutorisationVehiculeDialog } from "./AutorisationVehiculeDialog";

interface Props {
  employeId: string;
  canEdit?: boolean;
}

function formatDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("fr-FR");
}

export function EmployeAutorisationsSection({ employeId, canEdit = true }: Props) {
  const { data, loading, reload } = useAutorisationsVehicules(employeId);
  const [editing, setEditing] = useState<AutorisationVehicule | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function handleAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function handleEdit(row: AutorisationVehicule) {
    setEditing(row);
    setDialogOpen(true);
  }

  async function handleDeleteConfirm() {
    if (!deleteId) return;
    const { error } = await supabase
      .from("employes_autorisations_vehicules")
      .delete()
      .eq("id", deleteId);
    if (error) {
      toast.error("Erreur : " + error.message);
    } else {
      toast.success("Autorisation supprimée");
      void reload();
    }
    setDeleteId(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Autorisations véhicules</h3>
          <p className="text-xs text-muted-foreground">
            Permis et CACES avec dates d'expiration. Alerte 30 jours avant échéance.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={handleAdd}>
            <Plus className="mr-1 h-4 w-4" />
            Ajouter
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Chargement…</div>
      ) : data.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
          Aucune autorisation enregistrée.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Type</TableHead>
                <TableHead>Numéro</TableHead>
                <TableHead>Obtention</TableHead>
                <TableHead>Expiration</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const statut = statutFromExpiration(row.date_expiration);
                const jours = joursAvantExpiration(row.date_expiration);
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span
                        className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs font-bold"
                        title={AUTORISATION_LABELS[row.type_autorisation]}
                      >
                        {AUTORISATION_SHORT[row.type_autorisation]}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.numero ?? "—"}</TableCell>
                    <TableCell className="text-xs">{formatDate(row.date_obtention)}</TableCell>
                    <TableCell className="text-xs">
                      {formatDate(row.date_expiration)}
                      {row.fichier_url && (
                        <a
                          href={row.fichier_url}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 inline-flex"
                          title="Voir le scan"
                        >
                          <FileText className="h-3 w-3 text-primary" />
                        </a>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUT_BADGE_CLASS[statut]}>
                        {statut === "expiration_proche" && (
                          <AlertTriangle className="mr-1 h-3 w-3" />
                        )}
                        {STATUT_LABELS[statut]}
                        {statut === "expiration_proche" && jours !== null && ` (${jours}j)`}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {canEdit && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleEdit(row)}
                            aria-label="Modifier"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setDeleteId(row.id)}
                            aria-label="Supprimer"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AutorisationVehiculeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employeId={employeId}
        existing={editing}
        onSaved={reload}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette autorisation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive. L'autorisation sera retirée du dossier de l'employé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
