import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { bilanFileLogistique, appliquerTriFileLogistique } from "@/lib/server-fns/tri-file-logistique.functions";
import type { GroupeTri } from "@/lib/logistique/tri-file";

type Bilan = Awaited<ReturnType<typeof bilanFileLogistique>>;

/** Reclassement de la file par lots : bilan d'abord, puis confirmation explicite d'un admin. */
export function TriFileDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const lireBilan = useServerFn(bilanFileLogistique);
  const appliquer = useServerFn(appliquerTriFileLogistique);
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [choix, setChoix] = useState<Set<GroupeTri>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmer, setConfirmer] = useState(false);

  async function charger() {
    setBusy(true); setConfirmer(false);
    try { setBilan(await lireBilan()); setChoix(new Set()); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function valider() {
    if (!bilan) return;
    setBusy(true);
    try {
      const lots = bilan.groupes.filter((g) => choix.has(g.groupe)).map((g) => ({ groupe: g.groupe, nombre: g.nombre }));
      const r = await appliquer({ data: { confirmation: true, lots } });
      const n = Object.values(r.resultat).reduce((a, b) => a + b, 0);
      toast.success(`${n} mail(s) classé(s) sans suite`);
      onDone(); await charger();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  useEffect(() => { if (open && !bilan && !busy) void charger(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const nbChoisis = bilan?.groupes.filter((g) => choix.has(g.groupe)).reduce((a, g) => a + g.nombre, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reclasser la file</DialogTitle>
          <DialogDescription>Bilan des mails en attente qui ressemblent à des notifications. Rien n'est modifié avant votre confirmation ; les mails sont classés sans suite, jamais supprimés.</DialogDescription>
        </DialogHeader>
        {!bilan ? <p className="text-sm text-muted-foreground">{busy ? "Lecture de la file…" : "Bilan non chargé."}</p> : (
          <div className="space-y-3">
            <p className="text-sm">{bilan.total} mail(s) en attente ; {bilan.restant} restent à traiter à la main.</p>
            {bilan.groupes.length === 0 && <p className="text-sm text-muted-foreground">Aucun lot proposé.</p>}
            {bilan.groupes.map((g) => (
              <label key={g.groupe} className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <Checkbox checked={choix.has(g.groupe)} onCheckedChange={(c) => setChoix((s) => { const n = new Set(s); if (c) n.add(g.groupe); else n.delete(g.groupe); return n; })} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{g.libelle} — {g.nombre}</span>
                  <span className="block break-words text-xs text-muted-foreground">Ex. : {g.exemples.join(" · ")}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={charger} disabled={busy}>Relancer le bilan</Button>
          {!confirmer
            ? <Button onClick={() => setConfirmer(true)} disabled={busy || nbChoisis === 0}>Classer {nbChoisis || ""} sans suite…</Button>
            : <Button variant="destructive" onClick={valider} disabled={busy}>Confirmer le classement de {nbChoisis} mail(s)</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
