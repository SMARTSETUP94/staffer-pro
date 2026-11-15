/**
 * Export PDF du planning des équipes (logistique).
 *
 * Les deux vues affichées à l'écran sont capturées puis assemblées en A4 :
 * « jour par jour » en portrait, une page par jour ; « par employé » en paysage.
 * Le fichier est fabriqué par l'application, donc sans lien, sans titre d'onglet
 * et sans date ajoutés par la fenêtre d'impression du navigateur.
 *
 * La pagination respecte les blocs (jour, intervention, ligne d'employé) : une
 * intervention ou une ligne n'est jamais coupée entre deux pages, et le bandeau
 * de tête (jour ou jours de la semaine) est recopié en haut de chaque page.
 *
 * jspdf et html-to-image ne sont importés qu'ici, et ce module n'est chargé qu'au
 * clic sur « Enregistrer en PDF » : ils restent hors du chunk initial de la page.
 */
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { paginer, paginerHauteurFixe, type Bloc, type Page } from "./planning-equipes-pagination";

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
const PIXEL_RATIO = 1.5;
const QUALITE = 0.92;

/** k : pixels CSS → pixels image ; echelle : pixels image → millimètres. */
type Capture = { img: HTMLImageElement; k: number; echelle: number; x: number; largeurMm: number; entete: Bloc; pages: Page[] };

/** Capture un élément en PNG, chargé et prêt à être découpé. */
async function versImage(el: HTMLElement): Promise<HTMLImageElement> {
  const url = await toPng(el, { pixelRatio: PIXEL_RATIO, backgroundColor: "#ffffff", cacheBust: true });
  const img = new Image();
  img.src = url;
  await new Promise<void>((ok, ko) => {
    img.onload = () => ok();
    img.onerror = () => ko(new Error("capture illisible"));
  });
  return img;
}

/**
 * Copie hors écran d'un élément, remise à une largeur de bureau.
 * Sur un téléphone la vue « jour par jour » est plus large que l'écran : sans
 * cette copie, le PDF perdrait les colonnes de droite.
 */
function horsEcran(el: HTMLElement, largeur: number) {
  const conteneur = document.createElement("div");
  conteneur.style.cssText = `position:fixed;left:-100000px;top:0;width:${largeur}px;background:#ffffff`;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.width = `${largeur}px`;
  conteneur.appendChild(clone);
  document.body.appendChild(conteneur);
  return { clone, fermer: () => conteneur.remove() };
}

/**
 * Blocs de l'élément, en pixels CSS, le premier servant de tête répétable :
 * titre du jour (vue jour par jour) ou ligne des jours (vue par employé).
 */
function blocsDe(el: HTMLElement, vue: VuePlanning): Bloc[] {
  const r = el.getBoundingClientRect();
  const noeuds: Element[] =
    vue === "employes"
      ? [el.querySelector("thead"), ...Array.from(el.querySelectorAll("tbody > tr"))].filter(Boolean) as Element[]
      : Array.from(el.children);
  return noeuds
    .map(n => { const b = n.getBoundingClientRect(); return { top: b.top - r.top, height: b.height }; })
    .filter(b => b.height > 0);
}

/** Découpe l'image entre deux positions CSS ; renvoie la hauteur en pixels image. */
function tranche(img: HTMLImageElement, k: number, from: number, to: number) {
  const sy = Math.max(0, Math.round(from * k));
  const ey = Math.min(img.naturalHeight, Math.round(to * k));
  const sh = Math.max(1, ey - sy);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponible");
  ctx.drawImage(img, 0, sy, img.naturalWidth, sh, 0, 0, img.naturalWidth, sh);
  return { data: canvas.toDataURL("image/jpeg", QUALITE), px: sh };
}

async function capturer(el: HTMLElement, vue: VuePlanning, dispoW: number, dispoH: number): Promise<Capture> {
  const largeur = el.getBoundingClientRect().width || el.offsetWidth;
  const cible = vue === "jours" ? Math.max(largeur, 1000) : largeur;
  const copie = cible > largeur + 1 ? horsEcran(el, cible) : null;
  const source = copie ? copie.clone : el;
  try {
    const img = await versImage(source);
    const k = img.naturalWidth / cible;
    // Réduction pour tenir dans la page, jamais au-delà de la taille naturelle (96 dpi) :
    // sur un écran étroit, le planning reste à taille lisible au lieu d'être étiré.
    const mmParPx = Math.min(dispoW / cible, 0.2646);
    const echelle = mmParPx / k; // px image → mm
    const largeurMm = cible * mmParPx;
    const x = MARGE + (dispoW - largeurMm) / 2;
    // Hauteur de page exprimée en pixels CSS.
    const hauteurPx = dispoH / mmParPx;
    const blocs = blocsDe(source, vue);
    if (!blocs.length) return { img, k, echelle, x, largeurMm, entete: { top: 0, height: 0 }, pages: paginerHauteurFixe(img.naturalHeight / k, hauteurPx) };
    const { entete, pages } = paginer(blocs, hauteurPx);
    return { img, k, echelle, x, largeurMm, entete, pages };
  } finally {
    copie?.fermer();
  }
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

  const captures: Capture[] = [];
  for (const el of cibles) captures.push(await capturer(el, p.vue, dispoW, dispoH));
  const total = captures.reduce((n, c) => n + c.pages.length, 0);
  const legende = p.legende ? await versImage(p.legende) : null;

  let numero = 0;
  for (const c of captures) {
    for (const page of c.pages) {
      if (numero > 0) pdf.addPage();
      numero++;

      // Tête de page : titre de la semaine, vue, légende des couleurs.
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

      const haut = MARGE + TETE;
      let y = haut;
      if (c.entete.height > 0) {
        const tete = tranche(c.img, c.k, 0, c.entete.height);
        const h = Math.min(tete.px * c.echelle, dispoH * 0.4);
        pdf.addImage(tete.data, "JPEG", c.x, y, c.largeurMm, h);
        y += h;
      }
      const corps = tranche(c.img, c.k, page.start, page.end);
      if (page.end - page.start > 0.5) pdf.addImage(corps.data, "JPEG", c.x, y, c.largeurMm, Math.min(corps.px * c.echelle, haut + dispoH - y));

      pdf.setFontSize(8);
      pdf.setTextColor(140);
      pdf.text(`Page ${numero} / ${total}`, pageW / 2, pageH - 5, { align: "center" });
      pdf.setTextColor(0);
    }
  }

  pdf.save(p.nomFichier);
  return { pages: total };
}
