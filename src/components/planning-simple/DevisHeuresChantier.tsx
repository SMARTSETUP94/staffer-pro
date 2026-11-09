import { useEffect, useState } from "react";
import { useSelectionDevis, r1 } from "./useSelectionDevis";
import { Link } from "@tanstack/react-router";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type DevisHeures } from "@/lib/planning-devis-heures.functions";

const STATUTS: Record<string, string> = { brouillon: "brouillon", a_valider: "à valider", valide: "validé", transfere: "transféré", signe: "signé", refuse: "refusé" };

/** Devis du chantier avec leurs heures : sert à remplir « Heures prévues » (global ou métier). */
export function DevisHeuresChantier({ affaireId, metierId, metiers, disabled, current, onUse }: {
  current?: string; affaireId: string; metierId: number | null; metiers: { id: number; libelle: string }[]; disabled: boolean; onUse: (h: number) => void;
}) {
  const { q, exclus, objExclus, setExclus, setObjExclus: setObj, effectif, somme } = useSelectionDevis(affaireId);
  const [choix, setChoix] = useState<DevisHeures | null>(null);
  // Reprise automatique des heures du premier devis quand le champ est vide.
  useEffect(() => {
    const d = q.data?.[0];
    if (disabled || !d || (current && current.trim() !== "")) return;
    const e = effectif(d);
    const h = metierId != null ? r1(e[String(metierId)] ?? 0) : somme(e);
    if (h > 0) onUse(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, metierId, disabled]);
  const totalObjet = (o: DevisHeures["objets"][number]) => r1(Object.entries(o.heures).filter(([k]) => !exclus.includes(k)).reduce((s, [, v]) => s + v, 0));
  const nom = (k: string) => metiers.find((m) => String(m.id) === k)?.libelle ?? `Métier ${k}`;
  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium"><FileText className="h-4 w-4" />Devis du chantier</div>
      {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : q.error ? <p className="text-destructive">Devis indisponibles.</p>
        : !q.data?.length ? <p className="text-muted-foreground">Aucun devis rattaché à ce chantier.</p>
        : <ul className="space-y-2">{q.data.map((d) => {
          const e = effectif(d); const nEx = (objExclus[d.id] ?? []).length;
          const h = metierId != null ? r1(e[String(metierId)] ?? 0) : somme(e);
          return <li key={d.id} className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><strong>{d.numero}</strong> · {STATUTS[d.statut] ?? d.statut}{d.source === "import" ? " · import" : ""} · <strong>{h} h</strong> ({r1(h / 8)} j/h){metierId != null ? "" : ` sélectionnées sur ${d.total} h`}</span>
              <span className="flex gap-1">
                {d.objets.length > 0 && <Button size="sm" variant="ghost" onClick={() => setChoix(d)}>Objets {d.objets.length - nEx}/{d.objets.length}</Button>}
                {d.source === "staffing" && <Button asChild size="sm" variant="ghost"><Link to="/affaires/$affaireId/devis" params={{ affaireId }}>Voir</Link></Button>}
                {!disabled && <Button size="sm" variant="outline" onClick={() => onUse(h)}>Reprendre {h} h</Button>}
              </span>
            </div>
            {metierId == null && <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">{Object.entries(e).filter(([, v]) => v > 0).map(([k, v]) => <label key={k} className={"flex items-center gap-1 " + (exclus.includes(k) ? "text-muted-foreground line-through" : "")}><input type="checkbox" checked={!exclus.includes(k)} onChange={(e) => setExclus((x) => e.target.checked ? x.filter((y) => y !== k) : [...x, k])} />{nom(k)} {r1(v)} h ({r1(v / 8)} j/h)</label>)}</div>}
          </li>;
        })}</ul>}
      <Dialog open={!!choix} onOpenChange={(o) => { if (!o) setChoix(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Objets à planifier · {choix?.numero}</DialogTitle>
            <DialogDescription>Décochez les objets faits dans un second temps : leurs heures sont retirées.</DialogDescription></DialogHeader>
          {choix && (() => { const ex = objExclus[choix.id] ?? []; const set = (v: string[]) => setObj(choix.id, v);
            return <div className="space-y-1 text-sm">
              <div className="flex gap-2 pb-2"><Button size="sm" variant="outline" onClick={() => set([])}>Tout cocher</Button><Button size="sm" variant="outline" onClick={() => set(choix.objets.map((o) => o.id))}>Tout décocher</Button></div>
              {choix.objets.map((o) => { const on = !ex.includes(o.id); return <label key={o.id} className={"flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/50 " + (on ? "" : "text-muted-foreground line-through")}>
                <span className="flex items-center gap-2"><input type="checkbox" checked={on} onChange={(ev) => set(ev.target.checked ? ex.filter((y) => y !== o.id) : [...ex, o.id])} />{o.libelle}</span>
                <span className="shrink-0 text-xs">{metierId != null ? r1(o.heures[String(metierId)] ?? 0) : totalObjet(o)} h</span></label>; })}
            </div>; })()}
          <DialogFooter><Button onClick={() => { const d = choix; setChoix(null); if (d && !disabled) { const e = effectif(d); onUse(metierId != null ? r1(e[String(metierId)] ?? 0) : somme(e)); } }}>Appliquer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
