import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { format, addDays } from "date-fns";
import { fr } from "date-fns/locale";

interface ExportOptions {
  weekStart: Date;
  tabLabel: string; // ex: "CDI / CDD"
}

/**
 * Capture l'élément DOM passé en argument et génère un PDF A4 paysage
 * contenant un en-tête (titre + semaine) puis l'image de la grille.
 * Le PDF est téléchargé directement par le navigateur.
 */
export async function exportPlanningToPDF(element: HTMLElement, opts: ExportOptions) {
  const { weekStart, tabLabel } = opts;
  const weekEnd = addDays(weekStart, 6);

  // 1) Capture en PNG haute résolution
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    cacheBust: true,
    // Filtrer les éléments interactifs (barre de sélection multi, hint kbd)
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

  // En-tête
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("Planning hebdomadaire", margin, margin + 5);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const semaine = `Semaine ${format(weekStart, "II")} — ${format(weekStart, "d MMM", { locale: fr })} → ${format(weekEnd, "d MMM yyyy", { locale: fr })}`;
  pdf.text(semaine, margin, margin + 11);

  pdf.setTextColor(120);
  pdf.text(`Vue : ${tabLabel}`, pageW - margin, margin + 5, { align: "right" });
  pdf.text(`Édité le ${format(new Date(), "d MMM yyyy 'à' HH:mm", { locale: fr })}`, pageW - margin, margin + 11, { align: "right" });
  pdf.setTextColor(0);

  // 3) Insérer l'image de la grille
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(e);
  });

  const availableW = pageW - margin * 2;
  const availableH = pageH - margin - 18; // 18mm pour l'en-tête
  const ratio = img.width / img.height;
  let drawW = availableW;
  let drawH = drawW / ratio;
  if (drawH > availableH) {
    drawH = availableH;
    drawW = drawH * ratio;
  }
  const x = (pageW - drawW) / 2;
  const y = margin + 16;
  pdf.addImage(dataUrl, "PNG", x, y, drawW, drawH);

  // 4) Téléchargement
  const filename = `planning-S${format(weekStart, "II")}-${format(weekStart, "yyyy-MM-dd")}.pdf`;
  pdf.save(filename);
}
