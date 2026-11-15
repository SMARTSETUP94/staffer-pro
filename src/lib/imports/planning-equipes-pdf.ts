/**
 * Export PDF du planning des équipes (logistique).
 *
 * Les deux vues affichées à l'écran sont capturées puis assemblées en A4 :
 * « jour par jour » en portrait, une page par jour ; « par employé » en paysage.
 * Le fichier est fabriqué par l'application, donc sans lien, sans titre d'onglet
 * et sans date ajoutés par la fenêtre d'impression du navigateur.
 *
 * jspdf et html-to-image ne sont importés qu'ici, et ce module n'est chargé qu'au
 * clic sur « Enregistrer en PDF » : ils restent hors du chunk initial de la page.
 */
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

export type VuePlanning = "jours" | "employes";

export type ExportPlanningEquipes = {
  vue: VuePlanning;
  /** « Planning du 16 novembre au 22 novembre 2026 » */
  titre: string;
  /** Conteneur de la vue active : liste des jours, ou tableau par employé. */
  contenu: HTMLElement;
  /** Bandeau de légende des couleurs, recopié en tête de chaque page. */
  legende?: HTMLElement | null;
  nomFichier: string;
};

const MARGE = 10;
const TETE = 16;
const PIED = 8;

type Tranche = { img: HTMLImageElement; pages: number };

/** Capture un élément en PNG haute résolution, chargé et prêt à être découpé. */
async function versImage(el: HTMLElement): Promise<HTMLImageElement> {
  const url = await toPng(el, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
  const img = new Image();
  img.src = url;
  await new Promise<void>((ok, ko) => {
    img.onload = () => ok();
    img.onerror = () => ko(new Error("capture illisible"));
  });
  return img;
}

/** Découpe une image en tranches tenant dans la hauteur d'une page. */
function decouper(img: HTMLImageElement, echelle: number, parPagePx: number, i: number) {
  const sy = i * parPagePx;
  const sh = Math.min(parPagePx, img.naturalHeight - sy);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponible");
  ctx.drawImage(img, 0, sy, img.naturalWidth, sh, 0, 0, img.naturalWidth, sh);
  return { data: canvas.toDataURL("image/png"), hauteur: sh * echelle };
}

export async function exporterPlanningEquipesPdf(p: ExportPlanningEquipes): Promise<{ pages: number }> {
  const pdf = new jsPDF({ orientation: p.vue === "employes" ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const dispoW = pageW - MARGE * 2;
  const dispoH = pageH - MARGE * 2 - TETE - PIED;
  if (dispoH <= 0) throw new Error("hauteur de page insuffisante");

  // Une page par jour en vue « jour par jour », un seul bloc en vue « par employé ».
  const sections = p.vue === "jours" ? Array.from(p.contenu.querySelectorAll<HTMLElement>(":scope > section")) : [];
  const cibles = sections.length ? sections : [p.contenu];

  const tranches: Tranche[] = [];
  for (const el of cibles) {
    const img = await versImage(el);
    const echelle = dispoW / img.naturalWidth;
    tranches.push({ img, pages: Math.max(1, Math.ceil((img.naturalHeight * echelle) / dispoH)) });
  }
  const total = tranches.reduce((n, t) => n + t.pages, 0);
  const legende = p.legende ? await versImage(p.legende) : null;

  let numero = 0;
  for (const t of tranches) {
    const echelle = dispoW / t.img.naturalWidth;
    const parPagePx = dispoH / echelle;
    for (let i = 0; i < t.pages; i++) {
      if (numero > 0) pdf.addPage();
      numero++;

      // Tête : titre de la semaine, vue, légende des couleurs.
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(20);
      pdf.text(p.titre, MARGE, MARGE + 5);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(110);
      pdf.text(p.vue === "employes" ? "Vue par employé" : "Vue jour par jour", pageW - MARGE, MARGE + 5, { align: "right" });
      if (legende) {
        const s = Math.min((dispoW * 0.92) / legende.naturalWidth, 7 / legende.naturalHeight);
        pdf.addImage(legende.src, "PNG", MARGE, MARGE + 7, legende.naturalWidth * s, legende.naturalHeight * s);
      }
      pdf.setDrawColor(215);
      pdf.setLineWidth(0.2);
      pdf.line(MARGE, MARGE + TETE - 2, pageW - MARGE, MARGE + TETE - 2);

      const slice = decouper(t.img, echelle, parPagePx, i);
      pdf.addImage(slice.data, "PNG", MARGE, MARGE + TETE, dispoW, slice.hauteur);

      pdf.setFontSize(8);
      pdf.setTextColor(140);
      pdf.text(`Page ${numero} / ${total}`, pageW / 2, pageH - 5, { align: "center" });
      pdf.setTextColor(0);
    }
  }

  pdf.save(p.nomFichier);
  return { pages: total };
}
