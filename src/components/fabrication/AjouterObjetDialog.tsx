import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  useProfilesWithRoles,
  type FabricationFinitionType,
  FINITION_LABELS,
} from "@/hooks/use-fabrication";

interface DevisLot {
  id: string;
  numero: string;
  libelle: string | null;
}

interface Props {
  affaireId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const FINITIONS: FabricationFinitionType[] = ["aucune", "peinture", "tapisserie", "autre"];

export function AjouterObjetDialog({ affaireId, open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { profiles } = useProfilesWithRoles();
  const [nom, setNom] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [respoFabId, setRespoFabId] = useState<string>("none");
  const [typeFinition, setTypeFinition] = useState<FabricationFinitionType>("aucune");
  const [devisId, setDevisId] = useState<string>("none");
  const [commentaire, setCommentaire] = useState("");
  const [devisLots, setDevisLots] = useState<DevisLot[]>([]);
  const [saving, setSaving] = useState(false);

  const respoFabEligibles = profiles.filter((p) => p.est_respo_fab);

  useEffect(() => {
    if (!open || !affaireId) return;
    void supabase
      .from("devis")
      .select("id, numero, libelle")
      .eq("affaire_id", affaireId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const lots = (data ?? []) as DevisLot[];
        setDevisLots(lots);
        if (lots.length === 1) setDevisId(lots[0].id);
      });
  }, [open, affaireId]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setNom("");
      setQuantite(1);
      setRespoFabId("none");
      setTypeFinition("aucune");
      setDevisId("none");
      setCommentaire("");
    }
  }, [open]);

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
    const { error } = await supabase.from("fabrication_objets").insert({
      affaire_id: affaireId,
      devis_id: devisId === "none" ? null : devisId,
      nom: nom.trim(),
      quantite,
      respo_fab_id: respoFabId === "none" ? null : respoFabId,
      type_finition: typeFinition,
      commentaire: commentaire.trim() || null,
      created_by: user?.id ?? null,
      reference: "", // sera généré par le trigger BEFORE INSERT
    });
    setSaving(false);
    if (error) {
      toast.error("Création impossible", { description: error.message });
      return;
    }
    toast.success("Objet créé", { description: "Les 4 étapes ont été initialisées automatiquement." });
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un objet de fabrication</DialogTitle>
          <DialogDescription>
            La référence FAB-AAAA-NNNNN sera générée automatiquement. Les 4 étapes (BE, Respo Fab, Finition, Manutention)
            seront créées en statut « À faire ».
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="nom">Nom de l'objet *</Label>
            <Input
              id="nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex : Bar zinc 3m, Banquette tissus, Plinthe MDF…"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="quantite">Quantité *</Label>
              <Input
                id="quantite"
                type="number"
                min={1}
                value={quantite}
                onChange={(e) => setQuantite(Math.max(1, parseInt(e.target.value || "1", 10)))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Type de finition</Label>
              <Select value={typeFinition} onValueChange={(v) => setTypeFinition(v as FabricationFinitionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FINITIONS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {FINITION_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Responsable fabrication (optionnel)</Label>
            <Select value={respoFabId} onValueChange={setRespoFabId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un respo fab" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Non assigné —</SelectItem>
                {respoFabEligibles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {respoFabEligibles.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Aucun utilisateur avec le rôle « Respo Fab ». Configurez-le dans Paramètres → Rôles fabrication.
              </p>
            )}
          </div>

          {devisLots.length > 1 && (
            <div className="grid gap-2">
              <Label>Lot de devis (optionnel)</Label>
              <Select value={devisId} onValueChange={setDevisId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Aucun lot —</SelectItem>
                  {devisLots.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.numero}
                      {d.libelle ? ` — ${d.libelle}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="commentaire">Commentaire / dimensions (optionnel)</Label>
            <Textarea
              id="commentaire"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Notes sur dimensions, matériaux, finitions…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer l'objet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
