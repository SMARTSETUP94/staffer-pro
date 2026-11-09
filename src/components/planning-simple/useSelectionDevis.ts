import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lireHeuresDevisAffaire, type DevisHeures } from "@/lib/planning-devis-heures.functions";

export const r1 = (n: number) => Math.round(n * 10) / 10;
type Sel = { m: string[]; o: Record<string, string[]> };
const EVT = "atelier-selection-change";
const cle = (a: string) => `atelier-selection:${a}`;
const lire = (a: string): Sel => {
  try { const v = JSON.parse(localStorage.getItem(cle(a)) ?? "{}"); return { m: v.m ?? ["7", "8"], o: v.o ?? {} }; } catch { return { m: ["7", "8"], o: {} }; }
};

/** Retire les heures des objets exclus, par métier. */
export function heuresEffectives(d: DevisHeures, objExclus: string[]): Record<string, number> {
  if (!objExclus.length) return d.heures;
  const out = { ...d.heures };
  for (const o of d.objets) if (objExclus.includes(o.id)) for (const [k, v] of Object.entries(o.heures)) out[k] = r1((out[k] ?? 0) - v);
  return out;
}

/** Devis du chantier + sélection métiers/objets partagée entre le Gantt et la fenêtre « Planifier » (mémorisée sur l'appareil). */
export function useSelectionDevis(affaireId: string) {
  const lireFn = useServerFn(lireHeuresDevisAffaire);
  const q = useQuery({ queryKey: ["planning-devis-heures", affaireId], queryFn: () => lireFn({ data: { affaireId } }), staleTime: 60_000 });
  const [sel, setSel] = useState<Sel>({ m: ["7", "8"], o: {} });
  useEffect(() => {
    setSel(lire(affaireId));
    const f = (e: Event) => { if ((e as CustomEvent).detail === affaireId) setSel(lire(affaireId)); };
    window.addEventListener(EVT, f);
    return () => window.removeEventListener(EVT, f);
  }, [affaireId]);
  const ecrire = useCallback((s: Sel) => {
    try { localStorage.setItem(cle(affaireId), JSON.stringify(s)); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(EVT, { detail: affaireId }));
  }, [affaireId]);
  const setExclus = (f: (x: string[]) => string[]) => ecrire({ ...lire(affaireId), m: f(lire(affaireId).m) });
  const setObjExclus = (devisId: string, v: string[]) => { const s = lire(affaireId); ecrire({ ...s, o: { ...s.o, [devisId]: v } }); };
  const effectif = (d: DevisHeures) => heuresEffectives(d, sel.o[d.id] ?? []);
  const somme = (h: Record<string, number>) => r1(Object.entries(h).filter(([k]) => !sel.m.includes(k)).reduce((s, [, v]) => s + v, 0));
  return { q, exclus: sel.m, objExclus: sel.o, setExclus, setObjExclus, effectif, somme, principal: q.data?.[0] ?? null };
}
