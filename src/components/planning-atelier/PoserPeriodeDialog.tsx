import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { isJourFerieFR, isWeekend, labelJourFerieFR } from "@/lib/jours-feries";
import { generatePeriodeJoursOuvres, labelJourCourt } from "@/lib/planning-atelier";
import type { GrilleLot, GrilleMetier, GrilleObjet } from "@/lib/grille-fabrication";

const api = { isWeekend, isFerie: isJourFerieFR, labelFerie: labelJourFerieFR };

export interface PoserPeriodeValues {
  objet_id: string | null;
  lot_id: string | null;
  metier_id: number;
  dates: string[];
  nb_pers: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objets: GrilleObjet[];
  lots: GrilleLot[];
  metiers: GrilleMetier[];
  defaultDate: string;
  saving?: boolean;
  onSubmit: (values: PoserPeriodeValues) => void;
}

/** Geste principal : poser N personnes pendant N jours ouvrés sur un objet/lot. */
export function PoserPeriodeDialog({
  open, onOpenChange, objets, lots, metiers, defaultDate, saving, onSubmit,
}: Props) {
  const [cible, setCible] = useState<string>("");
  const [metierId, setMetierId] = useState<string>("");
  const [debut, setDebut] = useState(defaultDate);
  const [nbJours, setNbJours] = useState("5");
  const [nbPers, setNbPers] = useState("2");

  const dates = useMemo(
    () => generatePeriodeJoursOuvres(debut, Number(nbJours) || 0, api),
    [debut, nbJours],
  );
  const persValide = Number(nbPers) > 0;
  const valid = cible !== "" && metierId !== "" && dates.length > 0 && persValide;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) setDebut(defaultDate);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Poser une période</DialogTitle>
          <DialogDescription>
            Effectif prévisionnel anonyme. Les week-ends et jours fériés sont sautés.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Objet ou lot</Label>
            <Select value={cible} onValueChange={setCible}>
              <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                {lots.map((l) => (
                  <SelectItem key={l.id} value={`lot:${l.id}`}>Lot — {l.nom}</SelectItem>
                ))}
                {objets.map((o) => (
                  <SelectItem key={o.id} value={`objet:${o.id}`}>
                    {o.reference ? `${o.reference} — ` : ""}{o.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Métier</Label>
            <Select value={metierId} onValueChange={setMetierId}>
              <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                {metiers.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.libelle}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 space-y-1.5">
              <Label htmlFor="pp-debut">Début</Label>
              <Input id="pp-debut" type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-jours">Jours ouvrés</Label>
              <Input
                id="pp-jours" inputMode="numeric" value={nbJours}
                onChange={(e) => setNbJours(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-pers">Personnes</Label>
              <Input
                id="pp-pers" inputMode="numeric" value={nbPers}
                onChange={(e) => setNbPers(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>

          {dates.length > 0 && (
            <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
              {dates.length} jour{dates.length > 1 ? "s" : ""} :{" "}
              {labelJourCourt(dates[0]!)} → {labelJourCourt(dates[dates.length - 1]!)} ·{" "}
              <span className="font-medium text-foreground">
                {dates.length * (Number(nbPers) || 0) * 8} h planifiées
              </span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button
            disabled={!valid || saving}
            onClick={() =>
              onSubmit({
                objet_id: cible.startsWith("objet:") ? cible.slice(6) : null,
                lot_id: cible.startsWith("lot:") ? cible.slice(4) : null,
                metier_id: Number(metierId),
                dates,
                nb_pers: Number(nbPers),
              })
            }
          >
            Poser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
