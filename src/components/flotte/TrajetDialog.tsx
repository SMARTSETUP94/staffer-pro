import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
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
  useVehicules, useAdressesFavorites, type Trajet,
} from "@/hooks/use-vehicules";
import { getChauffeursAvecStatut } from "@/hooks/use-trajets";
import { useSousTraitants } from "@/hooks/use-sous-traitants";
import type { Tables } from "@/integrations/supabase/types";
import type { Permis } from "@/lib/permis";

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
  /** v0.18.1 — catégories de permis (utilisées pour filtrer compatibilité véhicule). */
  categories_permis?: Permis[] | null;
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
  /** v0.18.1 — préremplissage depuis suggestion auto (montage/démontage). */
  defaultAdresseDepart?: string;
  defaultAdresseArrivee?: string;
  defaultCategorie?: TrajetCategorie;
  defaultAffaireId?: string | null;
  affaires: AffaireLite[];
  employesLivreurs: EmployeLite[];
  onSaved: () => void;
}

export function TrajetDialog({
  open, onOpenChange, trajet, defaultDate, defaultVehiculeId,
  defaultAdresseDepart, defaultAdresseArrivee, defaultCategorie, defaultAffaireId,
  affaires, employesLivreurs, onSaved,
}: Props) {
  const { isAdmin } = useAuth();
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
  const [prestataire, setPrestataire] = useState("");
  const [demandeText, setDemandeText] = useState("");
  const [saving, setSaving] = useState(false);
  const [autorisesIds, setAutorisesIds] = useState<Set<string>>(new Set());
  const [authorizingId, setAuthorizingId] = useState<string | null>(null);

  const vehiculeSel = useMemo(
    () => vehicules.find((v) => v.id === vehiculeId) ?? null,
    [vehicules, vehiculeId],
  );

  // Charge les chauffeurs autorisés pour le PL sélectionné
  const refreshAutorises = async (vehId: string) => {
    const { data } = await supabase
      .from("vehicule_chauffeurs_autorises")
      .select("employe_id")
      .eq("vehicule_id", vehId);
    setAutorisesIds(new Set((data ?? []).map((r: { employe_id: string }) => r.employe_id)));
  };

  useEffect(() => {
    if (!vehiculeSel || vehiculeSel.type !== "poids_lourd") {
      setAutorisesIds(new Set());
      return;
    }
    void refreshAutorises(vehiculeSel.id);
  }, [vehiculeSel]);

  const chauffeursAvecStatut = useMemo(
    () => getChauffeursAvecStatut(vehiculeSel, employesLivreurs, autorisesIds),
    [vehiculeSel, employesLivreurs, autorisesIds],
  );

  const aAutoriser = useMemo(
    () => chauffeursAvecStatut.filter((c) => c.statut === "non_autorise"),
    [chauffeursAvecStatut],
  );

  async function handleAutoriser(employeId: string) {
    if (!vehiculeSel) return;
    setAuthorizingId(employeId);
    try {
      const nextIds = Array.from(new Set([...Array.from(autorisesIds), employeId]));
      const { error } = await supabase.rpc("set_vehicule_chauffeurs_autorises", {
        _vehicule_id: vehiculeSel.id,
        _employe_ids: nextIds,
      });
      if (error) throw error;
      await refreshAutorises(vehiculeSel.id);
      const emp = employesLivreurs.find((e) => e.id === employeId);
      toast.success(
        emp ? `${emp.prenom} ${emp.nom} autorisé(e) sur ${vehiculeSel.nom}` : "Chauffeur autorisé",
      );
    } catch (e) {
      toast.error("Autorisation impossible", { description: (e as Error).message });
    } finally {
      setAuthorizingId(null);
    }
  }

  const chauffeurIncompatible =
    chauffeurId &&
    !chauffeursAvecStatut.some((c) => c.employe.id === chauffeurId && c.statut === "ok");

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
      setAllerRetour(trajet.aller_retour ?? false);
      setSousTraitance(trajet.statut_soustraitance !== "non");
      setPrestataire(trajet.prestataire ?? "");
      setDemandeText(trajet.notes ?? "");
    } else {
      setVehiculeId(defaultVehiculeId ?? null);
      setChauffeurId(null);
      setAffaireId(defaultAffaireId ?? null);
      setDate(defaultDate ?? new Date().toISOString().slice(0, 10));
      setHeureDepart("08:00");
      setHeureArrivee("");
      setAdresseDepart(defaultAdresseDepart ?? "");
      setAdresseArrivee(defaultAdresseArrivee ?? "");
      setAdresseDepartFavId(null);
      setAdresseArriveeFavId(null);
      setCategorie(defaultCategorie ?? "autre");
      setKilometrage("");
      setNotes("");
      setAllerRetour(false);
      // v0.18.1 — Si pas de véhicule passé, on présume "création depuis bouton + S/T"
      setSousTraitance(!defaultVehiculeId);
      setPrestataire("");
      setDemandeText("");
    }
  }, [open, trajet, defaultDate, defaultVehiculeId, defaultAdresseDepart, defaultAdresseArrivee, defaultCategorie, defaultAffaireId]);

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
      const statutSt: SoustraitanceStatut = sousTraitance
        ? trajet?.statut_soustraitance && trajet.statut_soustraitance !== "non"
          ? trajet.statut_soustraitance // garde le statut courant (devis_envoye, confirme) lors d'une édition
          : "a_sous_traiter"
        : "non";
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
        prestataire: sousTraitance ? (prestataire.trim() || null) : null,
        aller_retour: allerRetour,
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
      // ON DELETE CASCADE en DB : supprime aussi automatiquement les trajets enfants (retour lié)
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
                    {chauffeursAvecStatut.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Aucun livreur actif. Coche « Livreur/Chauffeur » sur une fiche employé.
                      </div>
                    ) : (
                      chauffeursAvecStatut.map((c) => (
                        <SelectItem
                          key={c.employe.id}
                          value={c.employe.id}
                          disabled={c.statut !== "ok"}
                        >
                          <span className="flex items-center gap-2">
                            <span>{c.employe.prenom} {c.employe.nom}</span>
                            {c.raison && (
                              <span className="text-[10px] text-muted-foreground">
                                — {c.raison}
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {chauffeurIncompatible && (
                  <p className="mt-1 text-[10px] text-destructive">
                    Ce chauffeur n'est pas compatible avec le véhicule.
                  </p>
                )}
                {vehiculeSel?.type === "poids_lourd" && aAutoriser.length > 0 && (
                  <div className="mt-2 rounded-md border border-warning/40 bg-warning/5 p-2">
                    <p className="text-[10px] font-semibold text-foreground mb-1">
                      Livreurs à autoriser sur ce PL
                    </p>
                    <div className="space-y-1">
                      {aAutoriser.map((c) => (
                        <div
                          key={c.employe.id}
                          className="flex items-center justify-between gap-2 text-[11px]"
                        >
                          <span className="truncate">
                            🔒 {c.employe.prenom} {c.employe.nom}
                          </span>
                          {isAdmin ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px]"
                              disabled={authorizingId === c.employe.id}
                              onClick={() => handleAutoriser(c.employe.id)}
                            >
                              {authorizingId === c.employe.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <ShieldCheck className="h-3 w-3 mr-1" />
                                  Autoriser
                                </>
                              )}
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              admin requis
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
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
              onValueChange={(v, favId) => {
                setAdresseDepart(v);
                setAdresseDepartFavId(favId ?? null);
              }}
              favorites={adresses}
              favoriteId={adresseDepartFavId}
              placeholder="Ex : 12 rue de Paris, 75001 Paris"
            />
          </div>

          <div>
            <Label>Adresse d'arrivée *</Label>
            <AddressAutocomplete
              value={adresseArrivee}
              onValueChange={(v, favId) => {
                setAdresseArrivee(v);
                setAdresseArriveeFavId(favId ?? null);
              }}
              favorites={adresses}
              favoriteId={adresseArriveeFavId}
              placeholder="Ex : 50 av. des Champs-Élysées, 75008 Paris"
            />
          </div>

          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <Switch id="ar" checked={allerRetour} onCheckedChange={setAllerRetour} />
            <Label htmlFor="ar" className="text-sm cursor-pointer">
              Aller-retour
              {!isEdit && (
                <span className="ml-2 text-xs text-muted-foreground">
                  (crée un trajet retour lié)
                </span>
              )}
            </Label>
          </div>

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
            <>
              <div>
                <Label htmlFor="prestataire">Prestataire transporteur</Label>
                <PrestataireAutocomplete value={prestataire} onChange={setPrestataire} />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Tape pour rechercher dans le carnet ou saisis un nouveau nom.
                </p>
              </div>
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
                    Ce trajet sera listé dans <code>Logistique → Demandes transport</code> tant qu'il n'est pas marqué comme confirmé.
                  </AlertDescription>
                </Alert>
              </div>
            </>
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
