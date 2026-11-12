import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PropositionChampsValeur = { ref: string; date_tarif: string; format_texte: string; longueur_mm: string; largeur_mm: string; epaisseur_mm: string };
export const champsVides = (): PropositionChampsValeur => ({ ref: "", date_tarif: new Date().toISOString().slice(0, 10), format_texte: "", longueur_mm: "", largeur_mm: "", epaisseur_mm: "" });

/** Champs complémentaires d'une proposition au catalogue (référence, date du prix, format, dimensions). */
export function PropositionChamps({ v, onChange }: { v: PropositionChampsValeur; onChange: (v: PropositionChampsValeur) => void }) {
  const set = (k: keyof PropositionChampsValeur) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...v, [k]: e.target.value });
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Input aria-label="Référence" placeholder="Référence" value={v.ref} onChange={set("ref")} />
      <Input aria-label="Date du prix" type="date" value={v.date_tarif} onChange={set("date_tarif")} />
      <Input aria-label="Format" placeholder="Format (ex. 2500×1220)" value={v.format_texte} onChange={set("format_texte")} />
      <Input aria-label="Longueur mm" placeholder="Long. mm" inputMode="decimal" value={v.longueur_mm} onChange={set("longueur_mm")} />
      <Input aria-label="Largeur mm" placeholder="Larg. mm" inputMode="decimal" value={v.largeur_mm} onChange={set("largeur_mm")} />
      <Input aria-label="Épaisseur mm" placeholder="Ép. mm" inputMode="decimal" value={v.epaisseur_mm} onChange={set("epaisseur_mm")} />
    </div>
  );
}

export function propositionPayload(v: PropositionChampsValeur, extra: Record<string, string> = {}) {
  const p: Record<string, string> = { ...extra };
  for (const [k, x] of Object.entries(v)) if (x.trim()) p[k] = x.replace(",", ".").trim();
  return p;
}

/** Proposer au catalogue une ligne hors catalogue déjà présente dans le devis. */
export function PropositionCatalogueDialog({ open, onOpenChange, designation, fournisseur, ref, couts, prix, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; designation: string; fournisseur: string | null; ref: string | null;
  couts: boolean; prix: number | null | undefined; onSubmit: (p: Record<string, string>) => Promise<boolean>;
}) {
  const [v, setV] = useState<PropositionChampsValeur>(() => ({ ...champsVides(), ref: ref ?? "" }));
  const [four, setFour] = useState(fournisseur ?? "");
  const [px, setPx] = useState(prix == null ? "" : String(prix));
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Proposer au catalogue</DialogTitle>
          <DialogDescription>« {designation} » sera soumis à un administrateur. Le devis n'est pas modifié ; le prix ne servira aux devis suivants qu'après validation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input aria-label="Fournisseur" placeholder="Fournisseur (nom libre si absent de la liste)" value={four} onChange={(e) => setFour(e.target.value)} />
          {couts && <Input aria-label="Prix d'achat" placeholder="Prix d'achat €" inputMode="decimal" value={px} onChange={(e) => setPx(e.target.value)} />}
          <PropositionChamps v={v} onChange={setV} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            const ok = await onSubmit(propositionPayload(v, { fournisseur: four.trim(), ...(couts && px.trim() ? { prix_achat: px.replace(",", ".").trim() } : {}) }));
            setBusy(false);
            if (ok) onOpenChange(false);
          }}>Proposer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
