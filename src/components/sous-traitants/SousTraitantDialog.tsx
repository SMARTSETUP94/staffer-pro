// Sprint 3b.2 — Modale création/édition sous-traitant
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SOUS_TRAITANT_TYPE_LABEL,
  validateSousTraitantInput,
  type SousTraitant,
  type SousTraitantType,
} from "@/lib/sous-traitants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: SousTraitant | null;
  defaultNom?: string;
  defaultType?: SousTraitantType;
  onSaved?: (st: SousTraitant) => void;
}

export function SousTraitantDialog({
  open,
  onOpenChange,
  existing,
  defaultNom,
  defaultType = "transport",
  onSaved,
}: Props) {
  const [nom, setNom] = useState("");
  const [type, setType] = useState<SousTraitantType>(defaultType);
  const [contactNom, setContactNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [adresse, setAdresse] = useState("");
  const [siret, setSiret] = useState("");
  const [tarifJour, setTarifJour] = useState("");
  const [tarifKm, setTarifKm] = useState("");
  const [notes, setNotes] = useState("");
  const [actif, setActif] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setNom(existing.nom);
      setType(existing.type);
      setContactNom(existing.contact_nom ?? "");
      setEmail(existing.email ?? "");
      setTelephone(existing.telephone ?? "");
      setAdresse(existing.adresse ?? "");
      setSiret(existing.siret ?? "");
      setTarifJour(existing.tarif_jour_eur != null ? String(existing.tarif_jour_eur) : "");
      setTarifKm(existing.tarif_km_eur != null ? String(existing.tarif_km_eur) : "");
      setNotes(existing.notes ?? "");
      setActif(existing.actif);
    } else {
      setNom(defaultNom ?? "");
      setType(defaultType);
      setContactNom("");
      setEmail("");
      setTelephone("");
      setAdresse("");
      setSiret("");
      setTarifJour("");
      setTarifKm("");
      setNotes("");
      setActif(true);
    }
  }, [open, existing, defaultNom, defaultType]);

  async function handleSave() {
    const input = {
      nom: nom.trim(),
      type,
      contact_nom: contactNom.trim() || null,
      email: email.trim() || null,
      telephone: telephone.trim() || null,
      adresse: adresse.trim() || null,
      siret: siret.trim() || null,
      tarif_jour_eur: tarifJour ? Number(tarifJour) : null,
      tarif_km_eur: tarifKm ? Number(tarifKm) : null,
      notes: notes.trim() || null,
      actif,
    };
    const err = validateSousTraitantInput(input);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    if (existing) {
      const { data, error } = await supabase
        .from("sous_traitants")
        .update(input)
        .eq("id", existing.id)
        .select("*")
        .single();
      setSaving(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Sous-traitant mis à jour.");
      onSaved?.(data as unknown as SousTraitant);
      onOpenChange(false);
    } else {
      const { data, error } = await supabase
        .from("sous_traitants")
        .insert(input)
        .select("*")
        .single();
      setSaving(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Sous-traitant ajouté.");
      onSaved?.(data as unknown as SousTraitant);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Modifier un sous-traitant" : "Nouveau sous-traitant"}</DialogTitle>
          <DialogDescription>
            Carnet partagé : utilisable depuis les trajets, demandes de transport et fabrication.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="st-nom">Nom *</Label>
            <Input id="st-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex : Transports Dupont" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as SousTraitantType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SOUS_TRAITANT_TYPE_LABEL) as SousTraitantType[]).map((t) => (
                    <SelectItem key={t} value={t}>{SOUS_TRAITANT_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3">
              <Label htmlFor="st-actif" className="cursor-pointer">Actif</Label>
              <Switch id="st-actif" checked={actif} onCheckedChange={setActif} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contact</Label>
              <Input value={contactNom} onChange={(e) => setContactNom(e.target.value)} placeholder="Ex : Jean Dupont" />
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Ex : 06 12 34 56 78" />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@transporteur.fr" />
          </div>
          <div>
            <Label>Adresse</Label>
            <Input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Ex : 12 rue X, 75001 Paris" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>SIRET</Label>
              <Input value={siret} onChange={(e) => setSiret(e.target.value)} placeholder="14 chiffres" />
            </div>
            <div>
              <Label>Tarif jour (€)</Label>
              <Input type="number" inputMode="decimal" value={tarifJour} onChange={(e) => setTarifJour(e.target.value)} placeholder="450" />
            </div>
            <div>
              <Label>Tarif km (€)</Label>
              <Input type="number" inputMode="decimal" value={tarifKm} onChange={(e) => setTarifKm(e.target.value)} placeholder="0.85" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Spécialités, zones desservies, conditions…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {existing ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
