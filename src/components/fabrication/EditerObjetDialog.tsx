import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  type FabricationObjet,
  type FabricationFinitionType,
  type FabricationEtapeType,
  ETAPE_LABELS,
} from "@/hooks/use-fabrication";

interface Props {
  objet: FabricationObjet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const FINITIONS_VISIBLES: FabricationFinitionType[] = ["peinture", "tapisserie", "autre"];

interface FlagsState {
  a_dessiner: boolean;
  a_construire: boolean;
  est_brut: boolean;
  a_emballer: boolean;
}

export function EditerObjetDialog({ objet, open, onOpenChange, onSaved }: Props) {
  const [nom, setNom] = useState(objet.nom);
  const [quantite, setQuantite] = useState(objet.quantite);
  const [commentaire, setCommentaire] = useState(objet.commentaire ?? "");
  const [typeFinition, setTypeFinition] = useState<FabricationFinitionType>(objet.type_finition);
  const [flags, setFlags] = useState<FlagsState>({
    a_dessiner: objet.a_dessiner,
    a_construire: objet.a_construire,
    est_brut: objet.est_brut,
    a_emballer: objet.a_emballer,
  });
  const [saving, setSaving] = useState(false);
  const [pendingFlag, setPendingFlag] = useState<{
    flagKey: keyof FlagsState;
    newValue: boolean;
    etape: FabricationEtapeType;
  } | null>(null);

  // Reset à l'ouverture
  useEffect(() => {
    if (open) {
      setNom(objet.nom);
      setQuantite(objet.quantite);
      setCommentaire(objet.commentaire ?? "");
      setTypeFinition(objet.type_finition);
      setFlags({
        a_dessiner: objet.a_dessiner,
        a_construire: objet.a_construire,
        est_brut: objet.est_brut,
        a_emballer: objet.a_emballer,
      });
      setPendingFlag(null);
    }
  }, [open, objet]);

  const etapeFor = (etape: FabricationEtapeType) => objet.etapes.find((e) => e.type_etape === etape);

  /**
   * Tente de basculer un flag.
   * `invertLogic=true` pour est_brut (où value=true → étape non applicable).
   * Si le changement marque une étape en cours/terminée comme non applicable,
   * on demande confirmation.
   */
  const handleFlagToggle = (
    flagKey: keyof FlagsState,
    newValue: boolean,
    etape: FabricationEtapeType,
    invertLogic = false,
  ) => {
    const becomingNonApplicable = invertLogic ? newValue : !newValue;
    if (becomingNonApplicable) {
      const e = etapeFor(etape);
      if (e && (e.statut === "en_cours" || e.statut === "termine")) {
        setPendingFlag({ flagKey, newValue, etape });
        return;
      }
    }
    setFlags((f) => ({ ...f, [flagKey]: newValue }));
  };

  const confirmFlagChange = () => {
    if (pendingFlag) {
      setFlags((f) => ({ ...f, [pendingFlag.flagKey]: pendingFlag.newValue }));
    }
    setPendingFlag(null);
  };

  const handleSubmit = async () => {
    if (!nom.trim()) {
      toast.error("Le nom de l'objet est obligatoire.");
      return;
    }
    if (quantite < 1) {
      toast.error("La quantité doit être au moins 1.");
      return;
    }
    setSaving(true);

    const { error } = await supabase
      .from("fabrication_objets")
      .update({
        nom: nom.trim(),
        quantite,
        commentaire: commentaire.trim() || null,
        type_finition: flags.est_brut ? "aucune" : typeFinition,
        a_dessiner: flags.a_dessiner,
        a_construire: flags.a_construire,
        est_brut: flags.est_brut,
        a_emballer: flags.a_emballer,
      })
      .eq("id", objet.id);

    setSaving(false);
    if (error) {
      toast.error("Modification impossible", { description: error.message });
      return;
    }
    toast.success("Objet mis à jour");
    onSaved();
    onOpenChange(false);
  };

  const pendingEtape = pendingFlag ? etapeFor(pendingFlag.etape) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier l'objet — {objet.reference}</DialogTitle>
            <DialogDescription>
              Modifie les questions Oui/Non pour ajuster les étapes nécessaires. Les étapes en cours ou terminées
              demanderont confirmation avant d'être marquées non applicables.
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[70vh] gap-4 overflow-y-auto py-2 pr-1">
            <div className="grid gap-2">
              <Label htmlFor="edit-nom">Nom de l'objet *</Label>
              <Input id="edit-nom" value={nom} onChange={(e) => setNom(e.target.value)} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-quantite">Quantité *</Label>
              <Input
                id="edit-quantite"
                type="number"
                min={1}
                value={quantite}
                onChange={(e) => setQuantite(Math.max(1, parseInt(e.target.value || "1", 10)))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-commentaire">Commentaire (optionnel)</Label>
              <Textarea
                id="edit-commentaire"
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                rows={2}
              />
            </div>

            <div className="rounded-xl border border-border bg-background p-3">
              <div className="mb-3 text-sm font-semibold">Étapes nécessaires</div>
              <div className="grid gap-3">
                <EtapeQuestion
                  question="L'objet doit être dessiné ?"
                  value={flags.a_dessiner}
                  onChange={(v) => handleFlagToggle("a_dessiner", v, "be", false)}
                />
                <EtapeQuestion
                  question="L'objet est à construire (ou existant) ?"
                  value={flags.a_construire}
                  onChange={(v) => handleFlagToggle("a_construire", v, "respo_fab", false)}
                />
                <EtapeQuestion
                  question="L'objet est brut ?"
                  value={flags.est_brut}
                  onChange={(v) => handleFlagToggle("est_brut", v, "finition", true)}
                >
                  {!flags.est_brut && (
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Type de finition (optionnel)</Label>
                      <Select
                        value={typeFinition === "aucune" ? "none" : typeFinition}
                        onValueChange={(v) =>
                          setTypeFinition((v === "none" ? "aucune" : v) as FabricationFinitionType)
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="— Non précisé —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Non précisé —</SelectItem>
                          {FINITIONS_VISIBLES.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f === "peinture" ? "Peinture" : f === "tapisserie" ? "Tapisserie" : "Autre"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </EtapeQuestion>
                <EtapeQuestion
                  question="L'objet doit être emballé ?"
                  value={flags.a_emballer}
                  onChange={(v) => handleFlagToggle("a_emballer", v, "manutention", false)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingFlag} onOpenChange={(o) => !o && setPendingFlag(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marquer l'étape non applicable ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'étape « {pendingFlag ? ETAPE_LABELS[pendingFlag.etape] : ""} » est actuellement{" "}
              {pendingEtape?.statut === "termine" ? "terminée" : "en cours"}. La marquer non applicable la fera
              disparaître du calcul d'avancement (l'historique est conservé). Es-tu sûr ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFlag(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFlagChange}>Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EtapeQuestion({
  question,
  value,
  onChange,
  children,
}: {
  question: string;
  value: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{question}</span>
        <RadioGroup
          value={value ? "oui" : "non"}
          onValueChange={(v) => onChange(v === "oui")}
          className="flex gap-3"
        >
          <label className="flex cursor-pointer items-center gap-1 text-xs">
            <RadioGroupItem value="oui" /> Oui
          </label>
          <label className="flex cursor-pointer items-center gap-1 text-xs">
            <RadioGroupItem value="non" /> Non
          </label>
        </RadioGroup>
      </div>
      {children && <div className="mt-2 pl-2">{children}</div>}
    </div>
  );
}
