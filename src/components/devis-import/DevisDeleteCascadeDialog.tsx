import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash2, Archive } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

export interface DevisDeleteCascadePreview {
  devis_id: string;
  devis_numero: string;
  fichier_nom: string | null;
  postes_count: number;
  objets_count: number;
  objets_avec_heures_validees: number;
  heures_validees: number;
  heures_non_validees: number;
  action_recommandee: "delete" | "archive";
}

interface Props {
  devisId: string | null;
  onClose: () => void;
  onConfirmed: () => void;
}

export function DevisDeleteCascadeDialog({ devisId, onClose, onConfirmed }: Props) {
  const [preview, setPreview] = useState<DevisDeleteCascadePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!devisId) { setPreview(null); setError(null); return; }
    setLoading(true);
    setError(null);
    supabase.rpc("preflight_delete_devis", { p_devis_id: devisId })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setPreview(data as unknown as DevisDeleteCascadePreview);
        setLoading(false);
      });
  }, [devisId]);

  const handleConfirm = async () => {
    if (!devisId) return;
    setDeleting(true);
    const { error } = await supabase.rpc("delete_devis_atomique", { p_devis_id: devisId });
    setDeleting(false);
    if (error) {
      setError(error.message);
      return;
    }
    onConfirmed();
  };

  const isArchive = preview?.action_recommandee === "archive";

  return (
    <AlertDialog open={!!devisId} onOpenChange={(open) => { if (!open && !deleting) onClose(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {isArchive
              ? <><Archive className="h-5 w-5 text-amber-500" /> Archiver le devis</>
              : <><Trash2 className="h-5 w-5 text-destructive" /> Supprimer le devis</>}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              {loading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyse en cours...
                </div>
              )}
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-destructive">
                  {error}
                </div>
              )}
              {preview && !loading && (
                <>
                  <div>
                    <span className="font-semibold text-foreground">Devis {preview.devis_numero}</span>
                    {preview.fichier_nom && (
                      <span className="text-muted-foreground"> · {preview.fichier_nom}</span>
                    )}
                  </div>

                  {isArchive ? (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold text-amber-700">
                            {preview.heures_validees} heure{preview.heures_validees > 1 ? "s" : ""} validée{preview.heures_validees > 1 ? "s" : ""} détectée{preview.heures_validees > 1 ? "s" : ""}
                          </p>
                          <p className="text-amber-700/90">
                            Le devis et les objets concernés seront <strong>archivés</strong> (pas supprimés)
                            pour préserver l'intégrité des heures déjà validées.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      Suppression complète et irréversible.
                    </p>
                  )}

                  <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                    <p className="mb-2 font-semibold text-foreground">Décompte des effets :</p>
                    <ul className="space-y-1 text-muted-foreground">
                      <li>• <strong className="text-foreground">{preview.postes_count}</strong> poste{preview.postes_count > 1 ? "s" : ""} de devis supprimé{preview.postes_count > 1 ? "s" : ""}</li>
                      {isArchive ? (
                        <>
                          <li>• <strong className="text-foreground">{preview.objets_avec_heures_validees}</strong> objet{preview.objets_avec_heures_validees > 1 ? "s" : ""} de fabrication archivé{preview.objets_avec_heures_validees > 1 ? "s" : ""}</li>
                          <li>• <strong className="text-foreground">{preview.objets_count - preview.objets_avec_heures_validees}</strong> objet{(preview.objets_count - preview.objets_avec_heures_validees) > 1 ? "s" : ""} sans heures supprimé{(preview.objets_count - preview.objets_avec_heures_validees) > 1 ? "s" : ""}</li>
                        </>
                      ) : (
                        <li>• <strong className="text-foreground">{preview.objets_count}</strong> objet{preview.objets_count > 1 ? "s" : ""} de fabrication supprimé{preview.objets_count > 1 ? "s" : ""}</li>
                      )}
                      <li>• <strong className="text-foreground">{preview.heures_non_validees}</strong> saisie{preview.heures_non_validees > 1 ? "s" : ""} d'heures non validée{preview.heures_non_validees > 1 ? "s" : ""} supprimée{preview.heures_non_validees > 1 ? "s" : ""}</li>
                      {preview.heures_validees > 0 && (
                        <li className="text-emerald-700">• <strong>{preview.heures_validees}</strong> heure{preview.heures_validees > 1 ? "s" : ""} validée{preview.heures_validees > 1 ? "s" : ""} <strong>préservée{preview.heures_validees > 1 ? "s" : ""}</strong></li>
                      )}
                      <li>• Ligne d'historique d'import supprimée</li>
                      <li className="text-muted-foreground/80">• Action enregistrée dans le journal d'audit</li>
                    </ul>
                  </div>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!preview || loading || deleting}
            className={isArchive
              ? "bg-amber-600 text-white hover:bg-amber-700"
              : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
          >
            {deleting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Traitement...</>
            ) : isArchive ? (
              <><Archive className="mr-2 h-4 w-4" /> Archiver</>
            ) : (
              <><Trash2 className="mr-2 h-4 w-4" /> Supprimer définitivement</>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
