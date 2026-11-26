/**
 * Version équipe d'un devis : heures par objet et matériaux, sans AUCUN coût.
 * Module pur (testable sans base) : il ne connaît ni xlsx, ni Supabase, ni React.
 *
 * Règles :
 *  - une ligne = une ligne du devis (zone, objet, option, chapitre), jamais un commentaire ;
 *  - les heures d'une ligne sont ses heures propres (× quantité si « par unité ») ;
 *  - une option non incluse reste visible mais est marquée « hors total » et ne compte
 *    pas dans la ligne de total (même règle que le KPI « heures par métier » de l'éditeur) ;
 *  - aucun champ de coût, de taux, de coefficient ou de marge n'est écrit dans les feuilles.
 */
import { ordreArbre } from "./arbre";

export type LigneEquipe = {
  id: string; parent_id: string | null; type: string; ordre: number;
  libelle: string | null; quantite: number | null; option_incluse?: boolean | null; texte?: string | null;
  descriptif_client?: string | null; interne?: boolean | null;
  longueur_mm?: number | null; largeur_mm?: number | null; hauteur_mm?: number | null; finition?: string | null;
};
export type PhotoEquipe = { ligne_id: string; chemin: string; legende: string | null; mime: string | null };
/** Fiche descriptive d'un objet : texte synthétique, commentaires et images (chemins de stockage). */
export type FicheObjet = {
  numero: string; libelle: string; type: string; quantite: number; dimensions: string | null; finition: string | null;
  descriptif: string | null; commentaires: string[]; photos: { chemin: string; legende: string | null }[];
};
export type HeureEquipe = {
  ligne_id: string; heures: number; par_unite: boolean; metier_id: number | null;
  poste_libelle?: string | null; niveau?: string | null;
};
export type MateriauEquipe = {
  ligne_id: string; designation: string; fournisseur: string | null; ref: string | null;
  unite: string | null; quantite: number;
};
export type LibreEquipe = {
  ligne_id: string; designation: string; unite: string | null; quantite: number;
  par_unite: boolean; heures_info: number | null; metier_id: number | null;
};
export type DonneesEquipe = {
  numero: string; version: number | null; libelle: string | null;
  client: string | null; affaire: string | null; date_devis: string | null; date_validite: string | null;
  total_ht: number; net_ht: number;
  lignes: LigneEquipe[]; heures: HeureEquipe[]; materiaux: MateriauEquipe[]; libres: LibreEquipe[];
  photos?: PhotoEquipe[];
  metiers: { id: number; libelle: string }[];
};

export type Cellule = string | number | null;
export type FicheEquipe = {
  numero: string; version: number | null; client: string | null; affaire: string | null;
  nb_lignes: number; nb_objets: number; nb_materiaux: number; nb_heures: number;
  total_heures: number; heures_par_metier: { metier: string; heures: number }[];
  options_hors_total: { libelle: string; heures: number }[];
  total_ht: number; net_ht: number; nb_ignores: number;
};
export type ResultatEquipe = {
  synthese: Cellule[][];
  objets: Cellule[][];
  detail: Cellule[][];
  materiaux: Cellule[][];
  descriptions: Cellule[][];
  fiches_objets: FicheObjet[];
  fiche: FicheEquipe;
};

export const COLONNES_OBJETS = ["N°", "Désignation", "Type", "Qté", "Inclus"] as const;
export const COLONNES_DETAIL = ["N°", "Objet", "Poste", "Niveau", "Heures", "Par unité", "Total h"] as const;
export const COLONNES_MATERIAUX = ["N°", "Objet", "Désignation", "Fournisseur", "Réf", "Unité", "Quantité"] as const;

/** Champs qui ne doivent JAMAIS apparaître dans la version équipe. */
export const MOTS_INTERDITS = ["prix", "coût", "cout", "taux", "coefficient", "coef", "marge", "achat", "vente"] as const;

const LABEL_TYPE: Record<string, string> = {
  zone: "Zone", objet: "Objet", option: "Option", commentaire: "Commentaire",
  chapitre_suivi: "Suivi et plans", chapitre_pose: "Pose", chapitre_depose: "Dépose",
};
const SANS_METIER = "Sans métier";
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const qte = (l: LigneEquipe | undefined) => (l && Number(l.quantite ?? 1) > 0 ? Number(l.quantite) : 1);
const estOptionHors = (l: LigneEquipe) => l.type === "option" && !l.option_incluse;

/** Clé de métier : id en texte, ou « aucun » quand la ligne n'est rattachée à aucun métier. */
const cleMetier = (id: number | null | undefined) => (id == null ? "aucun" : String(id));

/** Référence lisible : la révision n'est pas répétée quand le numéro la porte déjà (« 9524-R1 »). */
export const refEquipe = (d: Pick<DonneesEquipe, "numero" | "version">) =>
  /-R\d+$/.test(d.numero) || d.version == null ? d.numero : `${d.numero}-R${d.version}`;

export function nomFichierEquipe(d: Pick<DonneesEquipe, "numero" | "version">) {
  return `Équipe ${refEquipe(d)}.xlsx`.replace(/[\\/:*?"<>|]/g, "-");
}

export function construireExportEquipe(d: DonneesEquipe): ResultatEquipe {
  const parId = new Map(d.lignes.map((l) => [l.id, l]));
  // Le lecteur renvoie les heures, matériaux et lignes libres même quand leur ligne est à la corbeille : on ne les exporte pas.
  const heures = d.heures.filter((h) => parId.has(h.ligne_id));
  const materiaux = d.materiaux.filter((m) => parId.has(m.ligne_id));
  const libres = d.libres.filter((f) => parId.has(f.ligne_id));
  const ignores = (d.heures.length - heures.length) + (d.materiaux.length - materiaux.length) + (d.libres.length - libres.length);
  const kids = (p: string) => d.lignes.filter((l) => l.parent_id === p).sort((a, b) => a.ordre - b.ordre);
  const nomMetier = new Map(d.metiers.map((m) => [String(m.id), m.libelle]));
  const libelleMetier = (cle: string) => (cle === "aucun" ? SANS_METIER : nomMetier.get(cle) ?? `Métier ${cle}`);

  // Une ligne est « hors total » si elle-même ou un ancêtre est une option non incluse.
  const horsTotal = (l: LigneEquipe): boolean => {
    let cur: LigneEquipe | undefined = l;
    const vus = new Set<string>();
    while (cur && !vus.has(cur.id)) {
      if (estOptionHors(cur)) return true;
      vus.add(cur.id);
      cur = cur.parent_id ? parId.get(cur.parent_id) : undefined;
    }
    return false;
  };

  // Heures propres de chaque ligne, par métier.
  const propres = new Map<string, Map<string, number>>();
  const ajouter = (ligneId: string, cle: string, h: number) => {
    if (!h) return;
    const m = propres.get(ligneId) ?? new Map<string, number>();
    m.set(cle, r2((m.get(cle) ?? 0) + h));
    propres.set(ligneId, m);
  };
  for (const h of heures) ajouter(h.ligne_id, cleMetier(h.metier_id), Number(h.heures) * (h.par_unite ? qte(parId.get(h.ligne_id)) : 1));
  for (const f of libres) if (f.heures_info) ajouter(f.ligne_id, cleMetier(f.metier_id), Number(f.heures_info) * (f.par_unite ? qte(parId.get(f.ligne_id)) : 1));

  // Heures d'un sous-arbre : les enfants directs qui sont des options non incluses ont leur propre ligne.
  const memo = new Map<string, Map<string, number>>();
  const sousArbre = (id: string): Map<string, number> => {
    const deja = memo.get(id);
    if (deja) return deja;
    const acc = new Map<string, number>(propres.get(id) ?? []);
    for (const k of kids(id)) {
      if (k.type === "commentaire" || estOptionHors(k)) continue;
      for (const [cle, h] of sousArbre(k.id)) acc.set(cle, r2((acc.get(cle) ?? 0) + h));
    }
    memo.set(id, acc);
    return acc;
  };

  // Colonnes de métier : ceux réellement présents, dans l'ordre des métiers, « Sans métier » en dernier.
  const vus = new Set<string>();
  for (const m of propres.values()) for (const cle of m.keys()) vus.add(cle);
  const cles = d.metiers.map((m) => String(m.id)).filter((c) => vus.has(c));
  if (vus.has("aucun")) cles.push("aucun");

  const visibles = ordreArbre(d.lignes).filter((l) => l.type !== "commentaire");
  const compteurs: number[] = [];
  const lignesObjets: Cellule[][] = [[...COLONNES_OBJETS, ...cles.map(libelleMetier), "Total h", "Total avec enfants"]];
  const lignesDetail: Cellule[][] = [[...COLONNES_DETAIL]];
  const lignesMat: Cellule[][] = [[...COLONNES_MATERIAUX]];
  const numeros = new Map<string, string>();
  const totalParMetier = new Map<string, number>();
  const optionsHors: { libelle: string; heures: number }[] = [];

  for (const l of visibles) {
    compteurs[l.profondeur] = (compteurs[l.profondeur] ?? 0) + 1;
    compteurs.length = l.profondeur + 1;
    const n = compteurs.slice(0, l.profondeur + 1).join(".");
    numeros.set(l.id, n);
    const own = propres.get(l.id) ?? new Map<string, number>();
    const hors = horsTotal(l);
    const totalOwn = r2([...own.values()].reduce((s, h) => s + h, 0));
    const totalSous = r2([...sousArbre(l.id).values()].reduce((s, h) => s + h, 0));
    lignesObjets.push([
      n, l.libelle?.trim() || LABEL_TYPE[l.type] || "Ligne", LABEL_TYPE[l.type] ?? l.type, qte(l),
      hors ? "non (option)" : "oui",
      ...cles.map((c) => (own.get(c) ? r2(own.get(c)!) : null)),
      totalOwn || null, totalSous || null,
    ]);
    if (hors) {
      // Seule l'option elle-même est listée dans le récapitulatif, pas chacun de ses objets.
      const parent = l.parent_id ? parId.get(l.parent_id) : undefined;
      if (!parent || !horsTotal(parent)) optionsHors.push({ libelle: `${n} ${l.libelle?.trim() || LABEL_TYPE[l.type] || "Option"}`, heures: totalSous });
    } else for (const [cle, h] of own) totalParMetier.set(cle, r2((totalParMetier.get(cle) ?? 0) + h));
  }

  // Fiches objets : descriptif synthétique, commentaires (enfants « commentaire » et texte propre) et images.
  const photos = (d.photos ?? []).filter((p) => parId.has(p.ligne_id) && p.mime !== "application/pdf");
  const fichesObjets: FicheObjet[] = [];
  const lignesDesc: Cellule[][] = [["N°", "Désignation", "Type", "Qté", "Dimensions (mm)", "Finition", "Description synthétique", "Commentaire", "Images"]];
  for (const l of visibles) {
    if (l.type === "zone" || l.type === "chapitre_suivi") continue;
    const commentaires = [l.texte, ...d.lignes.filter((k) => k.parent_id === l.id && k.type === "commentaire").sort((a, b) => a.ordre - b.ordre).map((k) => k.texte)]
      .map((t) => (t ?? "").trim()).filter(Boolean);
    const dims = [l.longueur_mm, l.largeur_mm, l.hauteur_mm].some((v) => v) ? [l.longueur_mm, l.largeur_mm, l.hauteur_mm].map((v) => (v ? String(v) : "—")).join(" × ") : null;
    const ph = photos.filter((p) => p.ligne_id === l.id).map((p) => ({ chemin: p.chemin, legende: p.legende }));
    const descriptif = l.descriptif_client?.trim() || null;
    const fiche: FicheObjet = { numero: numeros.get(l.id) ?? "", libelle: l.libelle?.trim() || LABEL_TYPE[l.type] || "Ligne", type: LABEL_TYPE[l.type] ?? l.type,
      quantite: qte(l), dimensions: dims, finition: l.finition?.trim() || null, descriptif, commentaires, photos: ph };
    if (l.type !== "objet" && !descriptif && !commentaires.length && !ph.length) continue;
    fichesObjets.push(fiche);
    lignesDesc.push([fiche.numero, fiche.libelle, fiche.type, fiche.quantite, dims ?? "—", fiche.finition ?? "—", descriptif ?? "—", commentaires.join("\n\n") || "—", ph.length || null]);
  }

  // Détail : une ligne par saisie d'heure, puis par ligne libre portant des heures.
  const objetDe = (ligneId: string) => {
    const l = parId.get(ligneId);
    return `${numeros.get(ligneId) ?? ""} ${l?.libelle?.trim() || (l ? LABEL_TYPE[l.type] ?? l.type : "Ligne")}`.trim();
  };
  for (const h of heures) {
    const l = parId.get(h.ligne_id);
    lignesDetail.push([numeros.get(h.ligne_id) ?? "", objetDe(h.ligne_id), h.poste_libelle ?? "—", h.niveau ?? "—",
      r2(Number(h.heures)), h.par_unite ? "oui" : "non", r2(Number(h.heures) * (h.par_unite && l ? qte(l) : 1))]);
  }
  for (const f of libres) {
    if (!f.heures_info) continue;
    const l = parId.get(f.ligne_id);
    lignesDetail.push([numeros.get(f.ligne_id) ?? "", objetDe(f.ligne_id), f.designation || "Ligne libre", "Forfait",
      r2(Number(f.heures_info)), f.par_unite ? "oui" : "non", r2(Number(f.heures_info) * (f.par_unite && l ? qte(l) : 1))]);
  }

  // Matériaux : désignation, fournisseur, réf, unité, quantité — jamais de prix.
  const matsOrdonnes = [...materiaux].sort((a, b) => (numeros.get(a.ligne_id) ?? "").localeCompare(numeros.get(b.ligne_id) ?? "") || a.designation.localeCompare(b.designation));
  for (const m of matsOrdonnes) {
    lignesMat.push([numeros.get(m.ligne_id) ?? "", objetDe(m.ligne_id), m.designation, m.fournisseur ?? "—", m.ref ?? "—", m.unite ?? "—", r2(Number(m.quantite))]);
  }

  const totalHeures = r2([...totalParMetier.values()].reduce((s, h) => s + h, 0));
  const heuresParMetier = cles.map((c) => ({ metier: libelleMetier(c), heures: r2(totalParMetier.get(c) ?? 0) })).filter((x) => x.heures > 0);
  const synthese: Cellule[][] = [
    ["Élément", "Valeur"],
    ["Devis", d.numero],
    ["Version", d.version == null ? "—" : `R${d.version}`],
    ["Libellé", d.libelle ?? "—"],
    ["Client", d.client ?? "—"],
    ["Affaire", d.affaire ?? "—"],
    ["Date du devis", d.date_devis ?? "—"],
    ["Validité", d.date_validite ?? "—"],
    ...(ignores ? [["Éléments ignorés", `${ignores} (ligne mise à la corbeille)`] as Cellule[]] : []),
    ["", ""],
    ["Heures par métier", "Heures"],
    ...heuresParMetier.map((x) => [x.metier, x.heures] as Cellule[]),
    ["Total heures", totalHeures],
    ["", ""],
    ["Options hors total", "Heures"],
    ...(optionsHors.length ? optionsHors.map((o) => [o.libelle, o.heures] as Cellule[]) : [["Aucune", null] as Cellule[]]),
    ["", ""],
    ["Total HT", r2(d.total_ht)],
    ["Net HT", r2(d.net_ht)],
    ["", ""],
    ["Contient", "Descriptions et commentaires des objets, heures par objet, détail des heures, matériaux (désignation, fournisseur, réf, unité, quantité)"],
    ["Ne contient pas", "Taux, coûts de revient, prix d'achat, coefficients, marges"],
  ];

  return {
    synthese,
    objets: lignesObjets,
    detail: lignesDetail,
    materiaux: lignesMat,
    descriptions: lignesDesc,
    fiches_objets: fichesObjets,
    fiche: {
      numero: d.numero, version: d.version, client: d.client, affaire: d.affaire,
      nb_lignes: visibles.length,
      nb_objets: visibles.filter((l) => l.type === "objet").length,
      nb_materiaux: materiaux.length,
      nb_heures: heures.length + libres.filter((f) => f.heures_info).length,
      nb_ignores: ignores,
      total_heures: totalHeures, heures_par_metier: heuresParMetier, options_hors_total: optionsHors,
      total_ht: r2(d.total_ht), net_ht: r2(d.net_ht),
    },
  };
}

/** Contrôle de non-régression : aucune cellule de donnée ne doit mentionner un champ de coût. */
export function cellulesInterdites(res: ResultatEquipe): string[] {
  const feuilles: Cellule[][][] = [res.synthese, res.objets, res.detail, res.materiaux];
  const fautes: string[] = [];
  for (const f of feuilles) for (const ligne of f) {
    // La ligne de mention « Ne contient pas : … » nomme volontairement les champs exclus.
    if (String(ligne[0] ?? "") === "Ne contient pas") continue;
    for (const c of ligne) {
      if (typeof c !== "string") continue;
      const t = c.toLowerCase();
      for (const mot of MOTS_INTERDITS) if (t.includes(mot)) fautes.push(c);
    }
  }
  return fautes;
}
