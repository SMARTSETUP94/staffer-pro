import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nbObjets: number;
  saving?: boolean;
  onSubmit: (nom: string) => void;
}

/** Regroupe les objets sélectionnés dans un nouveau lot de planification. */
export function GrouperLotDialog({ open, onOpenChange, nbObjets, saving, onSubmit }: Props) {
  const [nom, setNom] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setNom("");
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Grouper en lot</DialogTitle>
          <DialogDescription>
            {nbObjets} objet{nbObjets > 1 ? "s" : ""} seront rattachés à ce lot. Les heures restent
            portées par les objets.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="lot-nom">Nom du lot</Label>
          <Input
            id="lot-nom"
            value={nom}
            autoFocus
            onChange={(e) => setNom(e.target.value)}
            placeholder="Lot scène"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button disabled={nom.trim() === "" || saving} onClick={() => onSubmit(nom.trim())}>
            Créer le lot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
