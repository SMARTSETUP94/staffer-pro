import { useEffect, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { geocodeOnce } from "@/lib/nominatim";
import type { AdresseFavorite } from "@/hooks/use-vehicules";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  adresse: AdresseFavorite | null;
  onSaved: () => void;
}

const emptyDraft = {
  nom: "",
  adresse_complete: "",
  type: "autre" as AdresseFavorite["type"],
  latitude: null as number | null,
  longitude: null as number | null,
};

export function AdresseFavoriteDialog({ open, onOpenChange, adresse, onSaved }: Props) {
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (adresse) {
      setDraft({
        nom: adresse.nom,
        adresse_complete: adresse.adresse_complete,
        type: adresse.type,
        latitude: adresse.latitude ? Number(adresse.latitude) : null,
        longitude: adresse.longitude ? Number(adresse.longitude) : null,
      });
    } else {
      setDraft(emptyDraft);
    }
  }, [open, adresse]);

  const handleGeocode = async () => {
    if (!draft.adresse_complete.trim()) {
      toast.error("Saisis l'adresse complète d'abord");
      return;
    }
    setGeocoding(true);
    try {
      const result = await geocodeOnce(draft.adresse_complete);
      if (result) {
        setDraft((d) => ({ ...d, latitude: result.lat, longitude: result.lon }));
        toast.success("Coordonnées trouvées");
      } else {
        toast.warning("Adresse introuvable");
      }
    } finally {
      setGeocoding(false);
    }
  };

  const handleSave = async () => {
    if (!draft.nom.trim() || !draft.adresse_complete.trim()) {
      toast.error("Nom et adresse requis");
      return;
    }
    setSaving(true);
    try {
      // Tente un géocodage silencieux si pas encore fait
      let lat = draft.latitude;
      let lon = draft.longitude;
      if (lat === null || lon === null) {
        try {
          const res = await geocodeOnce(draft.adresse_complete);
          if (res) {
            lat = res.lat;
            lon = res.lon;
          }
        } catch {
          // silencieux
        }
      }

      const payload = {
        nom: draft.nom.trim(),
        adresse_complete: draft.adresse_complete.trim(),
        type: draft.type,
        latitude: lat,
        longitude: lon,
      };

      if (adresse) {
        const { error } = await supabase
          .from("adresses_favorites")
          .update(payload)
          .eq("id", adresse.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("adresses_favorites").insert(payload);
        if (error) throw error;
      }
      toast.success(adresse ? "Adresse modifiée" : "Adresse créée");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Sauvegarde impossible", { description: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{adresse ? "Modifier l'adresse" : "Nouvelle adresse favorite"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label>Nom court *</Label>
            <Input
              placeholder="ex Entrepôt Vitry"
              value={draft.nom}
              onChange={(e) => setDraft((d) => ({ ...d, nom: e.target.value }))}
            />
          </div>
          <div>
            <Label>Adresse complète *</Label>
            <Input
              placeholder="42 rue Edith Cavell, 94400 Vitry-sur-Seine"
              value={draft.adresse_complete}
              onChange={(e) =>
                setDraft((d) => ({ ...d, adresse_complete: e.target.value, latitude: null, longitude: null }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select
                value={draft.type}
                onValueChange={(v) => setDraft((d) => ({ ...d, type: v as AdresseFavorite["type"] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrepot">Entrepôt</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="fournisseur">Fournisseur</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleGeocode}
                disabled={geocoding}
              >
                {geocoding ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <MapPin className="h-3 w-3 mr-1" />}
                Géocoder
              </Button>
            </div>
          </div>
          {(draft.latitude !== null && draft.longitude !== null) && (
            <p className="text-xs text-muted-foreground">
              📍 {draft.latitude.toFixed(5)}, {draft.longitude.toFixed(5)}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
