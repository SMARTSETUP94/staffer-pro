import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AddressAutocomplete } from "./AddressAutocomplete";
import {
  useVehicules, useAdressesFavorites, type Trajet, type Vehicule,
} from "@/hooks/use-vehicules";
import { getCompatibleChauffeurs } from "@/hooks/use-trajets";
import type { Tables } from "@/integrations/supabase/types";

type TrajetCategorie = Trajet["categorie"];
type SoustraitanceStatut = Trajet["statut_soustraitance"];

const CATEGORIE_LABEL: Record<TrajetCategorie, string> = {
  pose: "Pose",
  depose: "Dépose",
  livraison_fourniture: "Livraison de fournitures",
  recuperation_materiel: "Récupération de matériel",
  autre: "Autre",
};

interface EmployeLite {
  id: string;
  prenom: string;
  nom: string;
  est_livreur: boolean;
  actif: boolean;
}

interface AffaireLite {
  id: string;
  numero: string;
  nom: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  trajet: Trajet | null;
  defaultDate?: string;
  defaultVehiculeId?: string | null;
  affaires: AffaireLite[];
  employesLivreurs: EmployeLite[];
  onSaved: () => void;
}

export function TrajetDialog({
  open, onOpenChange, trajet, defaultDate, defaultVehiculeId,
  affaires, employesLivreurs, onSaved,
}: Props) {
  const { vehicules } = useVehicules();
  const { adresses } = useAdressesFavorites();

  const [vehiculeId, setVehiculeId] = useState<string | null>(null);
  const [chauffeurId, setChauffeurId] = useState<string | null>(null);
  const [affaireId, setAffaireId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [heureDepart, setHeureDepart] = useState("");
  const [heureArrivee, setHeureArrivee] = useState("");
  const [adresseDepart, setAdresseDepart] = useState("");
  const [adresseArrivee, setAdresseArrivee] = useState("");
  const [adresseDepartFavId, setAdresseDepartFavId] = useState<string | null>(null);
  const [adresseArriveeFavId, setAdresseArriveeFavId] = useState<string | null>(null);
  const [categorie, setCategorie] = useState<TrajetCategorie>("autre");
  const [kilometrage, setKilometrage] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [allerRetour, setAllerRetour] = useState(false);
  const [sousTraitance, setSousTraitance] = useState(false);
  const [demandeText, setDemandeText] = useState("");
  const [saving, setSaving] = useState(false);
  const [autorisesIds, setAutorisesIds] = useState<Set<string>>(new Set());

  const vehiculeSel = useMemo(
    () => vehicules.find((v) => v.id === vehiculeId) ?? null,
    [vehicules, vehiculeId],
  );

  // Charge les chauffeurs autorisés pour le PL sélectionné
  useEffect(() => {
    if (!vehiculeSel || vehiculeSel.type !== "poids_lourd") {
      setAutorisesIds(new Set());
      return;
    }
    void supabase
      .from("vehicule_chauffeurs_autorises")
      .select("employe_id")
      .eq("vehicule_id", vehiculeSel.id)
      .then(({ data }) => {
        setAutorisesIds(new Set((data ?? []).map((r: { employe_id: string }) => r.employe_id)));
      });
  }, [vehiculeSel]);

  const chauffeursCompatibles = useMemo(
    () => getCompatibleChauffeurs(vehiculeSel, employesLivreurs, autorisesIds),
    [vehiculeSel, employesLivreurs, autorisesIds],
  );

  const chauffeurIncompatible =
    chauffeurId && !chauffeursCompatibles.some((c) => c.id === chauffeurId);

  // Reset / hydrate when opened
  useEffect(() => {
    if (!open) return;
    if (trajet) {
      setVehiculeId(trajet.vehicule_id);
      setChauffeurId(trajet.chauffeur_id);
      setAffaireId(trajet.affaire_id);
      setDate(trajet.date);
      setHeureDepart(trajet.heure_depart ?? "");
      setHeureArrivee(trajet.heure_arrivee ?? "");
      setAdresseDepart(trajet.adresse_depart);
      setAdresseArrivee(trajet.adresse_arrivee);
      setAdresseDepartFavId(trajet.adresse_depart_favorite_id);
      setAdresseArriveeFavId(trajet.adresse_arrivee_favorite_id);
      setCategorie(trajet.categorie);
      setKilometrage(trajet.kilometrage?.toString() ?? "");
      setNotes(trajet.notes ?? "");
      setAllerRetour(false);
      setSousTraitance(trajet.statut_soustraitance !== "non");
      setDemandeText(trajet.notes ?? "");
    } else {
      setVehiculeId(defaultVehiculeId ?? null);
      setChauffeurId(null);
      setAffaireId(null);
      setDate(defaultDate ?? new Date().toISOString().slice(0, 10));
      setHeureDepart("08:00");
      setHeureArrivee("");
      setAdresseDepart("");
      setAdresseArrivee("");
      setAdresseDepartFavId(null);
      setAdresseArriveeFavId(null);
      setCategorie("autre");
      setKilometrage("");
      setNotes("");
      setAllerRetour(false);
      setSousTraitance(false);
      setDemandeText("");
    }
  }, [open, trajet, defaultDate, defaultVehiculeId]);

  const isEdit = !!trajet;
  const vehiculesActifs = vehicules.filter((v) => v.actif);

  async function handleSave() {
    if (!date || !adresseDepart.trim() || !adresseArrivee.trim()) {
      toast.error("Date, adresse de départ et adresse d'arrivée sont obligatoires");
      return;
    }
    if (!sousTraitance && !vehiculeId) {
      toast.error("Choisis un véhicule (ou bascule en sous-traitance)");
      return;
    }

    setSaving(true);
    try {
      const statutSt: SoustraitanceStatut = sousTraitance ? "a_sous_traiter" : "non";
      const base = {
        vehicule_id: sousTraitance ? null : vehiculeId,
        chauffeur_id: sousTraitance ? null : chauffeurId,
        affaire_id: affaireId,
        date,
        heure_depart: heureDepart || null,
        heure_arrivee: heureArrivee || null,
        adresse_depart: adresseDepart,
        adresse_arrivee: adresseArrivee,
        adresse_depart_favorite_id: adresseDepartFavId,
        adresse_arrivee_favorite_id: adresseArriveeFavId,
        categorie,
        kilometrage: kilometrage ? parseFloat(kilometrage) : null,
        notes: sousTraitance ? demandeText || notes : notes,
        statut_soustraitance: statutSt,
      };

      if (isEdit && trajet) {
        const { error } = await supabase.from("trajets").update(base).eq("id", trajet.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from("trajets")
          .insert(base)
          .select("*")
          .single();
        if (error) throw error;

        // Aller-retour : crée le retour lié par parent_trajet_id
        if (allerRetour && inserted) {
          const { error: e2 } = await supabase.from("trajets").insert({
            ...base,
            adresse_depart: adresseArrivee,
            adresse_arrivee: adresseDepart,
            adresse_depart_favorite_id: adresseArriveeFavId,
            adresse_arrivee_favorite_id: adresseDepartFavId,
            heure_depart: null,
            heure_arrivee: null,
            parent_trajet_id: (inserted as Tables<"trajets">).id,
          });
          if (e2) throw e2;
        }
      }
      toast.success(isEdit ? "Trajet mis à jour" : "Trajet créé");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error("Échec de la sauvegarde", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!trajet) return;
    if (!window.confirm("Supprimer ce trajet ? Si un trajet retour est lié, il sera également supprimé.")) return;
    setSaving(true);
    try {
      // Supprime le retour lié si parent
      await supabase.from("trajets").delete().eq("parent_trajet_id", trajet.id);
      const { error } = await supabase.from("trajets").delete().eq("id", trajet.id);
      if (error) throw error;
      toast.success("Trajet supprimé");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error("Suppression impossible", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le trajet" : "Nouveau trajet"}</DialogTitle>
          <DialogDescription>
            Renseigne le véhicule, le chauffeur et le trajet. Active « sous-traitance » si tu n'as
            pas de ressource interne.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="flex items-center justify-between rounded-md border bg-warning/5 px-3 py-2">
            <div>
              <Label htmlFor="sst" className="text-sm font-semibold">Sous-traiter ce trajet</Label>
              <p className="text-xs text-muted-foreground">
                Génère une demande de devis à envoyer à un transporteur.
              </p>
            </div>
            <Switch id="sst" checked={sousTraitance} onCheckedChange={setSousTraitance} />
          </div>

          {!sousTraitance && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Véhicule *</Label>
                <Select value={vehiculeId ?? ""} onValueChange={(v) => { setVehiculeId(v); setChauffeurId(null); }}>
                  <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>
                    {vehiculesActifs.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nom} {v.immatriculation ? `(${v.immatriculation})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vehiculeSel?.type === "poids_lourd" && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Poids lourd : seuls les chauffeurs autorisés sont listés.
                  </p>
                )}
              </div>
              <div>
                <Label>Chauffeur</Label>
                <Select value={chauffeurId ?? ""} onValueChange={(v) => setChauffeurId(v || null)}>
                  <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>
                    {chauffeursCompatibles.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Aucun chauffeur compatible.
                      </div>
                    ) : (
                      chauffeursCompatibles.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.prenom} {c.nom}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {chauffeurIncompatible && (
                  <p className="mt-1 text-[10px] text-destructive">
                    Ce chauffeur n'est pas compatible avec le véhicule.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Heure départ</Label>
              <Input type="time" value={heureDepart} onChange={(e) => setHeureDepart(e.target.value)} />
            </div>
            <div>
              <Label>Heure arrivée</Label>
              <Input type="time" value={heureArrivee} onChange={(e) => setHeureArrivee(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Adresse de départ *</Label>
            <AddressAutocomplete
              value={adresseDepart}
              onChange={(v, fav) => {
                setAdresseDepart(v);
                setAdresseDepartFavId(fav?.id ?? null);
              }}
              favorites={adresses}
              placeholder="Ex : 12 rue de Paris, 75001 Paris"
            />
          </div>

          <div>
            <Label>Adresse d'arrivée *</Label>
            <AddressAutocomplete
              value={adresseArrivee}
              onChange={(v, fav) => {
                setAdresseArrivee(v);
                setAdresseArriveeFavId(fav?.id ?? null);
              }}
              favorites={adresses}
              placeholder="Ex : 50 av. des Champs-Élysées, 75008 Paris"
            />
          </div>

          {!isEdit && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <Switch id="ar" checked={allerRetour} onCheckedChange={setAllerRetour} />
              <Label htmlFor="ar" className="text-sm cursor-pointer">
                Aller-retour (crée un trajet retour lié)
              </Label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Affaire</Label>
              <Select value={affaireId ?? ""} onValueChange={(v) => setAffaireId(v || null)}>
                <SelectTrigger><SelectValue placeholder="Aucune" /></SelectTrigger>
                <SelectContent>
                  {affaires.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.numero} — {a.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Catégorie</Label>
              <Select value={categorie} onValueChange={(v) => setCategorie(v as TrajetCategorie)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Kilométrage</Label>
              <Input type="number" inputMode="decimal" value={kilometrage} onChange={(e) => setKilometrage(e.target.value)} placeholder="ex : 35" />
            </div>
          </div>

          {sousTraitance ? (
            <div>
              <Label>Demande de devis (texte à envoyer)</Label>
              <Textarea
                rows={4}
                value={demandeText}
                onChange={(e) => setDemandeText(e.target.value)}
                placeholder="Bonjour, nous cherchons un transporteur pour…"
              />
              <Alert className="mt-2 bg-warning/10 border-warning/40">
                <AlertDescription className="text-xs">
                  Ce trajet sera listé dans <code>/export/demandes-devis</code> tant qu'il n'est pas marqué comme envoyé.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {isEdit && (
              <Button variant="ghost" size="sm" onClick={handleDelete} disabled={saving}>
                <Trash2 className="h-4 w-4 mr-1.5 text-destructive" /> Supprimer
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
