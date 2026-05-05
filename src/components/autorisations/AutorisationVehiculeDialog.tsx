// Sprint 3b.1 — Modale d'édition d'une autorisation véhicule (création / mise à jour)
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  ALL_AUTORISATIONS,
  AUTORISATION_LABELS,
  type AutorisationType,
  type AutorisationVehicule,
} from "@/lib/autorisations-vehicules";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeId: string;
  existing?: AutorisationVehicule | null;
  initialType?: AutorisationType;
  onSaved?: () => void;
}

export function AutorisationVehiculeDialog({
  open,
  onOpenChange,
  employeId,
  existing,
  initialType,
  onSaved,
}: Props) {
  const [type, setType] = useState<AutorisationType>("PERMIS_B");
  const [numero, setNumero] = useState("");
  const [dateObtention, setDateObtention] = useState("");
  const [dateExpiration, setDateExpiration] = useState("");
  const [fichierUrl, setFichierUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType(existing?.type_autorisation ?? initialType ?? "PERMIS_B");
      setNumero(existing?.numero ?? "");
      setDateObtention(existing?.date_obtention ?? "");
      setDateExpiration(existing?.date_expiration ?? "");
      setFichierUrl(existing?.fichier_url ?? "");
      setNotes(existing?.notes ?? "");
    }
  }, [open, existing, initialType]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        employe_id: employeId,
        type_autorisation: type,
        numero: numero.trim() || null,
        date_obtention: dateObtention || null,
        date_expiration: dateExpiration || null,
        fichier_url: fichierUrl.trim() || null,
        notes: notes.trim() || null,
      };
      let error: { message: string } | null = null;
      if (existing) {
        const { error: e } = await supabase
          .from("employes_autorisations_vehicules")
          .update(payload)
          .eq("id", existing.id);
        error = e;
      } else {
        const { error: e } = await supabase
          .from("employes_autorisations_vehicules")
          .upsert(payload, { onConflict: "employe_id,type_autorisation" });
        error = e;
      }
      if (error) {
        toast.error("Erreur : " + error.message);
        return;
      }
      toast.success(existing ? "Autorisation mise à jour" : "Autorisation ajoutée");
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Modifier l'autorisation" : "Ajouter une autorisation"}
          </DialogTitle>
          <DialogDescription>
            Permis ou CACES avec numéro, dates d'obtention et d'expiration.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="type">Type d'autorisation *</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as AutorisationType)}
              disabled={!!existing}
            >
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_AUTORISATIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {AUTORISATION_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="numero">Numéro</Label>
            <Input
              id="numero"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="ex. 12AB34567"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="date_obtention">Date d'obtention</Label>
              <Input
                id="date_obtention"
                type="date"
                value={dateObtention}
                onChange={(e) => setDateObtention(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="date_expiration">Date d'expiration</Label>
              <Input
                id="date_expiration"
                type="date"
                value={dateExpiration}
                onChange={(e) => setDateExpiration(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fichier_url">Lien vers scan (URL)</Label>
            <Input
              id="fichier_url"
              type="url"
              value={fichierUrl}
              onChange={(e) => setFichierUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {existing ? "Enregistrer" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
