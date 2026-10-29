/**
 * Lot 1 « mode projet » — règles pures de l'équipe projet (testées).
 * Source de données : table affaire_roles (un titulaire par rôle et par affaire).
 */
import type { ProjetRole } from "@/lib/labels";

export const PROJET_ROLES: ProjetRole[] = [
  "charge_affaires", "concepteur", "responsable_projet",
  "chef_constructeur", "chef_finition", "chef_montage", "chef_demontage",
];

/** Rôles dont la période (dates) est éditable et affichée dans le planning de pilotage. */
export const ROLES_AVEC_PERIODE: ProjetRole[] = ["concepteur", "responsable_projet"];

export const PRESQUE_GAGNE_ALERTE_JOURS = 15;

export type Phases = { fabrication: boolean; montage_demontage: boolean };

/** Phases lues dans typologie_phases (ex. ["commercial_etude","fabrication","logistique"]). */
export function phasesFromList(list: readonly string[] | null | undefined): Phases {
  const s = new Set(list ?? []);
  return { fabrication: s.has("fabrication"), montage_demontage: s.has("montage") || s.has("demontage") };
}

/**
 * Typologie effective pour l'équipe projet : pour une opportunité (9XXX), la typologie future.
 */
export function typologieEffective(a: { typologie?: string | null; typologie_future?: string | null; phase?: string | null }): string | null {
  if (a.phase === "opportunite" || a.typologie === "prototype") return a.typologie_future ?? null;
  return a.typologie ?? null;
}

/** Rôles affichés pour une affaire selon ses phases. */
export function rolesVisibles(phases: Phases): ProjetRole[] {
  return PROJET_ROLES.filter((r) => {
    if (r === "chef_constructeur" || r === "chef_finition") return phases.fabrication;
    if (r === "chef_montage" || r === "chef_demontage") return phases.montage_demontage;
    return true;
  });
}

export type AffaireEtat = {
  phase: "opportunite" | "signe" | string | null;
  statut_opportunite?: string | null;
};

/** Rôles attendus (badges non bloquants « rôle à affecter ») selon l'avancement. */
export function rolesAttendus(etat: AffaireEtat, phases: Phases): ProjetRole[] {
  const out: ProjetRole[] = [];
  const s = etat.statut_opportunite;
  const signe = etat.phase === "signe";
  // « À l'étude » nécessite un concepteur/dessinateur (visite technique, repérage).
  if (signe || s === "a_l_etude" || s === "presque_gagne" || s === "gagne") out.push("concepteur");
  if (signe || s === "presque_gagne" || s === "gagne") out.push("responsable_projet");
  if (signe) {
    if (phases.fabrication) out.push("chef_constructeur", "chef_finition");
    if (phases.montage_demontage) out.push("chef_montage", "chef_demontage");
  }
  return out;
}

export function rolesManquants(etat: AffaireEtat, phases: Phases, affectes: Iterable<string>): ProjetRole[] {
  const set = new Set(affectes);
  return rolesAttendus(etat, phases).filter((r) => !set.has(r));
}

/** Alerte si l'opportunité est « Presque gagné » depuis plus de 15 jours. */
export function presqueGagneEnRetard(statut: string | null | undefined, depuis: string | null | undefined, now = new Date()): boolean {
  if (statut !== "presque_gagne" || !depuis) return false;
  const jours = (now.getTime() - new Date(depuis).getTime()) / 86_400_000;
  return jours > PRESQUE_GAGNE_ALERTE_JOURS;
}

export type Charge = { nb_en_cours: number; nb_potentielles: number };

/** « Nadège – 4 en cours (+3 potentielles) » : la charge potentielle n'est jamais additionnée. */
export function chargeLabel(nom: string, charge: Charge | undefined): string {
  if (!charge || (charge.nb_en_cours === 0 && charge.nb_potentielles === 0)) return nom;
  const pot = charge.nb_potentielles > 0 ? ` (+${charge.nb_potentielles} potentielle${charge.nb_potentielles > 1 ? "s" : ""})` : "";
  return `${nom} – ${charge.nb_en_cours} en cours${pot}`;
}

export type Referent = { employe_id: string; niveau: "principal" | "secondaire" };
export type EmployeLite = { id: string; nom: string; prenom: string | null; actif: boolean };
export type OptionGroupe = "principal" | "secondaire" | "autre";

/** Ordre du sélecteur : principaux, puis secondaires, puis autres employés actifs (alpha). */
export function ordonnerCandidats(employes: EmployeLite[], referents: Referent[]): { employe: EmployeLite; groupe: OptionGroupe }[] {
  const niveau = new Map(referents.map((r) => [r.employe_id, r.niveau]));
  const rank: Record<OptionGroupe, number> = { principal: 0, secondaire: 1, autre: 2 };
  return employes
    .filter((e) => e.actif)
    .map((e) => ({ employe: e, groupe: (niveau.get(e.id) ?? "autre") as OptionGroupe }))
    .sort((a, b) => rank[a.groupe] - rank[b.groupe] || nomComplet(a.employe).localeCompare(nomComplet(b.employe), "fr"));
}

export function nomComplet(e: { prenom: string | null; nom: string }): string {
  return [e.prenom, e.nom].filter(Boolean).join(" ");
}

export type DatesAffaire = {
  date_debut_production?: string | null; date_debut?: string | null;
  date_demontage?: string | null; date_fin_prevue?: string | null;
  date_montage?: string | null; date_evenement_debut?: string | null;
};

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Période proposée par le bouton « Planifier ».
 * - responsable projet : début production (ou début) → démontage (ou fin prévue) ;
 * - concepteur : 3 jours ouvrés à partir d'aujourd'hui, ou se terminant avant le début de production.
 */
export function periodeProposee(role: ProjetRole, a: DatesAffaire, today = new Date().toISOString().slice(0, 10)): { date_debut: string; date_fin: string } {
  if (role === "responsable_projet") {
    const debut = a.date_debut_production ?? a.date_debut ?? today;
    const fin = a.date_demontage ?? a.date_fin_prevue ?? addDaysIso(debut, 20);
    return { date_debut: debut, date_fin: fin < debut ? debut : fin };
  }
  const limite = a.date_debut_production ?? a.date_montage ?? null;
  if (limite && limite > today) {
    const debut = addDaysIso(limite, -3) < today ? today : addDaysIso(limite, -3);
    return { date_debut: debut, date_fin: addDaysIso(limite, -1) < debut ? debut : addDaysIso(limite, -1) };
  }
  return { date_debut: today, date_fin: addDaysIso(today, 2) };
}

export type Periode = { affaire_id: string; date_debut: string | null; date_fin: string | null };

/** Ids des affaires dont la période chevauche une autre affaire de la même personne. */
export function periodesEnChevauchement(periodes: Periode[]): Set<string> {
  const out = new Set<string>();
  const valides = periodes.filter((p) => p.date_debut);
  for (let i = 0; i < valides.length; i++) {
    for (let j = i + 1; j < valides.length; j++) {
      const a = valides[i], b = valides[j];
      if (a.affaire_id === b.affaire_id) continue;
      const aFin = a.date_fin ?? a.date_debut!, bFin = b.date_fin ?? b.date_debut!;
      if (a.date_debut! <= bFin && b.date_debut! <= aFin) { out.add(a.affaire_id); out.add(b.affaire_id); }
    }
  }
  return out;
}

export type AffichagePilotage = "plein" | "attenue" | "potentiel";

/** Rendu d'une barre selon le statut ; « potentiel » = hachuré, masqué par défaut, hors totaux. */
export function affichagePilotage(etat: AffaireEtat): AffichagePilotage | null {
  if (etat.phase === "signe") return "plein";
  if (etat.statut_opportunite === "gagne" || etat.statut_opportunite === "presque_gagne") return "attenue";
  if (etat.statut_opportunite === "a_faire" || etat.statut_opportunite === "envoye" || etat.statut_opportunite === "a_l_etude") return "potentiel";
  return null;
}
