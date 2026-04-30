import { AlertTriangle, FileWarning, Clock, CheckCircle2 } from "lucide-react";
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

/**
 * v0.30.6 — Modale de confirmation ré-import devis (garde-fous SOFT côté client).
 * Tous les garde-fous SQL bloquants ont été retirés. L'utilisateur confirme ici.
 */
export type ReimportPreflight = {
  mode: "created" | "updated";
  existing_affaire_id?: string | null;
  existing_affaire_numero?: string | null;
  existing_affaire_nom?: string | null;
  autre_affaire?: boolean;
  devis_statut?: string | null;
  devis_termine?: boolean;
  heures_reelles_count?: number;
};

type Props = {
  open: boolean;
  preflight: ReimportPreflight | null;
  targetAffaireLabel: string; // Ex: "1234 — Foo Bar"
  onCancel: () => void;
  onConfirm: () => void;
  committing?: boolean;
};

export function DevisReimportConfirmDialog({
  open,
  preflight,
  targetAffaireLabel,
  onCancel,
  onConfirm,
  committing,
}: Props) {
  if (!preflight || preflight.mode !== "updated") return null;

  const alerts: Array<{ icon: React.ReactNode; title: string; body: string; tone: "warn" | "info" }> = [];

  if (preflight.autre_affaire) {
    alerts.push({
      icon: <FileWarning className="h-4 w-4" />,
      title: "Changement d'affaire",
      body: `Ce fichier était initialement importé sur l'affaire ${preflight.existing_affaire_numero ?? "?"}${preflight.existing_affaire_nom ? ` — ${preflight.existing_affaire_nom}` : ""}. Tu vas le déplacer vers ${targetAffaireLabel}. Les heures déjà pointées suivront la nouvelle affaire.`,
      tone: "warn",
    });
  }

  if ((preflight.heures_reelles_count ?? 0) > 0) {
    alerts.push({
      icon: <Clock className="h-4 w-4" />,
      title: `${preflight.heures_reelles_count} saisie(s) d'heures réelles`,
      body: "Les heures déjà pointées sur ce devis seront conservées. Les postes et objets fabrication, eux, seront remplacés. Vérifie après import qu'ils correspondent toujours.",
      tone: "warn",
    });
  }

  if (preflight.devis_termine) {
    alerts.push({
      icon: <CheckCircle2 className="h-4 w-4" />,
      title: "Devis marqué « terminé »",
      body: "Tu vas modifier un devis dont le chantier est clôturé. C'est autorisé, mais inhabituel.",
      tone: "info",
    });
  }

  // Si aucune alerte spécifique mais c'est un re-import → confirmation simple
  if (alerts.length === 0) {
    alerts.push({
      icon: <CheckCircle2 className="h-4 w-4" />,
      title: "Mise à jour du devis existant",
      body: "Ce fichier a déjà été importé. Les postes RH et objets fabrication seront remplacés. Les heures pointées sont conservées.",
      tone: "info",
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && !committing && onCancel()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Confirmer le ré-import
          </AlertDialogTitle>
          <AlertDialogDescription>
            Ce fichier a déjà été importé. Vérifie les points suivants avant de continuer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 text-sm ${
                a.tone === "warn"
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-border bg-muted/30"
              }`}
            >
              <div className="mb-1 flex items-center gap-2 font-medium">
                {a.icon}
                {a.title}
              </div>
              <p className="text-xs text-muted-foreground">{a.body}</p>
            </div>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={committing}>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={committing}>
            {committing ? "Import en cours…" : "Confirmer et écraser"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
