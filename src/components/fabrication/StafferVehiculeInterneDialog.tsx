import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Truck } from "lucide-react";
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useVehicules } from "@/hooks/use-vehicules";
import type { Database } from "@/integrations/supabase/types";

type VehiculeType = Database["public"]["Enums"]["vehicule_type"];
type TrajetCategorie = Database["public"]["Enums"]["trajet_categorie"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  affaireId: string;
  affaireNumero: string;
  affaireNom: string;
  affaireLieu: string | null;
  dateMontage: string | null;
  /** Nombre d'objets non archivés dans l'affaire (pour suggestion). */
  objetsCount: number;
  onCreated?: () => void;
}

interface AdresseFavorite {
  id: string;
  nom: string;
  adresse_complete: string;
  type: Database["public"]["Enums"]["adresse_favorite_type"];
}

interface EmployeLite {
  id: string;
  prenom: string;
  nom: string;
}

/** Règle de suggestion simple : <5 objets = VL, 5-15 = M3_20, >15 = poids lourd. */
function suggererTypeVehicule(count: number): VehiculeType {
  if (count <= 5) return "VL";
  if (count <= 15) return "M3_20";
  return "poids_lourd";
}

const TYPE_LABEL: Record<VehiculeType, string> = {
  VL: "Véhicule léger",
  M3_20: "Camion 20m³",
  poids_lourd: "Poids lourd",
};

export function StafferVehiculeInterneDialog({
  open,
  onOpenChange,
  affaireId,
  affaireNumero,
  affaireNom,
  affaireLieu,
  dateMontage,
  objetsCount,
  onCreated,
}: Props) {
  const navigate = useNavigate();
  const { vehicules } = useVehicules();
  const [adressesFav, setAdressesFav] = useState<AdresseFavorite[]>([]);
  const [chauffeurs, setChauffeurs] = useState<EmployeLite[]>([]);
  const [vehiculeId, setVehiculeId] = useState<string | null>(null);
  const [chauffeurId, setChauffeurId] = useState<string | null>(null);
  const [date, setDate] = useState<string>("");
  const [adresseDepart, setAdresseDepart] = useState<string>("");
  const [adresseArrivee, setAdresseArrivee] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const typeSuggere: VehiculeType = suggererTypeVehicule(objetsCount);

  // Initialisation au open
  useEffect(() => {
    if (!open) return;
    const dateSugg = dateMontage ?? format(addDays(new Date(), 2), "yyyy-MM-dd");
    setDate(dateSugg);
    setAdresseArrivee(affaireLieu ?? "");
    setVehiculeId(null);
    setChauffeurId(null);

    void (async () => {
      const [favRes, chRes] = await Promise.all([
        supabase
          .from("adresses_favorites")
          .select("id, nom, adresse_complete, type")
          .order("nom"),
        supabase
          .from("employes")
          .select("id, prenom, nom")
          .eq("est_livreur", true)
          .eq("actif", true)
          .order("nom"),
      ]);
      setAdressesFav((favRes.data ?? []) as AdresseFavorite[]);
      setChauffeurs((chRes.data ?? []) as EmployeLite[]);

      // Sélectionner adresse atelier comme départ par défaut
      const atelier = (favRes.data ?? []).find((a) => a.type === "atelier");
      if (atelier) setAdresseDepart(atelier.adresse_complete);
    })();
  }, [open, affaireLieu, dateMontage]);

  // Suggérer le premier véhicule actif du type suggéré
  useEffect(() => {
    if (!open || vehiculeId) return;
    const candidat = vehicules.find((v) => v.actif && v.type === typeSuggere);
    if (candidat) setVehiculeId(candidat.id);
  }, [open, vehicules, typeSuggere, vehiculeId]);

  const handleSubmit = async () => {
    if (!vehiculeId) {
      toast.error("Sélectionne un véhicule.");
      return;
    }
    if (!chauffeurId) {
      toast.error("Sélectionne un chauffeur.");
      return;
    }
    if (!adresseDepart.trim() || !adresseArrivee.trim()) {
      toast.error("Adresses de départ et d'arrivée requises.");
      return;
    }
    setSaving(true);
    const categorie: TrajetCategorie = "livraison_fourniture";
    const { error } = await supabase.from("trajets").insert({
      vehicule_id: vehiculeId,
      chauffeur_id: chauffeurId,
      affaire_id: affaireId,
      date,
      adresse_depart: adresseDepart.trim(),
      adresse_arrivee: adresseArrivee.trim(),
      categorie,
      statut_soustraitance: "non" as const,
      reference: "", // auto-générée par trigger
    });
    setSaving(false);
    if (error) {
      toast.error("Création trajet impossible", { description: error.message });
      return;
    }
    toast.success(`Trajet créé pour l'affaire ${affaireNumero}.`);
    onCreated?.();
    onOpenChange(false);
    navigate({ to: "/flotte" });
  };

  const vehiculesActifs = vehicules.filter((v) => v.actif);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" /> Staffer un véhicule interne
          </DialogTitle>
          <DialogDescription>
            Affaire {affaireNumero} — {affaireNom}. Type suggéré pour {objetsCount} objet
            {objetsCount > 1 ? "s" : ""} : <strong>{typeSuggere.replace(/_/g, " ")}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label>Véhicule</Label>
            <Select value={vehiculeId ?? ""} onValueChange={(v) => setVehiculeId(v || null)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un véhicule…" />
              </SelectTrigger>
              <SelectContent>
                {vehiculesActifs.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nom}
                    {v.type === typeSuggere && " ✨"}
                    {v.immatriculation && ` — ${v.immatriculation}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Chauffeur</Label>
            <Select value={chauffeurId ?? ""} onValueChange={(v) => setChauffeurId(v || null)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un chauffeur…" />
              </SelectTrigger>
              <SelectContent>
                {chauffeurs.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.prenom} {c.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chauffeurs.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Aucun chauffeur livreur actif. Active "est_livreur" sur un employé.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Adresse départ</Label>
            <Input
              value={adresseDepart}
              onChange={(e) => setAdresseDepart(e.target.value)}
              placeholder="Atelier ou adresse libre"
            />
            {adressesFav.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {adressesFav.slice(0, 4).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAdresseDepart(a.adresse_complete)}
                    className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                  >
                    {a.nom}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Adresse arrivée (chantier)</Label>
            <Input
              value={adresseArrivee}
              onChange={(e) => setAdresseArrivee(e.target.value)}
              placeholder="Adresse du chantier"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer le trajet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
