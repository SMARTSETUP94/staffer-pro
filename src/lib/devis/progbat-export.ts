/**
 * Export ProGBat d'un devis Staffing (module pur, testable sans base).
 * Construit uniquement depuis devis_progbat_donnees (vue client + heures par ligne) : aucun taux, coût,
 * prix d'achat, coefficient, marge, ligne interne ni note de Claude.
 *
 * Format ProGBat (Import/Export > Importer un Excel) : N°, Désignation, Quantité, Unité, Prix unitaire, Temps prévu.
 * Titre = N° + Désignation ; commentaire = Désignation seule ; ligne = toutes les colonnes.
 * Les écarts d'arrondi (quantité × prix unitaire arrondi) sont absorbés dans la ligne « 1 ens » du chapitre
 * Suivi et plans, sinon Pose, sinon Dépose ; à défaut seulement, une ligne « Ajustement d'arrondi ».
 */
import type { DevisClient, LigneClient } from "./pdf-client";
import { TYPE_RACINE } from "./pdf-client";

export type DonneesProgbat = DevisClient & {
  numero_progbat?: string | null; remise_mode?: string | null; remise_valeur?: number | null;
  heures: Record<string, number>;
};
export type LigneProgbat =
  | { kind: "entete" }
  | { kind: "titre"; n: string; designation: string }
  | { kind: "commentaire"; designation: string }
  | { kind: "ligne"; n: string; designation: string; quantite: number; unite: string; pu: number; temps: number; option?: boolean };

export type FicheProgbat = {
  devis_id: string | null; numero: string; version: number | null; numero_progbat: string | null; libelle: string | null;
  client: string | null; contact: string | null; contact_email: string | null; client_final: string | null;
  dates: Record<string, string | null>;
  total_ht_attendu: number; remise: { mode: string; valeur: number | null; montant: number }; net_ht_attendu: number;
  total_fichier: number; controle_ok: boolean;
  nb_lignes: number; nb_titres: number; nb_commentaires: number;
  options: { n: string; libelle: string; incluse: boolean; montant: number }[];
  ajustement_arrondi: { montant: number; n: string; designation: string; mode: "absorbe" | "ligne" } | null;
  photos: { storage_path: string; legende: string | null; objet: string | null }[];
  mentions: string[];
  consignes: string[];
};

export const ENTETE_PROGBAT = ["N°", "Désignation", "Quantité", "Unité", "Prix unitaire", "Temps prévu"] as const;
/** Numéro définitif, attribué par ProGBat à la finalisation (faite par un humain). */
export const NUMERO_PROGBAT_RE = /^D-\d{6}-\d{4}$/;
/** Numéro provisoire d'un brouillon ProGBat (avant finalisation). */
export const NUMERO_PROGBAT_PROVISOIRE_RE = /^S\d{6}$/;
export const estNumeroProgbatValide = (n: string) => NUMERO_PROGBAT_RE.test(n) || NUMERO_PROGBAT_PROVISOIRE_RE.test(n);
/** Mode opératoire ProGBat (retour du vrai import du 3 novembre 2026). */
export const CONSIGNES_PROGBAT = [
  "Importer uniquement dans un devis ProGBat neuf et vide, rattaché au client et au chantier 9XXX : l'import remplace tout le contenu du devis ProGBat.",
  "Import/Export > Importer un Excel : cocher « La première ligne contient les titres » (la ligne d'en-tête n'est alors pas importée).",
  "Faire ensuite les réglages : options en Option / Variante, remise, texte d'objet.",
  "Relire le total HT dans ProGBat, laisser le devis en brouillon (jamais de finalisation ni d'envoi par Claude), puis enregistrer le transfert avec le numéro S….",
  "Après finalisation par un humain, enregistrer le numéro définitif D-AAAAMM-NNNN.",
];
const CHAPITRES = ["chapitre_suivi", "chapitre_pose", "chapitre_depose"] as const;
const cents = (v: number | null | undefined) => Math.round(Number(v ?? 0) * 100);
const r2 = (h: number) => Math.round(h * 100) / 100;

export function dimensionsTexte(l: Pick<LigneClient, "longueur_mm" | "largeur_mm" | "hauteur_mm">) {
  const d = [l.longueur_mm, l.largeur_mm, l.hauteur_mm].filter((x) => x != null && Number(x) > 0).map((x) => String(Number(x)));
  return d.length ? `${d.join(" × ")} mm` : "";
}

export function construireProgbat(v: DonneesProgbat): { lignes: LigneProgbat[]; fiche: FicheProgbat } {
  const all = v.lignes;
  const kids = (p: string) => all.filter((l) => l.parent_id === p).sort((a, b) => a.ordre - b.ordre);
  const subC = (l: LigneClient): number => cents(l.montant) + kids(l.id).filter((k) => k.type !== "commentaire").reduce((s, k) => s + subC(k), 0);
  const subH = (l: LigneClient): number => Number(v.heures[l.id] ?? 0) + kids(l.id).filter((k) => k.type !== "commentaire").reduce((s, k) => s + subH(k), 0);
  const comVisibles = (l: LigneClient): string[] => kids(l.id).flatMap((k) =>
    k.type === "commentaire" ? (k.texte?.trim() ? [k.texte.trim()] : []) : comVisibles(k));

  const racines = all.filter((l) => !l.parent_id).sort((a, b) => a.ordre - b.ordre);
  const zones = racines.filter((r) => r.type === "zone");
  const objetsRacine = racines.filter((r) => r.type === "objet");
  const chapitres = CHAPITRES.flatMap((t) => racines.filter((r) => r.type === t));
  const options = racines.filter((r) => r.type === "option");

  const out: LigneProgbat[] = [{ kind: "entete" }];
  let ecartC = 0;
  let N = 0;
  const ligneObjet = (o: LigneClient, n: string) => {
    const totalC = subC(o);
    const q = Number(o.quantite ?? 1) > 0 ? Number(o.quantite) : 1;
    const puC = Math.round(totalC / q);
    ecartC += totalC - Math.round(q * puC);
    out.push({ kind: "ligne", n, designation: o.libelle?.trim() || "Objet", quantite: q, unite: "u", pu: puC / 100, temps: r2(subH(o)) });
    const dims = dimensionsTexte(o);
    const textes = [dims ? [dims, o.finition?.trim()].filter(Boolean).join(" · ") : o.finition?.trim() ?? "",
      ...(o.descriptif_client ?? "").split(/\r?\n/).map((s) => s.trim()), ...comVisibles(o)].filter(Boolean);
    for (const t of textes) out.push({ kind: "commentaire", designation: t });
  };
  const blocZone = (titre: string, enfants: LigneClient[], zone?: LigneClient) => {
    N += 1; const z = String(N); let k = 0;
    out.push({ kind: "titre", n: z, designation: titre });
    if (zone && cents(zone.montant) !== 0) {
      k += 1; out.push({ kind: "ligne", n: `${z}.${k}`, designation: `${titre} (forfait)`, quantite: 1, unite: "ens", pu: cents(zone.montant) / 100, temps: r2(Number(v.heures[zone.id] ?? 0)) });
    }
    for (const e of enfants) {
      if (e.type === "commentaire") { if (e.texte?.trim()) out.push({ kind: "commentaire", designation: e.texte.trim() }); continue; }
      k += 1; ligneObjet(e, `${z}.${k}`);
    }
    return { z, k };
  };

  let derniere: { z: string; k: number; index: number } | null = null;
  for (const z of zones) { const r = blocZone(z.libelle?.trim() || "Zone", kids(z.id), z); derniere = { ...r, index: out.length }; }
  if (objetsRacine.length) { const r = blocZone(v.libelle?.trim() || "Objets", objetsRacine); derniere = { ...r, index: out.length }; }

  const lignesChap: { type: string; index: number }[] = [];
  for (const c of chapitres) {
    const totalC = subC(c), h = subH(c);
    if (totalC === 0 && h === 0) continue;
    N += 1;
    const titre = c.libelle?.trim() || TYPE_RACINE[c.type] || "Chapitre";
    out.push({ kind: "titre", n: String(N), designation: titre });
    for (const t of comVisibles(c)) out.push({ kind: "commentaire", designation: t });
    lignesChap.push({ type: c.type, index: out.length });
    out.push({ kind: "ligne", n: `${N}.1`, designation: titre, quantite: 1, unite: "ens", pu: totalC / 100, temps: r2(h) });
  }

  let ajustement: FicheProgbat["ajustement_arrondi"] = null;
  if (ecartC !== 0) {
    const cible = CHAPITRES.map((t) => lignesChap.find((c) => c.type === t)).find(Boolean);
    if (cible) {
      const l = out[cible.index] as Extract<LigneProgbat, { kind: "ligne" }>;
      l.pu = (cents(l.pu) + ecartC) / 100;
      ajustement = { montant: ecartC / 100, n: l.n, designation: l.designation, mode: "absorbe" };
    } else {
      const n = derniere ? `${derniere.z}.${derniere.k + 1}` : String(++N);
      const ligne: LigneProgbat = { kind: "ligne", n, designation: "Ajustement d'arrondi", quantite: 1, unite: "u", pu: ecartC / 100, temps: 0 };
      if (derniere) out.splice(derniere.index, 0, ligne); else out.push(ligne);
      ajustement = { montant: ecartC / 100, n, designation: "Ajustement d'arrondi", mode: "ligne" };
    }
  }

  const ficheOptions: FicheProgbat["options"] = [];
  if (options.length) {
    N += 1; out.push({ kind: "titre", n: String(N), designation: "Options" });
    options.forEach((o, i) => {
      const n = `${N}.${i + 1}`, montant = subC(o) / 100, libelle = o.libelle?.trim() || "Option";
      out.push({ kind: "ligne", n, designation: libelle, quantite: 1, unite: "ens", pu: montant, temps: r2(subH(o)), option: true });
      for (const t of [...(o.descriptif_client ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean), ...comVisibles(o)]) out.push({ kind: "commentaire", designation: t });
      ficheOptions.push({ n, libelle, incluse: !!o.option_incluse, montant });
    });
  }

  const lignes = out.filter((l): l is Extract<LigneProgbat, { kind: "ligne" }> => l.kind === "ligne");
  const inclusesN = new Set(ficheOptions.filter((o) => o.incluse).map((o) => o.n));
  const totalFichierC = lignes.filter((l) => !l.option || inclusesN.has(l.n)).reduce((s, l) => s + Math.round(l.quantite * cents(l.pu)), 0);
  const remiseC = Math.abs(cents(v.remise));
  return {
    lignes: out,
    fiche: {
      devis_id: v.id ?? null, numero: v.numero, version: v.version ?? null, numero_progbat: v.numero_progbat ?? null, libelle: v.libelle,
      client: v.client?.nom ?? null, contact: v.contact?.nom?.trim() || null, contact_email: v.contact?.email ?? null, client_final: v.client_final,
      dates: v.dates ?? {},
      total_ht_attendu: cents(v.total_ht) / 100,
      remise: { mode: v.remise_mode ?? "aucune", valeur: v.remise_valeur ?? null, montant: remiseC / 100 },
      net_ht_attendu: cents(v.net_ht ?? v.total_ht) / 100,
      total_fichier: totalFichierC / 100, controle_ok: totalFichierC === cents(v.total_ht),
      nb_lignes: lignes.length, nb_titres: out.filter((l) => l.kind === "titre").length, nb_commentaires: out.filter((l) => l.kind === "commentaire").length,
      options: ficheOptions, ajustement_arrondi: ajustement,
      photos: v.photos.map((p) => ({ storage_path: p.storage_path, legende: p.legende, objet: all.find((l) => l.id === p.ligne_id)?.libelle ?? null })),
      mentions: racines.filter((r) => r.type === "commentaire" && r.texte?.trim()).map((r) => r.texte!.trim()),
      consignes: CONSIGNES_PROGBAT,
    },
  };
}

/** Cellules de la feuille (ligne d'en-tête comprise) dans l'ordre des colonnes ProGBat. */
export function cellulesProgbat(lignes: LigneProgbat[]): (string | number | null)[][] {
  return lignes.map((l) => {
    if (l.kind === "entete") return [...ENTETE_PROGBAT];
    if (l.kind === "titre") return [l.n, l.designation, null, null, null, null];
    if (l.kind === "commentaire") return [null, l.designation, null, null, null, null];
    return [l.n, l.designation, l.quantite, l.unite, l.pu, l.temps];
  });
}

export const nomFichierProgbat = (v: Pick<DevisClient, "numero" | "version">) =>
  `ProGBat ${/-R\d+$/.test(v.numero) || !v.version ? v.numero : `${v.numero}-R${v.version}`}.xlsx`.replace(/[\\/:*?"<>|]/g, "-");

/** Comparaison au centime du total relevé dans ProGBat avec le net HT Staffing. */
export function ecartTransfert(netStaffing: number, totalProgbat: number) {
  return (cents(totalProgbat) - cents(netStaffing)) / 100;
}

/** Libellé de statut fondé sur les faits : transfert ProGBat (numéro) et envoi client (date) sont distincts. */
export function libelleStatutDevis(st: string, numeroProgbat?: string | null, dateEnvoi?: string | null, base: Record<string, string> = {}) {
  if (st !== "transfere") return base[st] ?? st;
  if (numeroProgbat && NUMERO_PROGBAT_PROVISOIRE_RE.test(numeroProgbat)) return dateEnvoi ? "Importé ProGBat (brouillon) · envoyé" : "Importé ProGBat (brouillon)";
  if (numeroProgbat) return dateEnvoi ? `Transféré ProGBat · envoyé` : "Transféré ProGBat";
  return "Envoyé";
}

/** Référence affichée : « ProGBat S003800 (brouillon) » puis « ProGBat D-202611-0012 ». */
export function libelleNumeroProgbat(n?: string | null) {
  if (!n) return "";
  return NUMERO_PROGBAT_PROVISOIRE_RE.test(n) ? `ProGBat ${n} (brouillon)` : `ProGBat ${n}`;
}
