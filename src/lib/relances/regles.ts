// Règles pures des relances commerciales (page « À relancer », panneau de relance, accueil).
// Le calcul de référence est en base (relances_a_faire) ; motifsRelance en est le miroir testable.
// Aucune fonction ici n'envoie quoi que ce soit : l'application ne prépare que des brouillons.

export const DELAIS_DEFAUT = { delai_envoi: 7, delai_validite: 7, delai_inactivite: 14 } as const;
export type Delais = { delai_envoi: number; delai_validite: number; delai_inactivite: number };

export type CodeMotif = "envoye_sans_reponse" | "action_en_retard" | "validite_proche" | "inactif" | "sans_prochaine_action";
export type Motif = { code: CodeMotif; priorite: number; jours: number | null };

/** Ordre retenu par Gabin (26/11) : la validité proche passe avant l'inactivité. */
export const MOTIFS: Record<CodeMotif, { priorite: number; libelle: string; court: string }> = {
  envoye_sans_reponse: { priorite: 1, libelle: "Devis envoyé sans réponse", court: "Sans réponse" },
  action_en_retard: { priorite: 2, libelle: "Prochaine action en retard", court: "Action en retard" },
  validite_proche: { priorite: 3, libelle: "Validité du devis bientôt expirée", court: "Validité proche" },
  inactif: { priorite: 4, libelle: "Sans action depuis longtemps", court: "Inactif" },
  sans_prochaine_action: { priorite: 5, libelle: "Aucune prochaine action", court: "Sans prochaine action" },
};

export function libelleMotif(m: Motif): string {
  const base = MOTIFS[m.code].libelle;
  if (m.jours == null) return base;
  if (m.code === "validite_proche") return m.jours === 0 ? `${base} (aujourd'hui)` : `${base} (dans ${m.jours} j)`;
  return `${base} (${m.jours} j)`;
}

const jour = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
const ecart = (a: string, b: string) => Math.round(jour(a) - jour(b));

export type CasRelance = {
  statut: "a_faire" | "envoye" | "a_l_etude" | "presque_gagne";
  date_envoi: string | null;            // date d'envoi du devis retenu, sinon dernière action devis_envoye
  derniere_action_ouverte: string | null; // dernière action non close (règle a_relancer du pipeline)
  derniere_action: string | null;       // dernière action, toutes confondues
  statut_depuis: string | null;
  prochaine_echeance: string | null;    // plus ancienne échéance non close
  validite_le: string | null;
  statut_devis: string | null;
};

/** Miroir de relances_a_faire : motifs triés par priorité. */
export function motifsRelance(c: CasRelance, aujourdhui: string, d: Delais = DELAIS_DEFAUT): Motif[] {
  const out: Motif[] = [];
  if (c.statut === "envoye" && c.date_envoi && ecart(aujourdhui, c.date_envoi) > d.delai_envoi
      && (!c.derniere_action_ouverte || c.derniere_action_ouverte.slice(0, 10) <= c.date_envoi))
    out.push({ code: "envoye_sans_reponse", priorite: 1, jours: ecart(aujourdhui, c.date_envoi) });
  if (c.prochaine_echeance && c.prochaine_echeance < aujourdhui)
    out.push({ code: "action_en_retard", priorite: 2, jours: ecart(aujourdhui, c.prochaine_echeance) });
  if (c.validite_le && (c.statut_devis === "valide" || c.statut_devis === "transfere")) {
    const j = ecart(c.validite_le, aujourdhui);
    if (j >= 0 && j <= d.delai_validite) out.push({ code: "validite_proche", priorite: 3, jours: j });
  }
  if (c.statut === "a_l_etude" || c.statut === "presque_gagne") {
    const ref = c.derniere_action?.slice(0, 10) ?? c.statut_depuis;
    if (ref && ecart(aujourdhui, ref) >= d.delai_inactivite) out.push({ code: "inactif", priorite: 4, jours: ecart(aujourdhui, ref) });
  }
  if (!c.prochaine_echeance) out.push({ code: "sans_prochaine_action", priorite: 5, jours: null });
  return out;
}

/** Tri de la page : priorité du premier motif, puis montant décroissant. */
export function trierRelances<T extends { motifs: Motif[]; montant_ht: number | null; numero: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.motifs[0]?.priorite ?? 9) - (b.motifs[0]?.priorite ?? 9)
    || (b.montant_ht ?? -1) - (a.montant_ht ?? -1) || a.numero.localeCompare(b.numero));
}

export function ajouterJours(iso: string, n: number): string {
  const t = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));
  return t.toISOString().slice(0, 10);
}
/** « Ignorer cette semaine » : jusqu'au dimanche de la semaine en cours (lundi = début). */
export function dimancheDeLaSemaine(iso: string): string {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 = dimanche
  return ajouterJours(iso, dow === 0 ? 0 : 7 - dow);
}
export const prochaineActionParDefaut = (aujourdhui: string) => ajouterJours(aujourdhui, 7);

export const CANAUX_RELANCE = [
  { valeur: "relance_email", libelle: "E-mail" },
  { valeur: "relance_tel", libelle: "Téléphone" },
  { valeur: "relance_autre", libelle: "Autre (visite, message…)" },
] as const;
export type CanalRelance = (typeof CANAUX_RELANCE)[number]["valeur"];

/** Au-delà, certains navigateurs ou Outlook coupent le lien : « Copier » reste la référence. */
export const MAILTO_LIMITE_CORPS = 1800;
export function lienOutlook(p: { a: string | null; objet: string; corps: string }): { href: string; tronqueRisque: boolean } {
  const q = `subject=${encodeURIComponent(p.objet)}&body=${encodeURIComponent(p.corps)}`;
  return { href: `mailto:${p.a ? encodeURIComponent(p.a).replace(/%40/g, "@") : ""}?${q}`, tronqueRisque: p.corps.length > MAILTO_LIMITE_CORPS };
}

export function texteAccueil(n: number): string {
  return n === 0 ? "Aucune relance cette semaine" : n === 1 ? "1 relance cette semaine" : `${n} relances cette semaine`;
}

export type LigneRelance = {
  affaire_id: string; numero: string; titre: string; client: string | null;
  contact: { nom: string; email: string | null } | null;
  charge_affaires_id: string | null; charge_affaires_nom: string | null;
  statut: CasRelance["statut"]; devis_id: string | null; devis_numero: string | null; version: number | null; statut_redaction: string | null;
  date_envoi: string | null; validite_le: string | null; montant_ht: number | null; source_montant: string | null;
  motifs: Motif[]; derniere_action: { type: string; date: string; texte: string } | null;
  jours_attente: number | null; prochaine_action_due_le: string | null;
};
export type ReponseRelances = { date: string; parametres: Delais; nb_actives: number; nb: number; lignes: LigneRelance[] };
