/**
 * Lecture déterministe du gabarit « Demande logistique » dans un email log@.
 * Pur (sans IA) : partagé par le releveur, la réanalyse et la fenêtre « Ajouter au planning ».
 * Seule la partie la plus récente du mail est lue ; l'historique cité est ignoré.
 */

export const TYPES_ETAPE = ["appro", "emballage", "chargement", "livraison", "tracage", "montage", "finitions", "permanence", "rotation", "demontage", "dechargement"] as const;
export type TypeEtape = (typeof TYPES_ETAPE)[number];

export type EcheanceEnrichie = {
  date: string;
  libelle: string;
  type: TypeEtape | null;
  affaire_numero: string | null;
  heure_debut?: string | null;
  heure_fin?: string | null;
  a_partir_de?: boolean | null;
  lieu?: string | null;
  contact_sur_place?: string | null;
  acces?: string | null;
  nb_personnes?: number | null;
  vehicule?: string | null;
  responsable?: string | null;
  commentaire?: string | null;
  source?: "gabarit" | "ia" | "formulaire";
};

type Champ = "categorie" | "projet" | "date" | "heure" | "adresse" | "contact" | "vehicule" | "nb" | "chef" | "acces" | "commentaire";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

const LABELS: Array<[RegExp, Champ]> = [
  [/^(categorie|type|type d'etape|etape)$/, "categorie"],
  [/^(projet|chantier|affaire)$/, "projet"],
  [/^(date|jour)$/, "date"],
  [/^(heure|heures|horaire|horaires)$/, "heure"],
  [/^(adresse|lieu)$/, "adresse"],
  [/^(contact sur place|contact)$/, "contact"],
  [/^(vehicule|vehicules)$/, "vehicule"],
  [/^(nombre de personnes|nb de personnes|nb personnes|personnes)$/, "nb"],
  [/^(chef d'equipe|chef|responsable)$/, "chef"],
  [/^(acces|acces \/ contraintes|contraintes)$/, "acces"],
  [/^(commentaire|commentaires|remarque|remarques)$/, "commentaire"],
];

/** Début de l'historique cité (FR/EN, Outlook, Gmail, mobile). */
const CITATION = [
  /^(from|de)\s*:/i,
  /^-{3,}/,
  /^_{5,}/,
  /^envoy[ée] (a|à) partir de/i,
  /^sent from/i,
  /^le .+ a [ée]crit\s*:?$/i,
  /^on .+ wrote:?$/i,
  /^-+\s*(message d'origine|original message|message transf[ée]r[ée])/i,
];

export function couperHistorique(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const l of lines) {
    if (CITATION.some((r) => r.test(l.trim()))) break;
    out.push(l);
  }
  return out.join("\n");
}

const MOIS: Record<string, number> = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

/** Date française (10/11, 10/11/2026, mardi 10 novembre, 2026-11-10). Année déduite de la réception. */
export function lireDate(v: string, recu: Date): string | null {
  const t = norm(v);
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  let j: number | null = null, m: number | null = null, a: number | null = null;
  const num = t.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/);
  if (num) { j = +num[1]; m = +num[2]; a = num[3] ? +num[3] : null; }
  else {
    const txt = t.match(/\b(\d{1,2})(?:er)? (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?: (\d{4}))?/);
    if (txt) { j = +txt[1]; m = MOIS[txt[2]]; a = txt[3] ? +txt[3] : null; }
  }
  if (!j || !m || m > 12 || j > 31) return null;
  if (a !== null && a < 100) a += 2000;
  if (a === null) {
    a = recu.getUTCFullYear();
    // Une date plus de 2 mois avant la réception vise l'année suivante.
    const d = Date.UTC(a, m - 1, j);
    if (d < recu.getTime() - 60 * 86400000) a += 1;
  }
  return `${a}-${pad(m)}-${pad(j)}`;
}

const h = (hh: string, mm?: string) => `${pad(+hh)}:${pad(mm ? +mm : 0)}`;

/** Heures : « à partir de 17h », « de 8h à 12h30 », « 8h-12h », « 17h ». */
export function lireHeures(v: string): { debut: string | null; fin: string | null; aPartirDe: boolean } {
  const t = norm(v);
  const H = "(\\d{1,2})\\s*(?:h|:)\\s*(\\d{2})?";
  const plage = t.match(new RegExp(`${H}\\s*(?:-|a|à|jusqu'a)\\s*${H}`));
  if (plage) return { debut: h(plage[1], plage[2]), fin: h(plage[3], plage[4]), aPartirDe: false };
  const apd = t.match(new RegExp(`(?:a partir de|des|apres)\\s*${H}`));
  if (apd) return { debut: h(apd[1], apd[2]), fin: null, aPartirDe: true };
  const avant = t.match(new RegExp(`(?:avant|jusqu'a)\\s*${H}`));
  if (avant) return { debut: null, fin: h(avant[1], avant[2]), aPartirDe: false };
  const seule = t.match(new RegExp(`\\b${H}`));
  if (seule) return { debut: h(seule[1], seule[2]), fin: null, aPartirDe: false };
  return { debut: null, fin: null, aPartirDe: false };
}

export function lireType(v: string): TypeEtape | null {
  const t = norm(v).replace(/[^a-z]/g, "");
  const alias: Record<string, TypeEtape> = { approvisionnement: "appro", enlevement: "appro", tracage: "tracage", finition: "finitions", perm: "permanence", demontage: "demontage", dechargement: "dechargement" };
  if ((TYPES_ETAPE as readonly string[]).includes(t)) return t as TypeEtape;
  if (alias[t]) return alias[t];
  return TYPES_ETAPE.find((x) => t.startsWith(x)) ?? null;
}

const LIBELLE: Record<TypeEtape, string> = { appro: "Appro", emballage: "Emballage", chargement: "Chargement", livraison: "Livraison", tracage: "Traçage", montage: "Montage", finitions: "Finitions", permanence: "Permanence", rotation: "Rotation", demontage: "Démontage", dechargement: "Déchargement" };

/**
 * Lit le gabarit s'il est présent (au moins catégorie + date + un autre champ).
 * Retourne null sinon (l'IA prend le relais). Une nouvelle « Catégorie » ouvre une nouvelle intervention.
 */
export function lireGabaritLogistique(text: string, recu: Date = new Date()): EcheanceEnrichie[] | null {
  const recent = couperHistorique(text);
  const blocs: Array<Partial<Record<Champ, string>>> = [];
  let cur: Partial<Record<Champ, string>> = {};
  let projet: string | undefined;
  let last: Champ | null = null;
  for (const raw of recent.split(/\r?\n/)) {
    const line = raw.replace(/\u00a0/g, " ").trim();
    if (!line) { last = null; continue; }
    const m = line.match(/^[-•*–\s]*([^:]{2,40}?)\s*:\s*(.*)$/);
    const champ = m ? LABELS.find(([r]) => r.test(norm(m[1])))?.[1] : undefined;
    if (m && champ) {
      const val = m[2].trim();
      if (champ === "categorie" && cur.categorie) { blocs.push(cur); cur = {}; }
      if (champ === "projet") projet = val;
      cur[champ] = val;
      last = champ;
    } else if (last === "commentaire" || last === "acces") {
      cur[last] = `${cur[last] ?? ""} ${line}`.trim();
    }
  }
  if (Object.keys(cur).length) blocs.push(cur);
  const valides = blocs.filter((b) => b.categorie && b.date && Object.keys(b).length >= 3);
  if (valides.length === 0) return null;
  const out: EcheanceEnrichie[] = [];
  for (const b of valides) {
    const date = lireDate(b.date!, recu);
    if (!date) continue;
    const hs = lireHeures(b.heure ?? b.date!);
    const type = lireType(b.categorie!);
    const p = b.projet ?? projet ?? null;
    const numero = p?.match(/\b(\d{4,5})\b/)?.[1] ?? null;
    const nb = b.nb?.match(/\d+/)?.[0];
    const contact = b.contact ? b.contact.replace(/\s+-\s+/g, " / ").trim() : null;
    out.push({
      date, type, affaire_numero: numero,
      libelle: `${type ? LIBELLE[type] : b.categorie}${hs.aPartirDe && hs.debut ? ` à partir de ${hs.debut.replace(":00", "h").replace(":", "h")}` : ""}`,
      heure_debut: hs.debut, heure_fin: hs.fin, a_partir_de: hs.aPartirDe,
      lieu: b.adresse || null, contact_sur_place: contact || null, acces: b.acces || null,
      nb_personnes: nb ? Number(nb) : null, vehicule: b.vehicule || null, responsable: b.chef || null,
      commentaire: b.commentaire || null, source: "gabarit",
    });
  }
  return out.length ? out : null;
}

/** Commentaire équipe : contact + accès + commentaire libre, sans doublon. */
export function commentaireEquipe(e: Pick<EcheanceEnrichie, "contact_sur_place" | "acces" | "commentaire" | "vehicule">, vehiculeReconnu: boolean): string {
  return [
    e.contact_sur_place ? `Contact sur place : ${e.contact_sur_place}` : "",
    e.acces ? `Accès : ${e.acces}` : "",
    e.vehicule && !vehiculeReconnu ? `Véhicule : ${e.vehicule}` : "",
    e.commentaire ?? "",
  ].filter(Boolean).join("\n");
}

/** Rapproche un véhicule écrit en clair de la flotte (nom ou immatriculation). */
export function trouverVehicule<V extends { id: string; nom: string; immatriculation: string | null }>(texte: string | null | undefined, flotte: V[]): V | null {
  if (!texte) return null;
  const t = norm(texte);
  if (/^(aucun|petit colis|sans|non)/.test(t)) return null;
  return flotte.find((v) => norm(v.nom) === t || (v.immatriculation && norm(v.immatriculation).replace(/[\s-]/g, "") === t.replace(/[\s-]/g, "")))
    ?? flotte.find((v) => t.includes(norm(v.nom)) || norm(v.nom).includes(t)) ?? null;
}
