/**
 * Export PDF du planning des équipes (logistique), en vrai texte.
 *
 * Le PDF est construit à partir des données (jspdf + jspdf-autotable), et non
 * plus d'une capture d'écran : le texte est sélectionnable et cherchable.
 * « Jour par jour » en portrait, une page par jour ; « par employé » en paysage.
 * Une intervention n'est jamais coupée entre deux pages et l'en-tête des
 * tableaux est répété. Module chargé uniquement au clic.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { BlocExport } from "./planning-equipes";
import { commentaires, ENTETE_BLOC, horaire } from "./planning-equipes";

export type VuePlanning = "jours" | "employes";
type RGB = [number, number, number];

/** Couleurs des types d'étape (équivalents sRGB des teintes de l'écran). */
export const COULEURS_ETAPE: Record<string, RGB> = {
  appro: [154, 110, 200], emballage: [206, 128, 64], chargement: [214, 88, 70],
  livraison: [44, 120, 200], tracage: [128, 84, 172], rotation: [204, 72, 162],
  montage: [52, 148, 88], finitions: [36, 152, 160], permanence: [190, 160, 30],
  demontage: [200, 50, 70], dechargement: [92, 104, 130],
};
const PRIMAIRE: RGB = [52, 36, 150];
const GRIS: RGB = [240, 240, 243];
const BORD: RGB = [215, 215, 222];

/** Remplace les glyphes absents de la police standard plutôt que de les perdre. */
export function texte(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/[→⇒➜]/g, "->").replace(/[←]/g, "<-").replace(/[★☆]/g, "*")
    .replace(/[\u202F\u00A0]/g, " ").replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'")
    .replace(/…/g, "...");
}

type CaseEmploye = { etape: BlocExport["etape"]; chef: boolean };
export type LigneEmploye = { personne: { nom: string; prenom: string }; jours: CaseEmploye[][] };

export type ExportPlanningEquipes = {
  vue: VuePlanning;
  titre: string;
  dates: string[];
  blocs: BlocExport[];
  lignes: LigneEmploye[];
  libelles: Record<string, string>;
  titreJour: (iso: string) => string;
  dateCourte: (iso: string) => string;
  nomFichier: string;
};

const MARGE = 10;

function tete(pdf: jsPDF, p: ExportPlanningEquipes) {
  const pageW = pdf.internal.pageSize.getWidth();
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(20);
  pdf.text(texte(p.titre), MARGE, MARGE + 5);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(110);
  pdf.text(p.vue === "employes" ? "Vue par employé" : "Vue jour par jour", pageW - MARGE, MARGE + 5, { align: "right" });
  // Légende des couleurs
  let x = MARGE; const y = MARGE + 9;
  pdf.setFontSize(7); pdf.setFont("helvetica", "bold");
  for (const [t, c] of Object.entries(COULEURS_ETAPE)) {
    const l = texte(p.libelles[t] ?? t); const w = pdf.getTextWidth(l) + 3;
    if (x + w > pageW - MARGE) break;
    pdf.setFillColor(...c); pdf.roundedRect(x, y - 2.8, w, 4, 0.8, 0.8, "F");
    pdf.setTextColor(255); pdf.text(l, x + 1.5, y);
    x += w + 1.5;
  }
  pdf.setDrawColor(...BORD); pdf.setLineWidth(0.2);
  pdf.line(MARGE, MARGE + 13, pageW - MARGE, MARGE + 13);
  pdf.setTextColor(0); pdf.setFont("helvetica", "normal");
}

function vueJours(pdf: jsPDF, p: ExportPlanningEquipes) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const largeur = pageW - MARGE * 2;
  let premiere = true;
  for (const jour of p.dates) {
    const duJour = p.blocs.filter(b => b.jour === jour);
    if (!duJour.length) continue;
    if (!premiere) pdf.addPage();
    premiere = false;
    tete(pdf, p);
    let y = MARGE + 16;
    const nbPers = duJour.reduce((n, b) => n + b.personnes.length, 0);
    pdf.setFillColor(...PRIMAIRE); pdf.roundedRect(MARGE, y, largeur, 8, 1, 1, "F");
    pdf.setTextColor(255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(12);
    const titre = texte(p.titreJour(jour));
    const titreCap = titre.charAt(0).toUpperCase() + titre.slice(1);
    const sous = ` · ${duJour.length} intervention${duJour.length > 1 ? "s" : ""} · ${nbPers} pers.`;
    const w1 = pdf.getTextWidth(titreCap); pdf.setFontSize(9); pdf.setFont("helvetica", "normal");
    const w2 = pdf.getTextWidth(sous);
    const x0 = pageW / 2 - (w1 + w2) / 2;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.text(titreCap, x0, y + 5.6);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text(sous, x0 + w1, y + 5.6);
    pdf.setTextColor(0);
    y += 11;

    for (const b of duJour) {
      const couleur = COULEURS_ETAPE[b.etape.type] ?? [200, 200, 200];
      const equipe: { content: string; styles?: Record<string, unknown> }[][] = [];
      if (!b.personnes.length) {
        equipe.push([{ content: "Équipe à compléter", colSpan: 6, styles: { fillColor: [252, 232, 232], textColor: [190, 40, 40], fontStyle: "italic" } } as never]);
      } else {
        for (let r = 0; r < Math.ceil(b.personnes.length / 6); r++) {
          equipe.push(Array.from({ length: 6 }, (_, c) => {
            const pe = b.personnes[r * 6 + c];
            const chef = pe?.role === "chef_equipe";
            return { content: texte(pe?.nom ?? ""), styles: chef ? { fontStyle: "bold", fillColor: [226, 222, 245] } : { fillColor: [248, 248, 250] } };
          }));
        }
      }
      autoTable(pdf, {
        startY: y,
        margin: { left: MARGE, right: MARGE, top: MARGE + 16 },
        tableWidth: largeur,
        rowPageBreak: "avoid",
        head: [ENTETE_BLOC.map(h => h.toUpperCase())],
        body: [
          [
            { content: texte(b.etape.numero), styles: { fillColor: couleur, textColor: 255, fontStyle: "bold", fontSize: 11 } },
            { content: texte(b.etape.nom), styles: { fontStyle: "bold", fontSize: 10 } },
            { content: texte(b.etape.responsable ?? "") },
            { content: texte(p.libelles[b.etape.type] ?? b.etape.type), styles: { textColor: couleur, fontStyle: "bold" } },
            { content: texte(b.etape.lieu ?? "") },
            { content: texte(commentaires(b.etape)), styles: { textColor: [100, 100, 110] } },
          ],
          ...equipe,
        ] as never,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.6, lineColor: BORD, lineWidth: 0.2, textColor: [25, 25, 35], overflow: "linebreak" },
        headStyles: { fillColor: GRIS, textColor: [110, 110, 120], fontSize: 7, fontStyle: "normal" },
        columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 36 }, 2: { cellWidth: 28 }, 3: { cellWidth: 22 }, 4: { cellWidth: 40 } },
      });
      // Espace entre deux interventions ; nouvelle page si la place manque.
      const fin = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
      y = fin + 4;
      if (y > pageH - MARGE - 10) { pdf.addPage(); tete(pdf, p); y = MARGE + 16; }
    }
  }
  if (premiere) { tete(pdf, p); pdf.setFontSize(10); pdf.text("Aucune étape cette semaine.", MARGE, MARGE + 22); }
}

function vueEmployes(pdf: jsPDF, p: ExportPlanningEquipes) {
  const pageW = pdf.internal.pageSize.getWidth();
  const weekend = (iso: string) => { const j = new Date(`${iso}T12:00:00Z`).getUTCDay(); return j === 0 || j === 6; };
  const body = p.lignes.map(l => {
    const nbJ = l.jours.filter(j => j.length).length;
    return [
      { content: `${texte(l.personne.nom.toLocaleUpperCase("fr"))} ${texte(l.personne.prenom)}\n${nbJ} j travaillé${nbJ > 1 ? "s" : ""}`, styles: { fontStyle: "bold" } },
      ...l.jours.map((cases, i) => ({
        content: cases.map(c => [
          `${texte(p.libelles[c.etape.type] ?? c.etape.type).toUpperCase()}${horaire(c.etape) ? ` ${horaire(c.etape)}` : ""}`,
          `${texte(c.etape.numero)} ${texte(c.etape.nom)}${c.chef ? " * chef" : ""}`,
          c.etape.lieu ? texte(c.etape.lieu) : "",
        ].filter(Boolean).join("\n")).join("\n\n"),
        styles: weekend(p.dates[i]!) ? { fillColor: [244, 244, 246] } : {},
        _cases: cases,
      })),
    ];
  });
  tete(pdf, p);
  autoTable(pdf, {
    startY: MARGE + 16,
    margin: { left: MARGE, right: MARGE, top: MARGE + 16 },
    tableWidth: pageW - MARGE * 2,
    rowPageBreak: "avoid",
    head: [["Nom Prénom", ...p.dates.map(d => texte(p.dateCourte(d)))]],
    body: body as never,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7, cellPadding: 1.4, lineColor: BORD, lineWidth: 0.2, valign: "top", overflow: "linebreak" },
    headStyles: { fillColor: PRIMAIRE, textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 34 } },
    didDrawCell: d => {
      // Liseré de couleur du type à gauche de chaque case remplie.
      if (d.section !== "body" || d.column.index === 0) return;
      const cases = (d.cell.raw as { _cases?: CaseEmploye[] })._cases;
      const c = cases?.[0];
      if (!c) return;
      pdf.setFillColor(...(COULEURS_ETAPE[c.etape.type] ?? [180, 180, 180]));
      pdf.rect(d.cell.x, d.cell.y, 1, d.cell.height, "F");
    },
    didDrawPage: d => { if (d.pageNumber > 1) tete(pdf, p); },
  });
  if (!p.lignes.length) { pdf.setFontSize(10); pdf.text("Aucun employé affecté cette semaine.", MARGE, MARGE + 30); }
}

export async function exporterPlanningEquipesPdf(p: ExportPlanningEquipes): Promise<{ pages: number }> {
  const pdf = new jsPDF({ orientation: p.vue === "employes" ? "landscape" : "portrait", unit: "mm", format: "a4" });
  pdf.setProperties({ title: texte(p.titre) });
  if (p.vue === "jours") vueJours(pdf, p); else vueEmployes(pdf, p);
  const total = pdf.getNumberOfPages();
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(140);
    pdf.text(`Page ${i} / ${total}`, pageW / 2, pageH - 5, { align: "center" });
  }
  pdf.save(p.nomFichier);
  return { pages: total };
}
