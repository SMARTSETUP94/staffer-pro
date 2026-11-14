/** Règles pures L3 : horaires, responsable rapproché, doublons et rattachement d'un jalonnement. */

export type AvertissementHoraire = { niveau: "refus" | "alerte" | "info"; texte: string } | null;

/** Fin = début refusée ; fin plus tôt que le début = passage de minuit accepté ; fin à 00:00 signalée. */
export function avertissementHoraire(debut?: string | null, fin?: string | null): AvertissementHoraire {
  const d = (debut ?? "").slice(0, 5); const f = (fin ?? "").slice(0, 5);
  if (!f) return null;
  if (d && d === f) return { niveau: "refus", texte: "Heure de fin identique à l'heure de début" };
  if (f === "00:00") return { niveau: "alerte", texte: "Fin à 00:00 : vérifiez (minuit ou heure inconnue ?)" };
  if (d && f < d) return { niveau: "info", texte: "Passage de minuit (fin le lendemain)" };
  return null;
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export type EmployeActif = { id: string; prenom: string | null; nom: string | null };

/** Rapproche un texte libre (« Guillaume », « G. Maquarie », « MAQUARIE Guillaume ») d'un seul employé actif ; sinon null. */
export function rapprocherResponsable(texte: string | null | undefined, employes: EmployeActif[]): { id: string; nom: string } | null {
  const t = norm(texte ?? "");
  if (t.length < 2) return null;
  const mots = t.split(" ");
  const complet = (e: EmployeActif) => `${e.prenom ?? ""} ${e.nom ?? ""}`.trim();
  const score = (e: EmployeActif): number => {
    const p = norm(e.prenom ?? ""); const n = norm(e.nom ?? "");
    if (!p && !n) return 0;
    if (t === `${p} ${n}` || t === `${n} ${p}`) return 3;
    if (n && mots.includes(n) && (!p || mots.some((m) => m === p || (m.length === 1 && p.startsWith(m))))) return 2;
    if (mots.length === 1 && (t === p || t === n)) return 1;
    return 0;
  };
  const notes = employes.map((e) => ({ e, s: score(e) })).filter((x) => x.s > 0);
  if (!notes.length) return null;
  const max = Math.max(...notes.map((x) => x.s));
  const meilleurs = notes.filter((x) => x.s === max);
  return meilleurs.length === 1 ? { id: meilleurs[0].e.id, nom: complet(meilleurs[0].e) } : null;
}

export type Doublon = { index: number; etape_id: string; date_debut: string; date_fin: string | null; heure_debut: string | null; lieu_libre: string | null; source_type: string | null; origine: string };
export type ChoixDoublon = "fusionner" | "ignorer" | "creer";

/**
 * Répartit les lignes cochées selon le choix fait pour leurs doublons (par défaut « fusionner » : rien n'est recréé).
 * fusionner : rattache l'étape existante si elle n'a pas encore de source ; ignorer : rien ; creer : nouvelle étape.
 */
export function repartirSelonDoublons(nbLignes: number, doublons: Doublon[], choix: Record<number, ChoixDoublon>) {
  const parLigne = new Map<number, Doublon[]>();
  for (const d of doublons) parLigne.set(d.index, [...(parLigne.get(d.index) ?? []), d]);
  const aCreer: number[] = []; const aRattacher = new Set<string>(); const ecartees: number[] = [];
  for (let i = 0; i < nbLignes; i++) {
    const ds = parLigne.get(i);
    if (!ds?.length) { aCreer.push(i); continue; }
    const c = choix[i] ?? "fusionner";
    if (c === "creer") aCreer.push(i);
    else { ecartees.push(i); if (c === "fusionner") ds.filter((d) => !d.source_type).forEach((d) => aRattacher.add(d.etape_id)); }
  }
  return { aCreer, aRattacher: [...aRattacher], ecartees };
}

export type LigneJalonnement = { numero_affaire?: string | null; type: string; date_debut: string; heure_debut?: string | null; note?: string | null };
export type EtapeExistante = { id: string; affaire_numero: string; type: string; date_debut: string; date_fin: string | null; heure_debut: string | null; source_type: string | null };
export type LigneBilan = { ligne: LigneJalonnement; resultat: "rattacher" | "deja_rattachee" | "plusieurs" | "a_creer" | "chantier_inconnu"; etape_ids: string[] };

/** Bilan ligne à ligne du rattachement d'un jalonnement à des étapes déjà au planning (lecture seule). */
export function bilanRattachement(lignes: LigneJalonnement[], etapes: EtapeExistante[]): LigneBilan[] {
  return lignes.map((l) => {
    if (!l.numero_affaire) return { ligne: l, resultat: "chantier_inconnu", etape_ids: [] };
    const h = (l.heure_debut ?? "").slice(0, 5);
    const c = etapes.filter((e) => e.affaire_numero === l.numero_affaire && e.type === l.type
      && l.date_debut >= e.date_debut && l.date_debut <= (e.date_fin ?? e.date_debut)
      && (!h || !e.heure_debut || Math.abs(minutes(e.heure_debut) - minutes(h)) <= 30));
    if (!c.length) return { ligne: l, resultat: "a_creer", etape_ids: [] };
    if (c.length > 1) return { ligne: l, resultat: "plusieurs", etape_ids: c.map((e) => e.id) };
    return { ligne: l, resultat: c[0].source_type ? "deja_rattachee" : "rattacher", etape_ids: [c[0].id] };
  });
}
const minutes = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
