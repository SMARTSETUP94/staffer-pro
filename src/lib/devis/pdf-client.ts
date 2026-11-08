/**
 * PDF client d'un devis Staffing (format Set Up Paris), construit uniquement depuis devis_lire_client :
 * aucune heure, taux, coût, prix d'achat, coefficient, marge, ligne interne ni note de Claude n'y figure.
 * Module pur (navigateur et serveur) : les images sont passées en octets.
 */
import { jsPDF } from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";

export type NiveauPdf = "detaille" | "synthetique";
export type LigneClient = {
  id: string; parent_id: string | null; type: string; ordre: number; libelle: string | null; quantite: number | null;
  descriptif_client: string | null; longueur_mm: number | null; largeur_mm: number | null; hauteur_mm: number | null;
  finition: string | null; texte: string | null; option_incluse?: boolean | null; montant: number | null; sous_total: number | null;
};
export type DevisClient = {
  id?: string; numero: string; numero_progbat?: string | null; version?: number; statut_redaction?: string; libelle: string | null; date_devis: string | null;
  validite_jours: number | null; date_validite?: string | null;
  societe?: { raison_sociale?: string | null; marque?: string | null; adresse?: string | null; code_postal?: string | null; ville?: string | null; siret?: string | null; email?: string | null } | null;
  client: { nom: string; adresse: string | null; code_postal: string | null; ville: string | null; pays?: string | null; siret?: string | null; tva_intracom?: string | null } | null;
  client_final: string | null; contact: { nom: string; email: string | null } | null;
  dates: Record<string, string | null> | null; lignes: LigneClient[];
  photos: { ligne_id: string; storage_path: string; thumb_path: string | null; legende: string | null; mime: string | null }[];
  total_ht: number; remise?: number; net_ht?: number; tva: number; tva_pct: number; ttc: number; options_ht?: number;
  /** Champs du modèle ProGBat, affichés seulement s'ils sont fournis par le lecteur client. */
  chantier?: { adresse?: string | null; travaux?: string | null; debut?: string | null; duree_jours?: number | null } | null;
  signataire?: { nom: string; email: string | null; telephone?: string | null } | null;
  mentions_legales?: { forme?: string | null; capital?: string | null; telephone?: string | null; email?: string | null; ape?: string | null; tva?: string | null; iban?: string | null; bic?: string | null } | null;
  /** Encadré de mentions (paramètres entreprise), une ligne par mention ; défaut MENTIONS_MODELE. */
  mentions_devis?: string | null;
  cgv?: string | null;
};
export type ImagePdf = { bytes: Uint8Array; format: "JPEG" | "PNG" };

export const TYPE_RACINE: Record<string, string> = {
  zone: "Zone", chapitre_suivi: "Suivi et plans", chapitre_pose: "Pose", chapitre_depose: "Dépose", option: "Option", objet: "Objet",
};
const DATES: [string, string][] = [
  ["date_visite_technique", "Visite technique"], ["date_montage", "Montage"], ["date_evenement_debut", "Événement du"],
  ["date_evenement_fin", "Événement au"], ["date_demontage", "Démontage"],
];

/** Montant français sans espace insécable (non pris en charge par les polices PDF standard). */
export function eurPdf(v: number | null | undefined) {
  const n = Math.round(Number(v ?? 0) * 100) / 100;
  const [e, d] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${e.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${d} €`;
}
export const datePdf = (s: string | null | undefined) => {
  if (!s) return "";
  const [y, m, d] = s.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : s;
};
/** Référence affichée : le numéro porte déjà la version (9484-R2) ou on l'ajoute. */
export const refDevis = (vc: Pick<DevisClient, "numero" | "version">) => /-R\d+$/.test(vc.numero) || !vc.version ? vc.numero : `${vc.numero}-R${vc.version}`;
export const avecFiligrane = (statut?: string) => statut === "brouillon" || statut === "a_valider";
export const nomFichierPdf = (vc: Pick<DevisClient, "numero" | "version">, niveau: NiveauPdf) =>
  `Devis ${refDevis(vc)}${niveau === "synthetique" ? " (synthèse)" : ""}.pdf`.replace(/[\\/:*?"<>|]/g, "-");

const aDims = (t: string) => /dimensions\s*:/i.test(t);
const aFinition = (t: string) => /finition\s*:/i.test(t);
/** Détail d'un objet : dimensions et finition une seule fois (le descriptif du modèle les contient souvent déjà). */
export function detailObjet(l: LigneClient) {
  const desc = (l.descriptif_client ?? "").trim();
  const d = [l.longueur_mm, l.largeur_mm, l.hauteur_mm].filter((x) => x != null && Number(x) > 0).map((x) => String(Number(x)));
  return [!aDims(desc) && d.length ? `${d.join(" × ")} mm` : "", !aFinition(desc) ? (l.finition ?? "").trim() : "", desc].filter(Boolean).join("\n");
}
const enfants = (vc: DevisClient, p: string) => vc.lignes.filter((l) => l.parent_id === p).sort((a, b) => a.ordre - b.ordre);
/** Montant d'une ligne : sous-total serveur, sinon montant propre + enfants (sous-zones sans sous-total). */
function montantDeIn(vc: DevisClient | null, l: LigneClient): number {
  if (l.sous_total != null) return Number(l.sous_total);
  const kids = vc ? enfants(vc, l.id).filter((k) => k.type !== "commentaire" && !(k.type === "option" && !k.option_incluse)) : [];
  return Number(l.montant ?? 0) + kids.reduce((s, k) => s + montantDeIn(vc, k), 0);
}
const montantDe = (l: LigneClient) => Number(l.sous_total ?? l.montant ?? 0);
/** Options non incluses sous une ligne : leur montant est exclu des sous-totaux affichés. */
export function optionsNonIncluses(vc: DevisClient, l: LigneClient): number {
  return enfants(vc, l.id).reduce((s, k) => s + (k.type === "option" ? (k.option_incluse ? 0 : montantDe(k)) : optionsNonIncluses(vc, k)), 0);
}
export const totalAffiche = (vc: DevisClient, l: LigneClient) =>
  Math.round((l.sous_total != null ? Number(l.sous_total) - optionsNonIncluses(vc, l) : montantDeIn(vc, l)) * 100) / 100;
/** Titre client d'un chapitre : jamais le libellé interne. */
export function titreCourt(r: Pick<LigneClient, "type" | "libelle">) {
  const lib = (r.libelle ?? "").trim();
  if (r.type === "zone" || r.type === "objet") return lib || TYPE_RACINE[r.type];
  if (r.type === "chapitre_suivi") return "Études et suivi de projet";
  if (r.type === "chapitre_pose") return /^livraison/i.test(lib) ? "Livraison et mise en place" : "Pose et mise en place";
  if (r.type === "chapitre_depose") return "Reprise";
  if (r.type === "option") return lib || "Option";
  return TYPE_RACINE[r.type] ?? (lib || "Chapitre");
}
/** Libellé interne complet (conservé en commentaire dans l'Excel ProGBat). */
export const descriptifChapitre = (r: Pick<LigneClient, "type" | "libelle">) => {
  const lib = (r.libelle ?? "").trim();
  return lib && lib.toLocaleLowerCase("fr") !== titreCourt(r).toLocaleLowerCase("fr") && lib !== TYPE_RACINE[r.type] ? lib : "";
};
/** Descriptif court client d'un chapitre : date, lieu, moyens (lus dans le libellé), en casse normale. */
export function descriptifClientChapitre(vc: Pick<DevisClient, "dates" | "chantier">, r: Pick<LigneClient, "type" | "libelle" | "descriptif_client">) {
  const lib = (r.libelle ?? "").trim();
  const moyens = /\(([^)]+)\)\s*$/.exec(lib)?.[1]?.trim();
  const date = r.type === "chapitre_pose" ? vc.dates?.date_montage : r.type === "chapitre_depose" ? vc.dates?.date_demontage : null;
  const dateLib = /(veille|matin|soir|nuit)[^,()]*\d{2}\/\d{2}\/\d{4}/i.exec(lib)?.[0];
  const dateBrute = /\b\d{2}\/\d{2}\/\d{4}\b/.exec(lib)?.[0];
  const lieu = vc.chantier?.adresse || (r.type === "chapitre_pose"
    ? (/\s–\s([^,()]+)/.exec(lib)?.[1] ?? /\ben ((?:Île|Ile|[A-ZÉÈ])[^,()]*?)(?=\s+le\s+\d|\s*[,(]|$)/.exec(lib)?.[1])?.trim() : undefined);
  const parts = [
    dateLib ? dateLib.charAt(0).toUpperCase() + dateLib.slice(1) : date ? `Le ${datePdf(date)}` : dateBrute ? `Le ${dateBrute}` : "",
    lieu && r.type !== "chapitre_suivi" ? `Lieu : ${lieu}` : "",
    moyens ? `Moyens : ${moyens}` : "",
    (r.descriptif_client ?? "").trim(),
  ].filter(Boolean);
  // À défaut d'éléments repérés, un libellé court et lisible sert de descriptif (casse d'origine).
  if (!parts.length && lib && lib.length <= 90 && !/\(/.test(lib) && lib.toLocaleLowerCase("fr") !== titreCourt(r).toLocaleLowerCase("fr") && lib !== TYPE_RACINE[r.type]) parts.push(lib);
  return parts.join("\n");
}
/** Nom propre du chantier : sans préfixe interne « 9500_ », soulignés remplacés. */
export function nomPropreChantier(libelle: string | null | undefined) {
  return (libelle ?? "").replace(/^\s*\d{4,5}\s*[_\-–:]\s*/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}
export const codeChantier = (numero: string) => numero.replace(/-R\d+$/, "");

export type LigneTableau = { n: string; designation: string; detail?: string; unite: string; qte: string; pu: string; total: string; style: "objet" | "commentaire" | "sous" | "forfait"; ligneId?: string };

/** Lignes du tableau sous une racine (zone ou chapitre), numérotées N.1, N.1.1… — options exclues (section dédiée). */
export function lignesTableau(vc: DevisClient, racine: LigneClient, niveau: NiveauPdf, prefixe = "") {
  const rows: LigneTableau[] = [];
  const walk = (p: string, pre: string) => {
    let k = 0;
    for (const l of enfants(vc, p)) {
      if (l.type === "option") continue;
      if (l.type === "commentaire") { if (l.texte?.trim()) rows.push({ n: "", designation: l.texte.trim(), unite: "", qte: "", pu: "", total: "", style: "commentaire" }); continue; }
      k += 1; const n = pre ? `${pre}.${k}` : String(k);
      const q = Number(l.quantite ?? 1) || 1;
      const total = totalAffiche(vc, l);
      const objet = l.type === "objet";
      const prix = niveau === "detaille";
      rows.push({
        n, designation: l.libelle ?? "", ligneId: l.id,
        detail: prix ? (objet ? detailObjet(l) : (l.descriptif_client ?? "").trim()) : "",
        unite: objet ? "u" : l.type === "zone" ? "" : "ens", qte: l.type === "zone" ? "" : String(objet ? q : 1),
        pu: prix && l.type !== "zone" ? eurPdf(objet ? total / q : total) : "", total: prix || l.type === "zone" ? eurPdf(total) : "",
        style: objet ? "objet" : "sous",
      });
      walk(l.id, n);
    }
  };
  walk(racine.id, prefixe);
  return rows;
}

/** Toutes les options (racine ou dans une zone), avec leur zone de rattachement. */
export function optionsDevis(vc: DevisClient) {
  const parent = (l: LigneClient) => vc.lignes.find((x) => x.id === l.parent_id);
  return vc.lignes.filter((l) => l.type === "option").sort((a, b) => a.ordre - b.ordre).map((o) => {
    let z = parent(o); while (z && z.parent_id) z = parent(z);
    return { ligne: o, zone: z ? titreCourt(z) : null, montant: montantDe(o), incluse: !!o.option_incluse };
  });
}

/** Fiche client incomplète : champs exigés par ProGBat et par le bloc client du PDF (avertissement, non bloquant). */
export function champsClientManquants(c: DevisClient["client"]) {
  if (!c) return ["client"];
  return ([["adresse", c.adresse], ["code postal", c.code_postal], ["ville", c.ville], ["SIRET", c.siret], ["TVA intracommunautaire", c.tva_intracom]] as const).filter(([, v]) => !String(v ?? "").trim()).map(([k]) => k);
}

export const MENTIONS_MODELE = [
  "Ce devis est établi sur les informations disponibles à ce jour et ne constitue pas une offre forfaitaire. Toute modification ou ajout entraînera un coût additionnel.",
  "• L'éclairage n'est pas inclus.",
  "• Le décor n'est pas classé résistant au feu.",
  "• Les options ne sont pas comprises dans le total.",
];
export const CONDITIONS_REGLEMENT = [
  "En cas de retard de paiement, des pénalités sont exigibles au taux de trois fois le taux d'intérêt légal, ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce).",
];
const nf2 = (v: number) => eurPdf(v).replace(" €", "");

/** Charte SET UP. */
type RGB = [number, number, number];
export const CHARTE = {
  encre: [29, 29, 27] as RGB, bleu: [21, 56, 169] as RGB, bleuVif: [47, 91, 255] as RGB, gris: [92, 96, 104] as RGB,
  filet: [221, 225, 230] as RGB, fond: [244, 246, 248] as RGB, bleuClair: [232, 237, 251] as RGB,
  points: [[228, 80, 26], [247, 196, 48], [141, 193, 85], [125, 203, 238]] as RGB[],
};
export type PolicesPdf = { interRegular: string; interBold: string; interItalic: string; soraBold: string };
export type OptionsPdf = { polices?: PolicesPdf; logo?: ImagePdf | null };

export function construireDevisPdf(vc: DevisClient, niveau: NiveauPdf, images: Record<string, ImagePdf> = {}, opts: OptionsPdf = {}): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 15, BAS = 270;
  const C = CHARTE;
  // Polices : Inter (texte) et Sora (titres) si fournies, sinon Helvetica.
  let T = "helvetica", H = "helvetica";
  if (opts.polices) {
    const P = opts.polices;
    doc.addFileToVFS("Inter-Regular.ttf", P.interRegular); doc.addFont("Inter-Regular.ttf", "Inter", "normal");
    doc.addFileToVFS("Inter-Bold.ttf", P.interBold); doc.addFont("Inter-Bold.ttf", "Inter", "bold");
    doc.addFileToVFS("Inter-Italic.ttf", P.interItalic); doc.addFont("Inter-Italic.ttf", "Inter", "italic");
    doc.addFileToVFS("Sora-Bold.ttf", P.soraBold); doc.addFont("Sora-Bold.ttf", "Sora", "bold");
    T = "Inter"; H = "Sora";
  }
  const font = (f: "t" | "tb" | "ti" | "h", size: number, color: RGB = C.encre) => {
    doc.setFont(f === "h" ? H : T, f === "tb" || f === "h" ? "bold" : f === "ti" ? "italic" : "normal"); doc.setFontSize(size); doc.setTextColor(...color);
  };
  const s = vc.societe ?? {}, ml = vc.mentions_legales ?? {};
  const ref = refDevis(vc);
  const validite = vc.date_validite ?? vc.dates?.date_validite ?? null;

  // ── En-tête gauche : logo (ou marque) + émetteur
  let yL = 14;
  if (opts.logo) {
    try { const pr = doc.getImageProperties(opts.logo.bytes); const w = 46, h = Math.min(22, (pr.height / pr.width) * w); doc.addImage(opts.logo.bytes, opts.logo.format, M, yL, (pr.width / pr.height) * h, h); yL += h + 4; }
    catch { yL += 0; }
  } else {
    font("h", 20); doc.text("SET UP", M, yL + 7);
    C.points.forEach((c, i) => { doc.setFillColor(...c); doc.circle(M + doc.getTextWidth("SET UP") + 3 + i * 3.4, yL + 5.6, 1.2, "F"); });
    font("ti", 8.5, C.gris); doc.text("constructeur d'imaginaire", M, yL + 12); yL += 18;
  }
  font("tb", 8.5); doc.text([s.raison_sociale || "Smart Restructuring", s.marque || "SET UP"].join(" – "), M, yL);
  font("t", 8.5, C.gris);
  const emet = [s.adresse, [s.code_postal, s.ville].filter(Boolean).join(" "), ml.telephone, ml.email].filter(Boolean) as string[];
  doc.text(emet, M, yL + 4.2); yL += 4.2 + emet.length * 3.8;

  // ── En-tête droit : devis, chantier, travaux, validité, début, signataire
  const X = W - M;
  font("h", 14, C.bleu); doc.text(`Devis n° ${ref}`, X, 20, { align: "right" });
  font("t", 9, C.gris); doc.text(`du ${datePdf(vc.date_devis) || "—"}`, X, 25, { align: "right" });
  const debut = vc.chantier?.debut ?? null;
  const lignesD: [string, string][] = [
    ["Chantier", `${codeChantier(vc.numero)} ${nomPropreChantier(vc.libelle)}`.trim()],
    ...(vc.chantier?.adresse ? [["Lieu", vc.chantier.adresse] as [string, string]] : []),
    ["Travaux", vc.chantier?.travaux || "Fabrication décor"],
    ["Validité", datePdf(validite) || (vc.validite_jours ? `${vc.validite_jours} jours` : "—")],
    ...(vc.dates?.date_evenement_debut ? [["Événement", `${datePdf(vc.dates.date_evenement_debut)}${vc.dates?.date_evenement_fin && vc.dates.date_evenement_fin !== vc.dates.date_evenement_debut ? ` au ${datePdf(vc.dates.date_evenement_fin)}` : ""}`] as [string, string]] : []),
    ...(debut ? [["Début des travaux", `${datePdf(debut)}${vc.chantier?.duree_jours ? ` · ${vc.chantier.duree_jours} jours` : ""}`] as [string, string]] : []),
  ];
  let yR = 31;
  for (const [k, v] of lignesD) {
    font("t", 8.8); const lv = doc.splitTextToSize(v, 70);
    doc.text(lv, X, yR, { align: "right" });
    font("tb", 8.8, C.gris); doc.text(`${k} : `, X - Math.max(...lv.map((x: string) => { font("t", 8.8); return doc.getTextWidth(x); })), yR, { align: "right" });
    yR += lv.length * 4.1;
  }
  if (vc.signataire) { font("tb", 8.8, C.bleu); doc.text([vc.signataire.nom, vc.signataire.email, vc.signataire.telephone].filter(Boolean).join(" – "), X, yR + 1, { align: "right" }); yR += 5; }
  if (vc.numero_progbat && /^D-\d{6}-\d{4}$/.test(vc.numero_progbat)) { font("t", 7.5, C.gris); doc.text(`Réf. ProGBat : ${vc.numero_progbat}`, X, yR + 1, { align: "right" }); yR += 4; }

  // ── Bloc client
  let y = Math.max(yL, yR) + 5;
  const c = vc.client;
  const cl = [c?.adresse, [c?.code_postal, c?.ville].filter(Boolean).join(" ") + (c && (c.code_postal || c.ville) ? ` ${c.pays || "France"}` : ""),
    c?.tva_intracom ? `T.V.A. : ${c.tva_intracom}` : "", vc.client_final ? `Client final : ${vc.client_final}` : ""].map((x) => (x ?? "").trim()).filter(Boolean) as string[];
  const att = vc.contact?.nom?.trim() ? `À l'attention de ${vc.contact.nom.trim()}` : "";
  const hc = 11 + cl.length * 4 + (att ? 5 : 0);
  const xc = W / 2 + 5, wc = W / 2 - M - 5;
  doc.setFillColor(...C.fond); doc.roundedRect(xc, y, wc, hc, 1.5, 1.5, "F");
  doc.setFillColor(...C.bleu); doc.rect(xc, y, 1.2, hc, "F");
  font("h", 10.5); doc.text(c?.nom ?? "", xc + 5, y + 6.5);
  font("t", 8.8); doc.text(cl, xc + 5, y + 11.5);
  if (att) { font("ti", 8.8, C.gris); doc.text(att, xc + 5, y + 11.5 + cl.length * 4 + 1); }
  y += hc + 6;

  // ── Encadré des mentions
  const mentions = vc.mentions_devis?.trim() ? vc.mentions_devis.trim().split(/\r?\n/).filter(Boolean) : MENTIONS_MODELE;
  font("t", 8); const lm = doc.splitTextToSize(mentions.join("\n"), W - 2 * M - 10);
  const hm = lm.length * 3.6 + 5;
  doc.setDrawColor(...C.filet); doc.setFillColor(255, 255, 255); doc.setLineWidth(0.3); doc.roundedRect(M, y, W - 2 * M, hm, 1.5, 1.5, "S");
  doc.setFillColor(...C.points[1]); doc.rect(M, y + 2, 1, hm - 4, "F");
  font("t", 8, C.gris); doc.text(lm, M + 5, y + 4.6); y += hm + 6;

  // ── Tableau
  const racines = vc.lignes.filter((l) => !l.parent_id && l.type !== "commentaire" && l.type !== "option").sort((a, b) => a.ordre - b.ordre);
  const comRacine = vc.lignes.filter((l) => !l.parent_id && l.type === "commentaire" && l.texte?.trim()).sort((a, b) => a.ordre - b.ordre);
  const detaille = niveau === "detaille";
  const corps: any[] = [];
  const vide = { content: "" };
  const descr = (texte: string) => corps.push([vide, { content: texte, colSpan: 5, styles: { font: T, fontStyle: "italic", textColor: C.gris, fontSize: 8, cellPadding: { top: 0.6, bottom: 2.4, left: 3, right: 3 } } }]);
  const vignettes = (ligneId?: string) => {
    if (!detaille || !ligneId) return;
    const ph = vc.photos.filter((p) => p.ligne_id === ligneId && images[p.thumb_path ?? p.storage_path]).slice(0, 3);
    if (ph.length) corps.push([vide, { content: "", colSpan: 5, styles: { minCellHeight: 30 }, imgs: ph.map((p) => images[p.thumb_path ?? p.storage_path]) }]);
  };
  const ligne = (r: LigneTableau) => {
    if (r.style === "commentaire") { descr(r.designation); return; }
    if (r.style === "sous") {
      const st = { font: H, fontStyle: "bold", textColor: C.encre, fontSize: 8.8, cellPadding: { top: 2.6, bottom: 1.2, left: 2, right: 2 } };
      corps.push([{ content: r.n, styles: { ...st, textColor: C.gris } }, { content: r.designation, colSpan: 4, styles: st }, { content: r.total, styles: { ...st, halign: "right" } }]);
      if (r.detail) descr(r.detail);
      return;
    }
    const fond = r.style === "objet" || r.style === "forfait" ? { fillColor: C.bleuClair } : {};
    corps.push([{ content: r.n, styles: { ...fond, textColor: C.gris } }, { content: r.designation, styles: { ...fond, fontStyle: "bold" } }, { content: r.unite, styles: fond }, { content: r.qte, styles: fond },
      { content: r.pu, styles: fond }, { content: r.total, styles: { ...fond, fontStyle: "bold" } }]);
    if (r.detail) descr(r.detail);
    vignettes(r.ligneId);
  };
  let N = 0;
  for (const r of racines) {
    N += 1; const n = String(N);
    const kids = enfants(vc, r.id).filter((k) => k.type !== "commentaire" && k.type !== "option");
    const titre = titreCourt(r), total = totalAffiche(vc, r);
    const chap = r.type.startsWith("chapitre_");
    const dchap = chap ? descriptifClientChapitre(vc, r) : "";
    if (r.type === "objet") {
      const q = Number(r.quantite ?? 1) || 1;
      ligne({ n, designation: r.libelle ?? "", ligneId: r.id, detail: detaille ? detailObjet(r) : "", unite: "u", qte: String(q), pu: detaille ? eurPdf(total / q) : "", total: detaille ? eurPdf(total) : "", style: "objet" });
      for (const row of lignesTableau(vc, r, niveau, n)) ligne(row);
      continue;
    }
    if (chap && kids.length === 0) {
      ligne({ n, designation: titre, unite: "ens", qte: "1", pu: eurPdf(total), total: eurPdf(total), style: "forfait" });
      if (dchap) descr(dchap);
      continue;
    }
    // Intertitre sobre de zone ou de chapitre détaillé
    corps.push([{ content: n, styles: { font: H, fontStyle: "bold", textColor: C.bleu, fontSize: 9.5, cellPadding: { top: 3.5, bottom: 1.5, left: 2, right: 2 }, lineWidth: { bottom: 0.4 }, lineColor: C.bleu } },
      { content: titre, colSpan: 4, styles: { font: H, fontStyle: "bold", textColor: C.bleu, fontSize: 9.5, cellPadding: { top: 3.5, bottom: 1.5, left: 2, right: 2 }, lineWidth: { bottom: 0.4 }, lineColor: C.bleu } },
      { content: eurPdf(total), styles: { font: H, fontStyle: "bold", textColor: C.bleu, fontSize: 8.6, halign: "right", cellPadding: { top: 3.5, bottom: 1.5, left: 2, right: 2 }, lineWidth: { bottom: 0.4 }, lineColor: C.bleu } }]);
    if (dchap) descr(dchap);
    const forfait = chap ? Number(r.montant ?? 0) : 0;
    let decal = 0;
    if (forfait) { decal = 1; ligne({ n: `${n}.1`, designation: `Forfait ${titre.toLocaleLowerCase("fr")}`, unite: "ens", qte: "1", pu: detaille ? eurPdf(forfait) : "", total: detaille ? eurPdf(forfait) : "", style: "forfait" }); }
    for (const row of lignesTableau(vc, r, niveau, n)) {
      if (decal && row.n) row.n = row.n.replace(new RegExp(`^${n}\\.(\\d+)`), (_m, k) => `${n}.${Number(k) + decal}`);
      ligne(row);
    }
  }
  const tableStyles = { font: T, fontSize: 8.6, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, textColor: C.encre, lineColor: C.filet, lineWidth: { bottom: 0.15 }, valign: "top" as const };
  const colonnes = { 0: { cellWidth: 13 }, 1: { cellWidth: 97 }, 2: { cellWidth: 10, halign: "center" as const }, 3: { cellWidth: 12, halign: "right" as const }, 4: { cellWidth: 24, halign: "right" as const }, 5: { cellWidth: 24, halign: "right" as const } };
  const dessinerImages = (data: any) => {
    const imgs = data.cell?.raw?.imgs as ImagePdf[] | undefined;
    if (!imgs?.length || data.section !== "body") return;
    let x = data.cell.x + 3;
    for (const img of imgs) {
      try { const pr = doc.getImageProperties(img.bytes); const h = 26, w = Math.min(40, (pr.width / pr.height) * h); doc.addImage(img.bytes, img.format, x, data.cell.y + 2, w, (pr.height / pr.width) * w > h ? h : (pr.height / pr.width) * w); x += w + 3; } catch { /* image illisible : omise */ }
    }
  };
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, bottom: 300 - BAS },
    head: [["N°", "Désignation", "U", "Qté", "PU HT", "Total HT"]],
    body: corps.length ? corps : [[vide, { content: "Aucune ligne chiffrée", colSpan: 5 }]],
    styles: tableStyles, headStyles: { fillColor: C.bleu, textColor: [255, 255, 255], font: T, fontStyle: "bold", lineWidth: 0 },
    columnStyles: colonnes, didDrawCell: dessinerImages,
  });
  y = (doc as any).lastAutoTable.finalY + 6;
  const place = (h: number) => { if (y + h > BAS) { doc.addPage(); y = 20; } };

  // ── Options (non comprises dans le total)
  const opts2 = optionsDevis(vc);
  if (opts2.length) {
    place(20); font("h", 10, C.bleu); doc.text("Options (non comprises dans le total)", M, y); y += 2;
    const corpsO: any[] = [];
    opts2.forEach((o, i) => {
      corpsO.push([{ content: `O${i + 1}`, styles: { textColor: C.gris } }, { content: `${o.ligne.libelle ?? "Option"}${o.zone ? ` — ${o.zone}` : ""}${o.incluse ? " (incluse dans le total)" : ""}`, styles: { fontStyle: "bold" } }, "ens", "1",
        detaille ? eurPdf(o.montant) : "", { content: eurPdf(o.montant), styles: { fontStyle: "bold" } }]);
      const d = (o.ligne.descriptif_client ?? "").trim(); if (detaille && d) corpsO.push([vide, { content: d, colSpan: 5, styles: { fontStyle: "italic", textColor: C.gris, fontSize: 8 } }]);
    });
    autoTable(doc, { startY: y, margin: { left: M, right: M, bottom: 300 - BAS }, body: corpsO, styles: tableStyles, columnStyles: colonnes });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── Totaux : tableau TVA + encadré
  const remise = Math.abs(Number(vc.remise ?? 0)), net = Number(vc.net_ht ?? vc.total_ht);
  place(52);
  const xT = W - M - 72;
  const ligneTot = (l: string, v: string, fort = false): RowInput => [{ content: l, styles: fort ? { fontStyle: "bold" } : {} }, { content: v, styles: { halign: "right", ...(fort ? { fontStyle: "bold" } : {}) } }];
  autoTable(doc, {
    startY: y, margin: { left: xT, right: M }, tableWidth: 72,
    body: [ligneTot("Total HT", eurPdf(vc.total_ht)), ligneTot("Remise", eurPdf(-remise)), ligneTot("Total net HT", eurPdf(net), true), ligneTot(`TVA ${Number(vc.tva_pct)} %`, eurPdf(vc.tva)),
      [{ content: "Total TTC", styles: { fontStyle: "bold", fillColor: C.bleu, textColor: [255, 255, 255], font: H } }, { content: eurPdf(vc.ttc), styles: { halign: "right", fontStyle: "bold", fillColor: C.bleu, textColor: [255, 255, 255], font: H } }]],
    styles: { ...tableStyles, fontSize: 9, fillColor: C.fond },
  });
  const finTot = (doc as any).lastAutoTable.finalY;
  autoTable(doc, {
    startY: y, margin: { left: M, right: W - xT + 8 },
    head: [["% TVA", "Base HT", "Montant TVA"]], body: [[`${Number(vc.tva_pct).toFixed(2).replace(".", ",")} %`, eurPdf(net), eurPdf(vc.tva)]],
    styles: { ...tableStyles, fontSize: 8.6 }, headStyles: { fillColor: C.fond, textColor: C.gris, font: T, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });
  y = Math.max(finTot, (doc as any).lastAutoTable.finalY) + 7;

  // ── Règlement
  const acompte = Math.round(Number(vc.ttc) * 50) / 100;
  place(26);
  font("tb", 9); doc.text(`Acompte 50 % à la signature, soit ${eurPdf(acompte)} TTC`, M, y); y += 4.6;
  font("t", 8.5); doc.text(["Mode de règlement : virement", "Délai de règlement : 30 jours"], M, y); y += 8.6;
  font("t", 7.6, C.gris); const lr = doc.splitTextToSize(CONDITIONS_REGLEMENT.join("\n"), W - 2 * M); doc.text(lr, M, y); y += lr.length * 3.3 + 3;
  // Remarques du devis, sans redire l'acompte ni la mention « modification » déjà présents
  const remarques = comRacine.flatMap((x) => x.texte!.split(/\r?\n/)).map((t) => t.trim()).filter((t) => t && !/acompte|modification ou (demande|ajout)/i.test(t));
  if (remarques.length) {
    font("t", 8.2); const lc = doc.splitTextToSize(remarques.join("\n"), W - 2 * M);
    place(lc.length * 3.7 + 3); doc.text(lc, M, y); y += lc.length * 3.7 + 3;
  }

  // ── Signatures
  place(44);
  const bw = (W - 2 * M - 6) / 2;
  doc.setDrawColor(...C.filet); doc.setLineWidth(0.3); doc.roundedRect(M, y, bw, 40, 1.5, 1.5, "S"); doc.roundedRect(M + bw + 6, y, bw, 40, 1.5, 1.5, "S");
  font("h", 9.5); doc.text("Signature du client", M + 4, y + 6.5); doc.text("Pour SET UP", M + bw + 10, y + 6.5);
  font("t", 7.6, C.gris);
  doc.text(doc.splitTextToSize("Bon pour accord — date, mention « lu et approuvé », signature et cachet. Les travaux ne pourront pas débuter sans devis signé ou bon de commande.", bw - 8), M + 4, y + 11.5);
  if (vc.signataire) { font("t", 8.5); doc.text(vc.signataire.nom, M + bw + 10, y + 11.5); }

  // ── Conditions générales de vente
  if (vc.cgv?.trim()) {
    doc.addPage(); y = 20;
    font("h", 12, C.bleu); doc.text("Conditions générales de vente SET UP", M, y); y += 7;
    font("t", 7.4);
    for (const l of doc.splitTextToSize(vc.cgv.trim(), W - 2 * M)) { if (y > BAS) { doc.addPage(); y = 20; font("t", 7.4); } doc.text(l, M, y); y += 3.3; }
  }

  // ── Pied de page + filigrane
  const pied = [[s.raison_sociale, ml.forme, ml.capital ? `au capital de ${ml.capital}` : null, ml.telephone ? `Tél. ${ml.telephone}` : null, ml.email].filter(Boolean).join(" · "),
    [ml.ape ? `APE ${ml.ape}` : null, s.siret ? `SIRET ${s.siret}` : null, ml.tva ? `TVA intracom. ${ml.tva}` : null, ml.iban ? `IBAN ${ml.iban}` : null, ml.bic ? `BIC ${ml.bic}` : null].filter(Boolean).join(" · ")].filter(Boolean);
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.filet); doc.setLineWidth(0.3); doc.line(M, 276, W - M, 276);
    font("t", 6.6, C.gris); doc.text(pied, W / 2, 280, { align: "center" });
    font("tb", 7.4, C.gris); doc.text(ref, M, 290); font("t", 7.4, C.gris); doc.text(`page ${i} / ${n}`, W - M, 290, { align: "right" });
    if (avecFiligrane(vc.statut_redaction)) {
      doc.saveGraphicsState();
      doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
      doc.setFont(H, "bold"); doc.setFontSize(110); doc.setTextColor(...C.points[0]);
      doc.text("PROJET", W / 2, 175, { align: "center", angle: 35 });
      doc.restoreGraphicsState();
    }
  }
  return doc.output("arraybuffer");
}
