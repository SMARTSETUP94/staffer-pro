import { useState } from "react";
import { Plus, Loader2, AlertTriangle, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  addOpportuniteAction,
  type OppAction,
  type OppActionType,
} from "@/server/opportunite-fiche.functions";

const TYPE_LABEL: Record<OppActionType, string> = {
  email_envoye: "Email envoyé",
  email_recu: "Email reçu",
  rdv_planifie: "RDV planifié",
  rdv_realise: "RDV réalisé",
  relance_tel: "Relance téléphonique",
  relance_email: "Relance email",
  note_interne: "Note interne",
  devis_envoye: "Devis envoyé",
  echantillon_presente: "Échantillon présenté",
  autre: "Autre",
};

interface Props {
  affaireId: string;
  lastAction: OppAction | null;
  canEdit: boolean;
  onSaved: () => void;
}

export function OpportuniteNextActionCard({ affaireId, lastAction, canEdit, onSaved }: Props) {
  const [open, setOpen] = useState(false);

  const due = lastAction?.prochaine_action_due_le ?? null;
  const overdue = due ? new Date(due) < new Date(new Date().toDateString()) : false;

  return (
    <section data-testid="opportunite-next-action">
      <div className="mb-3 flex items-center justify-between">
        <p className="overline">— Prochaine action</p>
        {canEdit && (
          <Button size="sm" variant="outline" className="h-7 rounded-lg text-xs" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Ajouter une action
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        {!lastAction ? (
          <p className="text-sm italic text-muted-foreground">
            Aucune action enregistrée pour le moment.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {TYPE_LABEL[lastAction.type]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(lastAction.date).toLocaleDateString("fr-FR")}
                {lastAction.auteur_nom && <> · {lastAction.auteur_nom}</>}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{lastAction.texte}</p>
            {due && (
              <div
                className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                  overdue
                    ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                }`}
              >
                {overdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                Prochain pas le {new Date(due).toLocaleDateString("fr-FR")}
                {overdue && " — en retard"}
              </div>
            )}
          </div>
        )}
      </div>

      {open && (
        <AddActionDialog
          affaireId={affaireId}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onSaved();
          }}
        />
      )}
    </section>
  );
}

function AddActionDialog({
  affaireId,
  onClose,
  onSaved,
}: {
  affaireId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const addAction = useServerFn(addOpportuniteAction);
  const [type, setType] = useState<OppActionType>("relance_tel");
  const [texte, setTexte] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!texte.trim()) {
      toast.error("Décris l'action en quelques mots.");
      return;
    }
    setSaving(true);
    try {
      await addAction({
        data: {
          affaireId,
          type,
          texte: texte.trim(),
          prochaine_action_due_le: due || null,
        },
      });
      toast.success("Action enregistrée.");
      onSaved();
    } catch (err) {
      toast.error("Impossible d'enregistrer l'action.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle action commerciale</DialogTitle>
          <DialogDescription>
            Ajoute une entrée à la timeline de l'opportunité.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Type d'action</Label>
            <Select value={type} onValueChange={(v) => setType(v as OppActionType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABEL).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="action-texte">
              Description
            </Label>
            <Textarea
              id="action-texte"
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              rows={4}
              placeholder="Compte-rendu, échange, prochain pas…"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="action-due">
              Prochain pas — à faire le (optionnel)
            </Label>
            <Input
              id="action-due"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving} data-testid="btn-save-action">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
