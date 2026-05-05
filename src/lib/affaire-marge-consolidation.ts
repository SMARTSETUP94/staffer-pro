/**
 * v0.40.0e — Consolidation des lignes "v_devis_consommation" par métier.
 *
 * La vue retourne 1 ligne par (devis × métier). Pour la fiche affaire, le chef
 * veut voir 1 ligne par métier (somme tous devis) avec drilldown par devis.
 */

export interface RawConsoLine {
  devis_id: string | null;
  devis_numero: string | null;
  metier_id: number | null;
  metier: string | null;
  couleur: string | null;
  heures_prevues: number | null;
  heures_assignees: number | null;
  heures_reelles_validees: number | null;
  heures_reelles_soumises: number | null;
}

export interface DevisDetail {
  devis_id: string | null;
  devis_numero: string | null;
  prevues: number;
  staffees: number;
  validees: number;
  soumises: number;
  realisees: number;
  pctStaff: number;
  pctReal: number;
  pctValide: number;
  ecart: number;
  tone: "ok" | "warn" | "danger";
}

export interface MetierGroup {
  metier_id: number | null;
  metier: string | null;
  couleur: string | null;
  prevues: number;
  staffees: number;
  validees: number;
  soumises: number;
  realisees: number;
  pctStaff: number;
  pctReal: number;
  pctValide: number;
  ecart: number;
  tone: "ok" | "warn" | "danger";
  devis: DevisDetail[];
}

function tone(prevues: number, pctStaff: number, pctReal: number): "ok" | "warn" | "danger" {
  if (prevues <= 0) return "ok";
  const pctMax = Math.max(pctStaff, pctReal);
  if (pctMax > 100) return "danger";
  if (pctMax >= 85) return "warn";
  return "ok";
}

function enrich(prevues: number, staffees: number, validees: number, soumises: number) {
  const realisees = validees + soumises;
  const pctStaff = prevues > 0 ? (staffees / prevues) * 100 : 0;
  const pctReal = prevues > 0 ? (realisees / prevues) * 100 : 0;
  const pctValide = prevues > 0 ? (validees / prevues) * 100 : 0;
  const ecart = prevues - validees;
  return {
    realisees,
    pctStaff,
    pctReal,
    pctValide,
    ecart,
    tone: tone(prevues, pctStaff, pctReal),
  };
}

export function consolidateByMetier(lines: RawConsoLine[]): MetierGroup[] {
  const groups = new Map<string, MetierGroup>();

  for (const l of lines) {
    const key = l.metier_id != null ? `m-${l.metier_id}` : `n-${l.metier ?? "?"}`;
    const prevues = Number(l.heures_prevues ?? 0);
    const staffees = Number(l.heures_assignees ?? 0);
    const validees = Number(l.heures_reelles_validees ?? 0);
    const soumises = Number(l.heures_reelles_soumises ?? 0);
    const e = enrich(prevues, staffees, validees, soumises);

    const detail: DevisDetail = {
      devis_id: l.devis_id,
      devis_numero: l.devis_numero,
      prevues,
      staffees,
      validees,
      soumises,
      ...e,
    };

    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        metier_id: l.metier_id,
        metier: l.metier,
        couleur: l.couleur,
        prevues,
        staffees,
        validees,
        soumises,
        ...e,
        devis: [detail],
      });
    } else {
      g.prevues += prevues;
      g.staffees += staffees;
      g.validees += validees;
      g.soumises += soumises;
      const e2 = enrich(g.prevues, g.staffees, g.validees, g.soumises);
      g.realisees = e2.realisees;
      g.pctStaff = e2.pctStaff;
      g.pctReal = e2.pctReal;
      g.pctValide = e2.pctValide;
      g.ecart = e2.ecart;
      g.tone = e2.tone;
      g.devis.push(detail);
    }
  }

  // Tri : par heures prévues décroissantes (les plus gros métiers en haut).
  return Array.from(groups.values()).sort((a, b) => b.prevues - a.prevues);
}
