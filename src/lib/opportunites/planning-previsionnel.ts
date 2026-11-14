/**
 * Planning prévisionnel des opportunités — règles pures (lecture seule).
 * Aucune donnée ici n'alimente les plannings réels (pilotage, atelier, logistique).
 * Dates manipulées en chaînes ISO « AAAA-MM-JJ » calculées en UTC.
 */

export type StatutOuvert = "presque_gagne" | "a_l_etude" | "envoye" | "a_faire";
export const GROUPES: StatutOuvert[] = ["presque_gagne", "a_l_etude", "envoye", "a_faire"];
export const GROUPE_LABEL: Record<StatutOuvert, string> = {
  presque_gagne: "Presque gagné",
  a_l_etude: "À l'étude",
  envoye: "Devis envoyé",
  a_faire: "À faire",
};

export type Parametres = Record<string, number>;

export interface MateriauDevis {
  materiau_id: string | null;
  designation: string;
  unite: string | null;
  fournisseur: string | null;
  quantite: number;
  prix_achat: number | null;
  /** Faux pour les lots / lignes sans prix d'achat : non consolidés. */
  a_prix?: boolean;
}

export interface OppPlanning {
  affaire_id: string;
  numero: string | null;
  nom: string | null;
  statut: StatutOuvert;
  taille: string | null;
  date_montage: string | null;
  date_demontage: string | null;
  date_evenement_debut: string | null;
  date_evenement_fin: string | null;
  charge_affaires_id: string | null;
  charge_affaires_nom: string | null;
  client_nom: string | null;
  devis_id: string | null;
  montant_ht: number | null;
  heures_fabrication: number;
  materiaux: MateriauDevis[];
  autres_lignes: { designation: string; unite: string | null; categorie: string | null; quantite: number }[];
  prochaine_action: { type: string; texte: string | null; due: string | null; date: string } | null;
}

const DEFAUTS: Parametres = {
  opp_plan_echantillons_jours: 5,
  opp_plan_commande_jours: 3,
  opp_plan_equipe_type: 4,
  opp_plan_heures_semaine: 35,
  opp_plan_duree_tres_petit: 1,
  opp_plan_duree_petit: 2,
  opp_plan_duree_moyen: 4,
  opp_plan_duree_gros: 6,
  opp_plan_duree_tres_gros: 8,
  opp_plan_duree_sans_taille: 4,
  opp_plan_fermeture_debut_mmjj: 1224,
  opp_plan_fermeture_fin_mmjj: 101,
  proba_presque_gagne: 80,
  proba_a_l_etude: 40,
  proba_envoye: 30,
  proba_a_faire: 10,
};

export function param(p: Parametres | undefined, cle: string): number {
  const v = Number(p?.[cle]);
  return p?.[cle] != null && Number.isFinite(v) ? v : (DEFAUTS[cle] ?? 0);
}

// ---------- dates ----------
const J = 86_400_000;
export function toDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function ajouterJours(iso: string, n: number): string {
  return toIso(new Date(toDate(iso).getTime() + n * J));
}
export function ecartJours(de: string, a: string): number {
  return Math.round((toDate(a).getTime() - toDate(de).getTime()) / J);
}
export function lundi(iso: string): string {
  const d = toDate(iso);
  const dow = (d.getUTCDay() + 6) % 7;
  return ajouterJours(iso, -dow);
}
export function fmtJJMM(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function estFermeture(iso: string, p?: Parametres): boolean {
  const deb = param(p, "opp_plan_fermeture_debut_mmjj");
  const fin = param(p, "opp_plan_fermeture_fin_mmjj");
  const mmjj = Number(iso.slice(5, 7)) * 100 + Number(iso.slice(8, 10));
  return deb <= fin ? mmjj >= deb && mmjj <= fin : mmjj >= deb || mmjj <= fin;
}
export function estOuvre(iso: string, p?: Parametres): boolean {
  const dow = toDate(iso).getUTCDay();
  return dow >= 1 && dow <= 5 && !estFermeture(iso, p);
}
/** n-ième jour ouvré strictement avant `iso`. */
export function joursOuvresAvant(iso: string, n: number, p?: Parametres): string {
  let d = iso;
  let k = 0;
  for (let i = 0; i < 400 && k < n; i++) {
    d = ajouterJours(d, -1);
    if (estOuvre(d, p)) k++;
  }
  return d;
}

// ---------- périodes ----------
export const consolidable = (m: MateriauDevis) => m.a_prix !== false;

export interface Periodes {
  client: { debut: string; fin: string };
  fabrication: { debut: string; fin: string; semaines: number; source: "devis" | "taille" | "taille_vide" };
  echantillons: { debut: string; fin: string };
  limiteSignature: string;
  commande: string | null;
}

export function dureeFabricationSemaines(o: Pick<OppPlanning, "heures_fabrication" | "taille">, p?: Parametres) {
  const h = Number(o.heures_fabrication) || 0;
  if (h > 0) {
    const capa = param(p, "opp_plan_equipe_type") * param(p, "opp_plan_heures_semaine");
    return { semaines: Math.max(1, Math.ceil(h / (capa || 140))), source: "devis" as const };
  }
  if (!o.taille) return { semaines: param(p, "opp_plan_duree_sans_taille"), source: "taille_vide" as const };
  return { semaines: param(p, `opp_plan_duree_${o.taille}`) || param(p, "opp_plan_duree_sans_taille"), source: "taille" as const };
}

export function dateReference(o: OppPlanning): string | null {
  return o.date_montage ?? o.date_evenement_debut ?? null;
}

export function calculerPeriodes(o: OppPlanning, p?: Parametres): Periodes | null {
  const debut = dateReference(o);
  if (!debut) return null;
  const finClient = o.date_demontage ?? o.date_evenement_fin ?? debut;
  const { semaines, source } = dureeFabricationSemaines(o, p);
  const fabFin = ajouterJours(debut, -1);
  const fabDebut = ajouterJours(debut, -7 * semaines);
  const n = param(p, "opp_plan_echantillons_jours");
  const echDebut = joursOuvresAvant(fabDebut, n, p);
  const echFin = joursOuvresAvant(fabDebut, 1, p);
  const commande = o.materiaux.some(consolidable) ? ajouterJours(fabDebut, -param(p, "opp_plan_commande_jours")) : null;
  return {
    client: { debut, fin: finClient < debut ? debut : finClient },
    fabrication: { debut: fabDebut, fin: fabFin, semaines, source },
    echantillons: { debut: echDebut, fin: echFin },
    limiteSignature: echDebut,
    commande,
  };
}

export type EtatSignature = { niveau: "hors_delai" | "proche" | "ok"; jours: number; libelle: string };
export function etatSignature(limite: string, aujourdhui: string): EtatSignature {
  const j = ecartJours(aujourdhui, limite);
  if (j < 0) return { niveau: "hors_delai", jours: -j, libelle: `Signature hors délai (${-j} j)` };
  return { niveau: j <= 7 ? "proche" : "ok", jours: j, libelle: `À signer d'ici le ${fmtJJMM(limite)}` };
}

// ---------- blocs ----------
export function aDater(opps: OppPlanning[]) {
  return opps.filter((o) => !dateReference(o));
}
export function datePasseeAClore(opps: OppPlanning[], aujourdhui: string) {
  return opps.filter((o) => {
    const ref = o.date_demontage ?? o.date_evenement_fin ?? dateReference(o);
    return !!ref && ref < aujourdhui;
  });
}
export function grouper(opps: OppPlanning[], aujourdhui: string) {
  const passees = new Set(datePasseeAClore(opps, aujourdhui).map((o) => o.affaire_id));
  const res = {} as Record<StatutOuvert, OppPlanning[]>;
  for (const g of GROUPES) {
    res[g] = opps
      .filter((o) => o.statut === g && dateReference(o) && !passees.has(o.affaire_id))
      .sort((a, b) => (dateReference(a)! < dateReference(b)! ? -1 : dateReference(a)! > dateReference(b)! ? 1 : 0));
  }
  return res;
}

// ---------- matériaux à commander ----------
export function normaliser(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
export function cleMateriau(m: Pick<MateriauDevis, "materiau_id" | "designation" | "unite">): string {
  const u = normaliser(m.unite ?? "");
  return m.materiau_id ? `id:${m.materiau_id}|${u}` : `des:${normaliser(m.designation)}|${u}`;
}

export interface LigneMateriau {
  cle: string;
  designation: string;
  unite: string | null;
  fournisseur: string | null;
  parSemaine: Record<string, { quantite: number; numeros: string[] }>;
  total: number;
  achatHT: number | null;
  numeros: string[];
}

export function regrouperMateriaux(
  opps: OppPlanning[],
  p: Parametres | undefined,
  filtre: { statuts: StatutOuvert[]; affaireId?: string | null },
): { lignes: LigneMateriau[]; semaines: string[] } {
  const map = new Map<string, LigneMateriau>();
  const semaines = new Set<string>();
  for (const o of opps) {
    if (!filtre.statuts.includes(o.statut)) continue;
    if (filtre.affaireId && o.affaire_id !== filtre.affaireId) continue;
    const per = calculerPeriodes(o, p);
    if (!per?.commande) continue;
    const sem = lundi(per.commande);
    const num = o.numero ?? "?";
    for (const m of o.materiaux) {
      if (!consolidable(m)) continue;
      const q = Number(m.quantite) || 0;
      if (q === 0) continue;
      const cle = cleMateriau(m);
      let l = map.get(cle);
      if (!l) {
        l = { cle, designation: m.designation, unite: m.unite, fournisseur: m.fournisseur, parSemaine: {}, total: 0, achatHT: null, numeros: [] };
        map.set(cle, l);
      }
      semaines.add(sem);
      const c = (l.parSemaine[sem] ??= { quantite: 0, numeros: [] });
      c.quantite += q;
      if (!c.numeros.includes(num)) c.numeros.push(num);
      if (!l.numeros.includes(num)) l.numeros.push(num);
      l.total += q;
      if (m.prix_achat != null) l.achatHT = (l.achatHT ?? 0) + q * Number(m.prix_achat);
    }
  }
  const arrondi = (x: number) => Math.round(x * 1000) / 1000;
  const lignes = [...map.values()].map((l) => ({
    ...l,
    total: arrondi(l.total),
    achatHT: l.achatHT == null ? null : Math.round(l.achatHT * 100) / 100,
    parSemaine: Object.fromEntries(Object.entries(l.parSemaine).map(([k, v]) => [k, { ...v, quantite: arrondi(v.quantite) }])),
  }));
  lignes.sort((a, b) => a.designation.localeCompare(b.designation, "fr"));
  return { lignes, semaines: [...semaines].sort() };
}
