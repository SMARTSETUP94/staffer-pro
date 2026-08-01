import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { GrilleMetier, GrilleObjet, OrigineHeure } from "@/lib/grille-fabrication";
import { parseHeures } from "@/lib/grille-fabrication";

export interface NouvelleLigne {
  objetId: string | null;
  nouvelObjetNom: string;
  metierId: number;
  heures: number;
  note: string | null;
  origine: OrigineHeure;
  sousTraitance: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objets: GrilleObjet[];
  metiers: GrilleMetier[];
  defaultMetierId?: number;
  saving?: boolean;
  onSubmit: (line: NouvelleLigne) => void;
}

/** « + Ligne » : ajoute une ligne objet × métier (chemin des tâches hors devis). */
export function AjouterLigneDialog({
  open, onOpenChange, objets, metiers, defaultMetierId, saving, onSubmit,
}: Props) {
  const [objetId, setObjetId] = useState<string>("__new__");
  const [nom, setNom] = useState("");
  const [metierId, setMetierId] = useState<string>(String(defaultMetierId ?? metiers[0]?.id ?? 1));
  const [heures, setHeures] = useState("");
  const [note, setNote] = useState("");
  const [origine, setOrigine] = useState<OrigineHeure>("ajout");
  const [sousTraitance, setSousTraitance] = useState(false);

  const parsed = useMemo(() => parseHeures(heures), [heures]);
  const nouvelObjet = objetId === "__new__";
  const valid = parsed !== null && (!nouvelObjet || nom.trim().length > 0);

  const reset = () => {
    setObjetId("__new__");
    setNom("");
    setHeures("");
    setNote("");
    setOrigine("ajout");
    setSousTraitance(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter une ligne</DialogTitle>
          <DialogDescription>
            Une ligne = un objet × un métier. Par défaut hors devis, chiffrable en supplément.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Objet</Label>
            <Select value={objetId} onValueChange={setObjetId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">＋ Nouvel objet</SelectItem>
                {objets.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.reference ? `${o.reference} — ` : ""}{o.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {nouvelObjet && (
            <div className="space-y-1.5">
              <Label htmlFor="grille-nom-objet">Nom du nouvel objet</Label>
              <Input
                id="grille-nom-objet"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Cloison fond de scène"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Métier</Label>
              <Select value={metierId} onValueChange={setMetierId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {metiers.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.libelle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grille-heures">Heures prévues</Label>
              <Input
                id="grille-heures"
                value={heures}
                inputMode="decimal"
                onChange={(e) => setHeures(e.target.value)}
                placeholder="8"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="grille-note">Libellé d'étape (optionnel)</Label>
            <Textarea
              id="grille-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Placage galva…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Origine</Label>
            <Select value={origine} onValueChange={(v) => setOrigine(v as OrigineHeure)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ajout">Ajout (hors devis)</SelectItem>
                <SelectItem value="devis">Devis</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={sousTraitance}
              onCheckedChange={(c) => setSousTraitance(c === true)}
            />
            Sous-traitance (exclue de la charge atelier)
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button
            disabled={!valid || saving}
            onClick={() =>
              onSubmit({
                objetId: nouvelObjet ? null : objetId,
                nouvelObjetNom: nom.trim(),
                metierId: Number(metierId),
                heures: parsed ?? 0,
                note: note.trim() === "" ? null : note.trim(),
                origine,
                sousTraitance,
              })
            }
          >
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
