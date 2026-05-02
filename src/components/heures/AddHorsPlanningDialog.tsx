import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AffaireCombobox } from "@/components/planning/AffaireCombobox";
import { useMetiers } from "@/hooks/use-metiers";
import type { Affaire } from "@/hooks/use-planning-data";
import {
  validateHorsPlanningInput,
  HORS_PLANNING_ERROR_LABELS,
  type HorsPlanningInput,
} from "@/lib/hors-planning-helpers";

interface Props {
  defaultDate?: string; // YYYY-MM-DD
  variant: "mobile" | "desktop";
  /** v0.32.4 — pré-sélection métier (ex. métier principal de l'employé). */
  defaultMetierId?: number;
  onSubmit: (input: HorsPlanningInput) => Promise<{ ok: boolean; error?: string }>;
}

export function AddHorsPlanningDialog({ defaultDate, variant, defaultMetierId, onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [affaires, setAffaires] = useState<Affaire[]>([]);
  const [loadingAffaires, setLoadingAffaires] = useState(false);
  const { metiers } = useMetiers();

  const [affaireId, setAffaireId] = useState<string>("");
  const [metierId, setMetierId] = useState<string>("");
  const [date, setDate] = useState<string>(defaultDate ?? format(new Date(), "yyyy-MM-dd"));
  const [heures, setHeures] = useState<string>("8");
  const [commentaire, setCommentaire] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  // v0.32.4 — N'afficher les erreurs inline qu'après une 1re tentative de soumission.
  const [showErrors, setShowErrors] = useState(false);
  const todayISO = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  // Charger affaires actives à l'ouverture
  useEffect(() => {
    if (!open || affaires.length > 0) return;
    setLoadingAffaires(true);
    supabase
      .from("affaires")
      .select(
        "id, numero, nom, lieu, client, chef_chantier_id, date_montage, date_demontage, phase, statut",
      )
      .in("statut", ["en_cours", "prospect"])
      .order("numero", { ascending: false })
      .then(({ data }) => {
        setAffaires((data ?? []) as Affaire[]);
        setLoadingAffaires(false);
      });
  }, [open, affaires.length]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setAffaireId("");
      setMetierId(defaultMetierId ? String(defaultMetierId) : "");
      setDate(defaultDate ?? format(new Date(), "yyyy-MM-dd"));
      setHeures("8");
      setCommentaire("");
      setShowErrors(false);
    }
  }, [open, defaultDate, defaultMetierId]);

  const input: Partial<HorsPlanningInput> = useMemo(
    () => ({
      affaire_id: affaireId || undefined,
      metier_id: metierId ? Number(metierId) : undefined,
      date,
      heures_reelles: heures === "" ? undefined : Number(heures),
      commentaire: commentaire.trim() || null,
    }),
    [affaireId, metierId, date, heures, commentaire],
  );

  const validation = useMemo(() => validateHorsPlanningInput(input), [input]);

  const handleSubmit = async () => {
    if (!validation.ok) {
      toast.error(HORS_PLANNING_ERROR_LABELS[validation.errors[0]]);
      return;
    }
    setSubmitting(true);
    const res = await onSubmit(input as HorsPlanningInput);
    setSubmitting(false);
    if (res.ok) {
      toast.success("Saisie hors planning ajoutée.");
      setOpen(false);
    } else {
      toast.error(res.error ?? "Erreur lors de l'ajout.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size={variant === "mobile" ? "sm" : "default"}
          className="gap-2"
          data-testid="btn-add-hors-planning"
        >
          <Plus className="h-4 w-4" />
          + Autre chantier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Saisir des heures hors planning</DialogTitle>
          <DialogDescription>
            Tu as travaillé sur un chantier où tu n'étais pas planifié ? Déclare-le ici.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Affaire
            </Label>
            {loadingAffaires ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement…
              </div>
            ) : (
              <AffaireCombobox
                affaires={affaires}
                value={affaireId}
                onChange={setAffaireId}
                placeholder="Rechercher (n°, nom, client)…"
              />
            )}
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Métier réellement effectué
            </Label>
            <Select value={metierId} onValueChange={setMetierId}>
              <SelectTrigger data-testid="select-metier-hors-planning">
                <SelectValue placeholder="Sélectionner un métier" />
              </SelectTrigger>
              <SelectContent>
                {metiers.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: m.couleur }}
                      />
                      {m.libelle}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Date
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Heures
              </Label>
              <Input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                value={heures}
                onChange={(e) => setHeures(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Commentaire (optionnel)
            </Label>
            <Textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Pourquoi cette saisie hors planning ?"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!validation.ok || submitting}
            data-testid="btn-submit-hors-planning"
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
