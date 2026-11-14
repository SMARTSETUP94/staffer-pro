/** Indicateur qualité L4 (pur) : complétude des étapes à venir et justesse des propositions IA. */
export type EtapeQualite = { type: string; heure_debut: string | null; lieu_id: string | null; lieu_libre: string | null; vehicule_id: string | null; responsable: string | null; source_type: string | null; statut: string };
export type FeedbackQualite = { propose: unknown; retenu: unknown };

const AVEC_VEHICULE = new Set(["appro", "livraison", "chargement", "dechargement", "rotation"]);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

export function indicateurQualite(etapes: EtapeQualite[], feedbacks: FeedbackQualite[]) {
  const e = etapes.filter((x) => x.statut !== "annule");
  const v = e.filter((x) => AVEC_VEHICULE.has(x.type));
  const cle = (x: any) => `${x?.type ?? ""}|${x?.date ?? ""}`;
  let proposees = 0; let gardees = 0; let heuresJustes = 0; let heuresAttendues = 0;
  for (const f of feedbacks) {
    const p = Array.isArray(f.propose) ? (f.propose as any[]) : []; const r = Array.isArray(f.retenu) ? (f.retenu as any[]) : [];
    const pc = new Map(p.map((x) => [cle(x), x]));
    proposees += p.length;
    // Les anciennes corrections n'enregistraient pas l'heure proposée : elles ne comptent pas pour les heures.
    const avecHeures = p.some((x) => x && typeof x === "object" && "heure_debut" in x);
    for (const x of r) {
      const y = pc.get(cle(x));
      if (y) gardees++;
      if (avecHeures && x?.heure_debut) { heuresAttendues++; if (y && String(y.heure_debut ?? "").slice(0, 5) === String(x.heure_debut).slice(0, 5)) heuresJustes++; }
    }
  }
  return {
    etapes: e.length,
    heure: pct(e.filter((x) => x.heure_debut).length, e.length),
    lieu_connu: pct(e.filter((x) => x.lieu_id).length, e.length),
    lieu_renseigne: pct(e.filter((x) => x.lieu_id || (x.lieu_libre ?? "").trim()).length, e.length),
    vehicule: pct(v.filter((x) => x.vehicule_id).length, v.length),
    responsable: pct(e.filter((x) => (x.responsable ?? "").trim()).length, e.length),
    source: pct(e.filter((x) => x.source_type).length, e.length),
    ia_gardees: pct(gardees, proposees),
    ia_heures: pct(heuresJustes, heuresAttendues),
    corrections: feedbacks.length,
  };
}
