/** Heures par objet de devis (objets de premier niveau), pour choisir les objets à planifier. Pur, sans montants. */
export type ObjetHeures = { id: string; libelle: string; heures: Record<string, number> };
type L = { id: string; parent_id: string | null; type: string; quantite: number; libelle: string | null; option?: boolean };
type H = { ligne_id: string; heures: number; par_unite: boolean; metier_id: number | null };
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Attribue les heures de chaque ligne à son objet de premier niveau (multiplié par la quantité si « par unité »,
 * même règle que calculerDevis). Le reste du total devis (lignes hors objet, lignes libres) va dans « Autres heures »,
 * pour que la somme des objets égale toujours le total par métier du devis.
 */
export function heuresParObjet(lignes: L[], heures: H[], totalMetier: Record<string, number>): ObjetHeures[] {
  const byId = new Map(lignes.map((l) => [l.id, l]));
  const objetDe = (id: string): string | null => {
    let top: string | null = null; let cur = byId.get(id);
    const vus = new Set<string>();
    while (cur && !vus.has(cur.id)) { vus.add(cur.id); if (cur.type === "objet") top = cur.id; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    return top;
  };
  const enOption = (id: string): boolean => {
    let cur = byId.get(id); const vus = new Set<string>();
    while (cur && !vus.has(cur.id)) { vus.add(cur.id); if (cur.option) return true; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    return false;
  };
  const map = new Map<string, ObjetHeures>();
  for (const h of heures) {
    const l = byId.get(h.ligne_id); if (!l || enOption(l.id)) continue;
    const o = objetDe(l.id); if (!o) continue;
    const k = h.par_unite ? Number(l.quantite) || 0 : 1;
    const m = h.metier_id == null ? "aucun" : String(h.metier_id);
    const obj = map.get(o) ?? { id: o, libelle: byId.get(o)?.libelle?.trim() || "Objet sans nom", heures: {} };
    obj.heures[m] = r2((obj.heures[m] ?? 0) + Number(h.heures) * k);
    map.set(o, obj);
  }
  const ordre = lignes.filter((l) => map.has(l.id)).map((l) => map.get(l.id)!);
  const reste: Record<string, number> = {};
  for (const [m, t] of Object.entries(totalMetier)) {
    const v = r2(t - ordre.reduce((s, o) => s + (o.heures[m] ?? 0), 0));
    if (Math.abs(v) >= 0.01) reste[m] = v;
  }
  if (Object.keys(reste).length) ordre.push({ id: "_autres", libelle: "Autres heures (hors objets)", heures: reste });
  return ordre;
}
