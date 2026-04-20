import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { format, addDays } from "date-fns";
import { fr } from "date-fns/locale";

interface ExportOptions {
  weekStart: Date;
  tabLabel: string; // ex: "CDI / CDD"
}

/**
 * Capture l'élément DOM passé en argument et génère un PDF A4 paysage.
 * - En-tête (titre + semaine + vue + date d'édition) répété sur chaque page.
 * - Pagination automatique : si la grille dépasse la hauteur dispo, l'image
 *   PNG est découpée verticalement en autant de pages que nécessaire.
 * - Pied de page « Page X/Y ».
 *
 * Note UTF-8 : la grille étant rendue en PNG, tous les caractères Unicode
 * (accents, flèches, …) sont préservés via le rendu navigateur, indépendamment
 * des fontes embarquées par jsPDF.
 */
export async function exportPlanningToPDF(element: HTMLElement, opts: ExportOptions) {
  const { weekStart, tabLabel } = opts;
  const weekEnd = addDays(weekStart, 6);

  // 1) Capture en PNG haute résolution
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    cacheBust: true,
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return true;
      if (node.dataset?.exportIgnore === "true") return false;
      return true;
    },
  });

  // 2) PDF A4 paysage : 297 × 210 mm
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const headerH = 16; // hauteur du bandeau d'en-tête
  const footerH = 8;  // hauteur du pied de page
  const contentTop = margin + headerH;
  const contentBottom = pageH - margin - footerH;
  const availableW = pageW - margin * 2;
  const availableH = contentBottom - contentTop;

  // 3) Charger l'image pour connaître ses dimensions naturelles
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(e);
  });

  // Échelle pour caler sur la largeur dispo
  const scale = availableW / img.width;          // px → mm
  const fullDrawH = img.height * scale;          // hauteur totale en mm
  const sliceHpx = Math.floor(availableH / scale); // hauteur de chaque tranche en px
  const totalPages = Math.max(1, Math.ceil(img.height / sliceHpx));

  // 4) Préparer un canvas pour découper les tranches en PNG
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context indisponible");

  const drawHeader = (pageNum: number) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("Planning hebdomadaire", margin, margin + 5);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    const semaine = `Semaine ${format(weekStart, "II")} — ${format(weekStart, "d MMM", { locale: fr })} → ${format(weekEnd, "d MMM yyyy", { locale: fr })}`;
    pdf.text(semaine, margin, margin + 11);

    pdf.setTextColor(120);
    pdf.text(`Vue : ${tabLabel}`, pageW - margin, margin + 5, { align: "right" });
    pdf.text(
      `Édité le ${format(new Date(), "d MMM yyyy 'à' HH:mm", { locale: fr })}`,
      pageW - margin, margin + 11, { align: "right" },
    );
    pdf.setTextColor(0);

    // Filet sous l'en-tête
    pdf.setDrawColor(220);
    pdf.line(margin, margin + headerH - 2, pageW - margin, margin + headerH - 2);

    // Pied de page
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(
      `Page ${pageNum} / ${totalPages}`,
      pageW / 2, pageH - margin, { align: "center" },
    );
    pdf.setTextColor(0);
  };

  for (let i = 0; i < totalPages; i++) {
    if (i > 0) pdf.addPage();
    drawHeader(i + 1);

    // Découpe la tranche i de l'image
    const sy = i * sliceHpx;
    const sh = Math.min(sliceHpx, img.height - sy);
    canvas.width = img.width;
    canvas.height = sh;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, sy, img.width, sh, 0, 0, img.width, sh);
    const sliceData = canvas.toDataURL("image/png");

    const drawW = availableW;
    const drawH = sh * scale;
    const x = margin;
    const y = contentTop;
    pdf.addImage(sliceData, "PNG", x, y, drawW, drawH);
  }

  // 5) Téléchargement
  const filename = `planning-S${format(weekStart, "II")}-${format(weekStart, "yyyy-MM-dd")}.pdf`;
  pdf.save(filename);

  return { totalPages, fullDrawH };
}
