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
  client: { nom: string; adresse: string | null; code_postal: string | null; ville: string | null; siret?: string | null; tva_intracom?: string | null } | null;
  client_final: string | null; contact: { nom: string; email: string | null } | null;
  dates: Record<string, string | null> | null; lignes: LigneClient[];
  photos: { ligne_id: string; storage_path: string; thumb_path: string | null; legende: string | null; mime: string | null }[];
  total_ht: number; remise?: number; net_ht?: number; tva: number; tva_pct: number; ttc: number; options_ht?: number;
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

const dims = (l: LigneClient) => {
  const d = [l.longueur_mm, l.largeur_mm, l.hauteur_mm].filter((x) => x != null && Number(x) > 0).map((x) => String(Number(x)));
  return [d.length ? `${d.join(" × ")} mm` : "", l.finition ?? ""].filter(Boolean).join(" · ");
};

/** Lignes du tableau pour une racine (zone ou chapitre), récursivement. */
export function lignesTableau(vc: DevisClient, racine: LigneClient, niveau: NiveauPdf) {
  const kids = (p: string) => vc.lignes.filter((l) => l.parent_id === p).sort((a, b) => a.ordre - b.ordre);
  const rows: { designation: string; detail?: string; qte: string; pu: string; total: string; style: "objet" | "commentaire" | "sous" }[] = [];
  const walk = (p: string, depth: number) => {
    for (const l of kids(p)) {
      const indent = "   ".repeat(depth);
      if (l.type === "commentaire") { if (l.texte?.trim()) rows.push({ designation: indent + l.texte.trim(), qte: "", pu: "", total: "", style: "commentaire" }); continue; }
      const q = Number(l.quantite ?? 1) || 1;
      const detail = niveau === "detaille" ? [dims(l), (l.descriptif_client ?? "").trim()].filter(Boolean).join("\n") : "";
      const m = l.montant == null ? null : Number(l.montant);
      rows.push({
        designation: indent + (l.libelle ?? ""), detail, qte: l.type === "objet" ? String(q) : "",
        pu: niveau === "detaille" && m != null && l.type === "objet" ? eurPdf(m / q) : "",
        total: niveau === "detaille" && m != null ? eurPdf(m) : "", style: l.type === "objet" ? "objet" : "sous",
      });
      walk(l.id, depth + 1);
    }
  };
  walk(racine.id, 0);
  return rows;
}

export function construireDevisPdf(vc: DevisClient, niveau: NiveauPdf, images: Record<string, ImagePdf> = {}): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 15;
  const ink: [number, number, number] = [26, 26, 26], muted: [number, number, number] = [95, 95, 95], accent: [number, number, number] = [196, 62, 28];
  const s = vc.societe ?? {};

  // En-tête : marque Set Up Paris + coordonnées
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...ink);
  doc.text("SET UP", M, 22); doc.setTextColor(...accent); doc.text("PARIS", M + doc.getTextWidth("SET UP "), 22);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...muted);
  const soc = [s.raison_sociale || s.marque || "Set Up Paris", s.adresse, [s.code_postal, s.ville].filter(Boolean).join(" "), s.siret ? `SIRET ${s.siret}` : "", s.email].filter(Boolean) as string[];
  doc.text(soc, M, 28);

  doc.setTextColor(...ink); doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(`DEVIS ${refDevis(vc)}`, W - M, 22, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  const validite = vc.date_validite ?? vc.dates?.date_validite ?? null;
  doc.text([`Date du devis : ${datePdf(vc.date_devis) || "—"}`, `Valable jusqu'au : ${datePdf(validite) || (vc.validite_jours ? `${vc.validite_jours} jours` : "—")}`, ...(vc.numero_progbat && /^D-\d{6}-\d{4}$/.test(vc.numero_progbat) ? [`Réf. ProGBat : ${vc.numero_progbat}`] : [])], W - M, 28, { align: "right" });

  // Client
  let y = 50;
  const cl = [vc.client?.adresse, [vc.client?.code_postal, vc.client?.ville].filter(Boolean).join(" "),
    vc.contact ? `À l'attention de ${vc.contact.nom}` : "", vc.client_final ? `Client final : ${vc.client_final}` : ""].filter(Boolean) as string[];
  doc.setDrawColor(200); doc.setFillColor(246, 244, 240); doc.roundedRect(W / 2, y - 5, W / 2 - M, 12 + cl.length * 4.2, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text(vc.client?.nom ?? "Client à préciser", W / 2 + 4, y + 1);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(cl, W / 2 + 4, y + 6);
  if (vc.libelle) { doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(doc.splitTextToSize(vc.libelle, W / 2 - M - 6), M, y + 1); }

  // Dates clés renseignées
  y = 50 + 12 + Math.max(cl.length * 4.2, 8) + 4;
  const dates = DATES.map(([k, lbl]) => [lbl, datePdf(vc.dates?.[k] ?? null)] as const).filter(([, v]) => v);
  if (dates.length) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...muted);
    doc.text(dates.map(([l, v]) => `${l} : ${v}`).join("     "), M, y); y += 6; doc.setTextColor(...ink);
  }

  const racines = vc.lignes.filter((l) => !l.parent_id && l.type !== "commentaire").sort((a, b) => a.ordre - b.ordre);
  const comRacine = vc.lignes.filter((l) => !l.parent_id && l.type === "commentaire" && l.texte?.trim()).sort((a, b) => a.ordre - b.ordre);
  const corps: any[] = [];
  const options = racines.filter((r) => r.type === "option");
  for (const r of racines.filter((x) => x.type !== "option")) {
    const titre = `${TYPE_RACINE[r.type] ?? ""}${r.libelle && r.libelle !== TYPE_RACINE[r.type] ? ` — ${r.libelle}` : ""}`;
    corps.push([{ content: titre.toUpperCase(), colSpan: 3, styles: { fontStyle: "bold", fillColor: [236, 232, 225] } },
      { content: eurPdf(r.sous_total ?? r.montant ?? 0), styles: { fontStyle: "bold", halign: "right", fillColor: [236, 232, 225] } }]);
    for (const row of lignesTableau(vc, r, niveau)) {
      corps.push(row.style === "commentaire"
        ? [{ content: row.designation, colSpan: 4, styles: { fontStyle: "italic", textColor: muted } }]
        : [{ content: row.designation, styles: row.style === "objet" ? { fontStyle: "bold" } : {} }, row.qte, row.pu, { content: row.total, styles: { fontStyle: "bold" } }]);
      if (row.detail) corps.push([{ content: row.detail, colSpan: 4, styles: { textColor: ink, cellPadding: { top: 0, bottom: 2, left: 4, right: 2 } } }]);
    }
  }
  autoTable(doc, {
    startY: y + 2, margin: { left: M, right: M },
    head: [["Désignation", "Qté", niveau === "detaille" ? "Prix unitaire HT" : "", "Total HT"]],
    body: corps.length ? corps : [[{ content: "Aucune ligne chiffrée", colSpan: 4 }]],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.8, textColor: ink, lineColor: [215, 210, 200], lineWidth: 0.1, valign: "top" },
    headStyles: { fillColor: ink, textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 112 }, 1: { cellWidth: 14, halign: "right" }, 2: { cellWidth: 27, halign: "right" }, 3: { cellWidth: 27, halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  const place = (h: number) => { if (y + h > 280) { doc.addPage(); y = 20; } };
  if (options.length) {
    place(14);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Options", M, y); y += 2;
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      body: options.map((o) => [o.libelle ?? "Option", o.option_incluse ? "Incluse dans le total" : "Non incluse", eurPdf(o.sous_total ?? o.montant ?? 0)]),
      styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [215, 210, 200], lineWidth: 0.1 },
      columnStyles: { 0: { cellWidth: 112 }, 1: { cellWidth: 41 }, 2: { cellWidth: 27, halign: "right", fontStyle: "bold" } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Totaux
  const remise = Number(vc.remise ?? 0);
  const tot: [string, string, boolean][] = [["Total HT", eurPdf(vc.total_ht), true]];
  if (remise !== 0) tot.push(["Remise", eurPdf(-Math.abs(remise)), false], ["Total net HT", eurPdf(vc.net_ht ?? vc.total_ht), true]);
  tot.push([`TVA ${Number(vc.tva_pct)} %`, eurPdf(vc.tva), false], ["Total TTC", eurPdf(vc.ttc), true]);
  place(tot.length * 6 + 4);
  doc.setFontSize(10);
  for (const [l, v, b] of tot) {
    doc.setFont("helvetica", b ? "bold" : "normal"); doc.text(l, W - M - 62, y); doc.text(v, W - M, y, { align: "right" });
    doc.setDrawColor(215); doc.line(W - M - 62, y + 1.8, W - M, y + 1.8); y += 6;
  }
  y += 2;

  // Visuels (niveau détaillé)
  const photos = niveau === "detaille" ? vc.photos.filter((p) => images[p.thumb_path ?? p.storage_path]) : [];
  if (photos.length) {
    place(50); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Visuels", M, y); y += 3;
    let x = M; const cw = 42, ch = 32;
    for (const p of photos) {
      const img = images[p.thumb_path ?? p.storage_path];
      if (x + cw > W - M) { x = M; y += ch + 9; }
      place(ch + 9);
      try {
        const pr = doc.getImageProperties(img.bytes);
        const k = Math.min(cw / pr.width, ch / pr.height);
        doc.addImage(img.bytes, img.format, x, y, pr.width * k, pr.height * k);
      } catch { doc.rect(x, y, cw, ch); }
      const objet = vc.lignes.find((l) => l.id === p.ligne_id)?.libelle ?? "";
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...muted);
      doc.text(doc.splitTextToSize([objet, p.legende].filter(Boolean).join(" — "), cw), x, y + ch + 3); doc.setTextColor(...ink);
      x += cw + 4;
    }
    y += ch + 12;
  }

  // Mentions et commentaires généraux
  const mentions = comRacine.map((c) => c.texte!.trim());
  if (!mentions.some((m) => /acompte/i.test(m))) mentions.push("Acompte de 50 % à la signature.");
  mentions.push(`Devis valable ${vc.validite_jours ?? 30} jours${validite ? `, jusqu'au ${datePdf(validite)}` : ""}.`);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  const lm = doc.splitTextToSize(mentions.join("\n"), W - 2 * M);
  place(lm.length * 4 + 4); doc.text(lm, M, y); y += lm.length * 4 + 4;

  // Bon pour accord
  place(42);
  doc.setDrawColor(150); doc.rect(W / 2, y, W / 2 - M, 38);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.text("Bon pour accord", W / 2 + 3, y + 6);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.text(["Date :", "", "Signature :", "", "Cachet de l'entreprise :"], W / 2 + 3, y + 12);

  // Pied de page + filigrane
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...muted);
    doc.text(`Devis ${refDevis(vc)} — page ${i}/${n}`, W - M, 290, { align: "right" });
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
