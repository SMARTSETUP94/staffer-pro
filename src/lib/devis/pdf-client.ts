/**
 * PDF client d'un devis Staffing (format Set Up Paris), construit uniquement depuis devis_lire_client :
 * aucune heure, taux, coût, prix d'achat, coefficient, marge, ligne interne ni note de Claude n'y figure.
 * Module pur (navigateur et serveur) : les images sont passées en octets.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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
  signataire?: { nom: string; email: string | null } | null;
  mentions_legales?: { forme?: string | null; capital?: string | null; telephone?: string | null; ape?: string | null; tva?: string | null; iban?: string | null; bic?: string | null } | null;
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
const montantDe = (l: LigneClient) => Number(l.sous_total ?? l.montant ?? 0);
/** Options non incluses sous une ligne : leur montant est exclu des sous-totaux affichés. */
export function optionsNonIncluses(vc: DevisClient, l: LigneClient): number {
  return enfants(vc, l.id).reduce((s, k) => s + (k.type === "option" ? (k.option_incluse ? 0 : montantDe(k)) : optionsNonIncluses(vc, k)), 0);
}
export const totalAffiche = (vc: DevisClient, l: LigneClient) => Math.round((montantDe(l) - optionsNonIncluses(vc, l)) * 100) / 100;
/** Titre court d'un chapitre (le libellé complet passe en descriptif). */
export function titreCourt(r: Pick<LigneClient, "type" | "libelle">) {
  const lib = (r.libelle ?? "").trim();
  if (r.type === "zone" || r.type === "objet") return lib || TYPE_RACINE[r.type];
  if (r.type === "chapitre_pose" && /^livraison/i.test(lib)) return "Livraison";
  if (r.type === "chapitre_depose" && /^reprise/i.test(lib)) return "Reprise";
  if (r.type === "option") return lib || "Option";
  return TYPE_RACINE[r.type] ?? (lib || "Chapitre");
}
export const descriptifChapitre = (r: Pick<LigneClient, "type" | "libelle">) => {
  const lib = (r.libelle ?? "").trim();
  return lib && lib.toLocaleLowerCase("fr") !== titreCourt(r).toLocaleLowerCase("fr") && lib !== TYPE_RACINE[r.type] ? lib : "";
};

export type LigneTableau = { n: string; designation: string; detail?: string; unite: string; qte: string; pu: string; total: string; style: "objet" | "commentaire" | "sous" | "option" | "forfait" };

/** Lignes du tableau sous une racine (zone ou chapitre), numérotées N.1, N.1.1… */
export function lignesTableau(vc: DevisClient, racine: LigneClient, niveau: NiveauPdf, prefixe = "") {
  const rows: LigneTableau[] = [];
  const walk = (p: string, pre: string) => {
    let k = 0;
    for (const l of enfants(vc, p)) {
      if (l.type === "commentaire") { if (l.texte?.trim()) rows.push({ n: "", designation: l.texte.trim(), unite: "", qte: "", pu: "", total: "", style: "commentaire" }); continue; }
      k += 1; const n = pre ? `${pre}.${k}` : String(k);
      const q = Number(l.quantite ?? 1) || 1;
      const total = l.type === "option" ? montantDe(l) : totalAffiche(vc, l);
      const chiffre = l.type === "objet" || l.type === "option";
      const detail = niveau === "detaille" ? (l.type === "objet" ? detailObjet(l) : (l.descriptif_client ?? "").trim()) : "";
      const opt = l.type === "option" && !l.option_incluse;
      rows.push({
        n, designation: l.type === "option" ? `${/^option/i.test(l.libelle ?? "") ? "" : "Option : "}${l.libelle ?? ""}${opt ? " (non comprise dans le total)" : " (incluse)"}` : l.libelle ?? "",
        detail, unite: l.type === "objet" ? "u" : chiffre ? "ens" : "", qte: chiffre ? String(l.type === "objet" ? q : 1) : "",
        pu: chiffre ? eurPdf(l.type === "objet" ? total / q : total) : "", total: eurPdf(total),
        style: l.type === "objet" ? "objet" : l.type === "option" ? "option" : "sous",
      });
      walk(l.id, n);
    }
  };
  walk(racine.id, prefixe);
  return rows;
}

/** Fiche client incomplète : champs exigés par ProGBat et par le bloc client du PDF. */
export function champsClientManquants(c: DevisClient["client"]) {
  if (!c) return ["client"];
  return ([["adresse", c.adresse], ["code postal", c.code_postal], ["ville", c.ville], ["SIRET", c.siret], ["TVA intracommunautaire", c.tva_intracom]] as const).filter(([, v]) => !String(v ?? "").trim()).map(([k]) => k);
}

export const MENTIONS_MODELE = [
  "Ce devis est établi sur les informations disponibles à ce jour et ne constitue pas une offre forfaitaire. Toute modification ou ajout supplémentaire entraînera un coût additionnel.",
  "• L'éclairage n'est pas inclus.",
  "• Le décor n'est pas classé résistant au feu.",
  "• Les options ne sont pas comprises dans le total.",
];
export const CONDITIONS_REGLEMENT = [
  "En cas de retard de paiement, des pénalités de retard sont exigibles au taux de trois fois le taux d'intérêt légal, ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce).",
];
const nf2 = (v: number) => eurPdf(v).replace(" €", "");

export function construireDevisPdf(vc: DevisClient, niveau: NiveauPdf, images: Record<string, ImagePdf> = {}): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 15, BAS = 272;
  const ink: [number, number, number] = [26, 26, 26], muted: [number, number, number] = [95, 95, 95], accent: [number, number, number] = [196, 62, 28];
  const bleu: [number, number, number] = [214, 228, 242], gris: [number, number, number] = [236, 236, 236];
  const s = vc.societe ?? {};
  const ref = refDevis(vc);
  const validite = vc.date_validite ?? vc.dates?.date_validite ?? null;

  // En-tête gauche : marque + émetteur
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...ink);
  doc.text("SET UP", M, 20); doc.setTextColor(...accent); doc.text("PARIS", M + doc.getTextWidth("SET UP "), 20);
  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...muted); doc.text("constructeur d'imaginaire", M, 24.5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...ink);
  const emetteur = [s.raison_sociale || "Smart Restructuring", s.marque || "SET UP", s.adresse, [s.code_postal, s.ville].filter(Boolean).join(" ")].filter(Boolean) as string[];
  doc.text(emetteur, M, 32);

  // En-tête droit : devis, chantier, travaux, validité, début, signataire
  const debut = vc.chantier?.debut ?? vc.dates?.date_montage ?? null;
  const droite = [
    `Devis n° ${ref} du ${datePdf(vc.date_devis) || "—"}`,
    ...(vc.libelle ? doc.setFontSize(9) && doc.splitTextToSize(`Chantier : ${vc.libelle}`, 88) : []),
    ...(vc.chantier?.adresse ? doc.splitTextToSize(vc.chantier.adresse, 88) : []),
    `Travaux : ${vc.chantier?.travaux || "Fabrication décor"}`,
    `Validité du devis : ${datePdf(validite) || (vc.validite_jours ? `${vc.validite_jours} jours` : "—")}`,
    ...(debut ? [`Début des travaux le : ${datePdf(debut)}${vc.chantier?.duree_jours ? `   ${vc.chantier.duree_jours} jours` : ""}`] : []),
    ...(vc.signataire ? [[vc.signataire.nom, vc.signataire.email].filter(Boolean).join(" - ")] : []),
    ...(vc.numero_progbat && /^D-\d{6}-\d{4}$/.test(vc.numero_progbat) ? [`Réf. ProGBat : ${vc.numero_progbat}`] : []),
  ] as string[];
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(droite[0], W - M, 18, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(droite.slice(1), W - M, 23, { align: "right" });

  // Bloc client grisé
  let y = Math.max(52, 23 + droite.length * 4);
  const c = vc.client;
  const cl = [c?.adresse, [c?.code_postal, c?.ville, c ? (c.pays || "France") : null].filter(Boolean).join(" "), c?.tva_intracom ? `T.V.A. : ${c.tva_intracom}` : "",
    vc.contact ? `À l'attention de ${vc.contact.nom}` : "", vc.client_final ? `Client final : ${vc.client_final}` : ""].filter(Boolean) as string[];
  const hc = 10 + cl.length * 4.2;
  doc.setDrawColor(200); doc.setFillColor(...gris); doc.rect(W / 2, y - 5, W / 2 - M, hc, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text(c?.nom ?? "Client à préciser", W / 2 + 4, y + 0.5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(cl, W / 2 + 4, y + 5.5);
  y += hc + 2;

  // Dates clés
  const dates = DATES.map(([k, lbl]) => [lbl, datePdf(vc.dates?.[k] ?? null)] as const).filter(([, v]) => v);
  if (dates.length) { doc.setFontSize(8.5); doc.setTextColor(...muted); doc.text(dates.map(([l, v]) => `${l} : ${v}`).join("     "), M, y); doc.setTextColor(...ink); y += 5; }

  // Encadré des mentions du modèle
  doc.setFontSize(8.2);
  const lm = doc.splitTextToSize(MENTIONS_MODELE.join("\n"), W - 2 * M - 6);
  doc.setDrawColor(150); doc.rect(M, y, W - 2 * M, lm.length * 3.6 + 4);
  doc.text(lm, M + 3, y + 4); y += lm.length * 3.6 + 8;

  // Tableau
  const racines = vc.lignes.filter((l) => !l.parent_id && l.type !== "commentaire").sort((a, b) => a.ordre - b.ordre);
  const comRacine = vc.lignes.filter((l) => !l.parent_id && l.type === "commentaire" && l.texte?.trim()).sort((a, b) => a.ordre - b.ordre);
  const corps: any[] = [];
  const it = { fontStyle: "italic", textColor: ink, cellPadding: { top: 0.5, bottom: 2, left: 4, right: 2 } };
  const ligne = (r: LigneTableau) => {
    if (r.style === "commentaire") { corps.push(["", { content: r.designation, colSpan: 5, styles: { fontStyle: "italic", textColor: muted } }]); return; }
    const fond = r.style === "objet" || r.style === "forfait" ? { fillColor: bleu } : {};
    const montrePrix = niveau === "detaille" || r.style !== "sous";
    corps.push([{ content: r.n, styles: fond }, { content: r.designation, styles: { ...fond, fontStyle: r.style === "option" ? "normal" : "bold" } }, { content: r.unite, styles: fond }, { content: r.qte, styles: fond },
      { content: montrePrix ? r.pu : "", styles: fond }, { content: montrePrix ? (r.style === "option" && /non comprise/.test(r.designation) ? `(${r.total})` : r.total) : "", styles: { ...fond, fontStyle: "bold" } }]);
    if (r.detail) corps.push(["", { content: r.detail, colSpan: 5, styles: it }]);
  };
  let N = 0;
  for (const r of racines) {
    N += 1; const n = String(N);
    const kids = enfants(vc, r.id).filter((k) => k.type !== "commentaire");
    const titre = titreCourt(r), long = descriptifChapitre(r);
    const total = r.type === "option" ? montantDe(r) : totalAffiche(vc, r);
    if (r.type !== "zone" && kids.length === 0) {
      // Chapitre ou option sans détail : une ligne titre chiffrée + le libellé complet en descriptif
      const opt = r.type === "option";
      ligne({ n, designation: opt ? `${titre} (${r.option_incluse ? "incluse" : "non comprise dans le total"})` : titre, detail: [long, (r.descriptif_client ?? "").trim()].filter(Boolean).join("\n"), unite: "ens", qte: "1", pu: eurPdf(total), total: eurPdf(total), style: opt ? "option" : "forfait" });
      continue;
    }
    corps.push([{ content: n, styles: { fontStyle: "bold", fillColor: gris } }, { content: titre.toUpperCase(), colSpan: 4, styles: { fontStyle: "bold", fillColor: gris } },
      { content: eurPdf(total), styles: { fontStyle: "bold", fillColor: gris } }]);
    if (long) corps.push(["", { content: long, colSpan: 5, styles: it }]);
    const forfait = r.type !== "zone" ? Number(r.montant ?? 0) : 0;
    let decal = 0;
    if (forfait) { decal = 1; ligne({ n: `${n}.1`, designation: `Forfait ${titre.toLocaleLowerCase("fr")}`, unite: "ens", qte: "1", pu: eurPdf(forfait), total: eurPdf(forfait), style: "forfait" }); }
    for (const row of lignesTableau(vc, r, niveau, n)) {
      if (decal && row.n) row.n = row.n.replace(new RegExp(`^${n}\\.(\\d+)`), (_m, k) => `${n}.${Number(k) + decal}`);
      ligne(row);
    }
  }
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, bottom: 300 - BAS },
    head: [["N°", "Désignation", "U", "Qté", "PUHT", "Total H.T."]],
    body: corps.length ? corps : [["", { content: "Aucune ligne chiffrée", colSpan: 5 }]],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.6, textColor: ink, lineColor: [200, 200, 200], lineWidth: 0.1, valign: "top" },
    headStyles: { fillColor: ink, textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 13 }, 1: { cellWidth: 97 }, 2: { cellWidth: 10, halign: "center" }, 3: { cellWidth: 12, halign: "right" }, 4: { cellWidth: 24, halign: "right" }, 5: { cellWidth: 24, halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 6;
  const place = (h: number) => { if (y + h > BAS) { doc.addPage(); y = 20; } };

  // Visuels (niveau détaillé)
  const photos = niveau === "detaille" ? vc.photos.filter((p) => images[p.thumb_path ?? p.storage_path]) : [];
  if (photos.length) {
    place(50); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Visuels", M, y); y += 3;
    let x = M; const cw = 42, ch = 32;
    for (const p of photos) {
      const img = images[p.thumb_path ?? p.storage_path];
      if (x + cw > W - M) { x = M; y += ch + 9; }
      place(ch + 9);
      try { const pr = doc.getImageProperties(img.bytes); const k = Math.min(cw / pr.width, ch / pr.height); doc.addImage(img.bytes, img.format, x, y, pr.width * k, pr.height * k); } catch { doc.rect(x, y, cw, ch); }
      const objet = vc.lignes.find((l) => l.id === p.ligne_id)?.libelle ?? "";
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...muted);
      doc.text(doc.splitTextToSize([objet, p.legende].filter(Boolean).join(" — "), cw), x, y + ch + 3); doc.setTextColor(...ink);
      x += cw + 4;
    }
    y += ch + 12;
  }

  // Totaux : encadré Devis (EUR) + tableau TVA
  const remise = Math.abs(Number(vc.remise ?? 0)), net = Number(vc.net_ht ?? vc.total_ht);
  place(62);
  const xT = W - M - 75;
  autoTable(doc, {
    startY: y, margin: { left: xT, right: M }, tableWidth: 75,
    head: [[{ content: "Devis (EUR)", colSpan: 2 }]],
    body: [["Total H.T", nf2(vc.total_ht)], ["Remise", nf2(-remise)], [{ content: "Total Net H.T", styles: { fontStyle: "bold" } }, { content: nf2(net), styles: { fontStyle: "bold" } }],
      ["TVA", nf2(vc.tva)], [{ content: "Total T.T.C", styles: { fontStyle: "bold" } }, { content: nf2(vc.ttc), styles: { fontStyle: "bold" } }]],
    styles: { fontSize: 9, cellPadding: 1.6, lineColor: [200, 200, 200], lineWidth: 0.1 }, headStyles: { fillColor: ink },
    columnStyles: { 1: { halign: "right" } },
  });
  autoTable(doc, {
    startY: y, margin: { left: M, right: W - xT + 6 },
    head: [["% TVA", "Base", "Total TVA"]], body: [[`${Number(vc.tva_pct).toFixed(2)} %`, nf2(net), nf2(vc.tva)]],
    styles: { fontSize: 9, cellPadding: 1.6, lineColor: [200, 200, 200], lineWidth: 0.1 }, headStyles: { fillColor: ink },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });
  y = Math.max(y + 40, (doc as any).lastAutoTable.finalY + 6);

  // Règlement
  const acompte = Math.round(Number(vc.ttc) * 50) / 100;
  const regl = [
    "Mode de règlement : Virement",
    ...CONDITIONS_REGLEMENT,
    `50.00% à la signature, soit ${nf2(acompte)} EUR TTC`,
    "Délai de règlement : 30 jours",
    ...comRacine.map((x) => x.texte!.trim()),
  ];
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  const lr = doc.splitTextToSize(regl.join("\n"), W - 2 * M);
  place(lr.length * 3.8 + 4); doc.text(lr, M, y); y += lr.length * 3.8 + 5;

  // Deux cadres de signature
  place(46);
  const bw = (W - 2 * M - 6) / 2;
  doc.setDrawColor(120); doc.rect(M, y, bw, 42); doc.rect(M + bw + 6, y, bw, 42);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Signature du Client", M + 3, y + 5); doc.text("Signature de l'Entreprise", M + bw + 9, y + 5);
  doc.setFont("helvetica", "italic"); doc.setFontSize(7.2);
  doc.text(doc.splitTextToSize("Les travaux ne pourront pas débuter sans devis signé ou bon de commande. Date, signature et cachet précédés de la mention « lu et approuvé ».", bw - 6), M + 3, y + 10);

  // Conditions générales de vente
  if (vc.cgv?.trim()) {
    doc.addPage(); y = 20;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Conditions générales de vente Set Up", M, y); y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    for (const l of doc.splitTextToSize(vc.cgv.trim(), W - 2 * M)) { if (y > BAS) { doc.addPage(); y = 20; } doc.text(l, M, y); y += 3.3; }
  }

  // Pied de page société + filigrane
  const ml = vc.mentions_legales ?? {};
  const pied = [[s.raison_sociale, ml.forme, ml.capital ? `au capital de ${ml.capital}` : null, ml.telephone ? `Tél. ${ml.telephone}` : null, s.email].filter(Boolean).join(" - "),
    [ml.ape ? `APE ${ml.ape}` : null, s.siret ? `SIRET ${s.siret}` : null, ml.tva ? `TVA intracom. ${ml.tva}` : null, ml.iban ? `IBAN ${ml.iban}` : null, ml.bic ? `BIC ${ml.bic}` : null].filter(Boolean).join(" - ")].filter(Boolean);
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(...muted);
    doc.setDrawColor(200); doc.line(M, 277, W - M, 277);
    doc.text(pied, W / 2, 281, { align: "center" });
    doc.setFontSize(7.5); doc.text(ref, M, 290); doc.text(`${i} / ${n}`, W - M, 290, { align: "right" });
    if (avecFiligrane(vc.statut_redaction)) {
      doc.saveGraphicsState();
      doc.setGState(new (doc as any).GState({ opacity: 0.13 }));
      doc.setFont("helvetica", "bold"); doc.setFontSize(110); doc.setTextColor(...accent);
      doc.text("PROJET", W / 2, 175, { align: "center", angle: 35 });
      doc.restoreGraphicsState();
    }
  }
  return doc.output("arraybuffer");
}
