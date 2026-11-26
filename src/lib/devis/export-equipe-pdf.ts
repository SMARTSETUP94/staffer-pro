/**
 * PDF « Version équipe » d'un devis : synthèse, heures par objet, détail des heures, matériaux.
 * Construit à partir des feuilles déjà calculées par export-equipe.ts : aucune donnée de coût
 * (taux, prix d'achat, coefficient, marge) n'y figure, par construction.
 * jsPDF et autoTable sont importés à la demande.
 */
import type { Cellule, ResultatEquipe } from "./export-equipe";
import { refEquipe } from "./export-equipe";

/** Nombre en français, avec une espace simple : l'espace fine insécable de toLocaleString n'existe pas dans la police du PDF. */
const fr = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ");
const texte = (c: Cellule): string => (c == null ? "" : typeof c === "number" ? fr(c) : c);

/** Tableau autoTable à partir de cellules : colonnes numériques alignées à droite. */
function colonnesNumeriques(cellules: Cellule[][]) {
  const cs: Record<number, { halign: "right" }> = {};
  for (let c = 0; c < (cellules[0]?.length ?? 0); c++) {
    const numerique = cellules.slice(1).some((l) => typeof l[c] === "number");
    if (numerique) cs[c] = { halign: "right" };
  }
  return cs;
}

export async function construirePdfEquipe(res: ResultatEquipe): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const W = 297, M = 12, BAS = 196;
  const BLEU: [number, number, number] = [21, 56, 169];
  const GRIS: [number, number, number] = [92, 96, 104];
  const FILET: [number, number, number] = [221, 225, 230];
  const FOND: [number, number, number] = [244, 246, 248];
  const ENCRE: [number, number, number] = [29, 29, 27];
  const styles = { font: "helvetica", fontSize: 8.4, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, textColor: ENCRE, lineColor: FILET, lineWidth: { bottom: 0.15 }, valign: "top" as const };

  let y = 16;
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...BLEU);
  doc.text("Version équipe", M, y); y += 6;
  doc.setFontSize(10); doc.setTextColor(...ENCRE);
  doc.text(`Devis ${refEquipe(res.fiche)}${res.fiche.client ? ` · ${res.fiche.client}` : ""}`, M, y); y += 4.5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.6); doc.setTextColor(...GRIS);
  doc.text(`${res.fiche.affaire ?? "Sans affaire"} · Document interne : heures et matériaux, sans taux, coût ni marge`, M, y); y += 6;

  // Synthèse : heures par métier + totaux, en deux colonnes.
  const metiers = res.fiche.heures_par_metier;
  autoTable(doc, {
    startY: y, margin: { left: M, right: W / 2 + 4 },
    head: [["Heures par métier", "Heures"]],
    body: [...metiers.map((m) => [m.metier, fr(m.heures)]), [{ content: "Total heures", styles: { fontStyle: "bold" } }, { content: fr(res.fiche.total_heures), styles: { fontStyle: "bold", halign: "right" } }]],
    styles: { ...styles, fontSize: 8.6 }, headStyles: { fillColor: BLEU, textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });
  const finGauche = (doc as any).lastAutoTable.finalY as number;
  const droite: Cellule[][] = [["Élément", "Valeur"],
    ["Lignes du devis", res.fiche.nb_lignes], ["Objets", res.fiche.nb_objets],
    ["Saisies d'heures", res.fiche.nb_heures], ["Matériaux", res.fiche.nb_materiaux],
    ["Total HT", res.fiche.total_ht], ["Net HT", res.fiche.net_ht]];
  autoTable(doc, {
    startY: y, margin: { left: W / 2 + 4, right: M },
    head: [droite[0] as string[]], body: droite.slice(1).map((l) => [texte(l[0]), texte(l[1])]),
    styles: { ...styles, fontSize: 8.6 }, headStyles: { fillColor: FOND, textColor: GRIS, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });
  y = Math.max(finGauche, (doc as any).lastAutoTable.finalY as number) + 6;
  if (res.fiche.options_hors_total.length) {
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [[{ content: "Options non incluses (heures hors total)", colSpan: 2 }]],
      body: res.fiche.options_hors_total.map((o) => [o.libelle, fr(o.heures)]),
      styles: { ...styles, fontSize: 8.4 }, headStyles: { fillColor: FOND, textColor: GRIS, fontStyle: "bold" },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  const titre = (t: string) => {
    if (y + 14 > BAS) { doc.addPage(); y = 16; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...BLEU);
    doc.text(t, M, y); y += 4;
  };

  const table = (cellules: Cellule[][], largeurs?: Record<number, number>) => {
    const head = (cellules[0] ?? []).map((c) => texte(c));
    const body = cellules.slice(1).map((l) => l.map((c) => texte(c)));
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, bottom: 210 - BAS },
      head: [head], body: body.length ? body : [["Aucune ligne"]],
      rowPageBreak: "avoid", styles, headStyles: { fillColor: BLEU, textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: { ...colonnesNumeriques(cellules), ...(largeurs ? Object.fromEntries(Object.entries(largeurs).map(([c, w]) => [c, { cellWidth: w }])) : {}) },
      didDrawPage: () => {
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
        doc.text(`Version équipe — ${res.fiche.numero} · page ${doc.getNumberOfPages()}`, M, 204);
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  };

  titre("Heures par objet");
  table(res.objets);
  titre("Détail des heures");
  table(res.detail);
  titre("Matériaux (sans prix)");
  table(res.materiaux);

  return doc.output("arraybuffer");
}
