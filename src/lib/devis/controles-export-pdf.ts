/** Avertissements avant export du PDF client : informatifs, jamais bloquants, aucune donnée n'est modifiée. */
import type { DevisClient } from "./pdf-client";

export type AvertissementExport = { code: "note_interne" | "visuel_absent" | "sans_contact" | "sans_cgv"; message: string; ligneId?: string };

const NOTE_INTERNE = /(à|a)\s+recaler|(à|a)\s+confirmer|\bestim[ée]e?s?\b|\bTODO\b|\?/i;
const VISUEL = /\bslides?\b|\bplans?\b|\bvisuels?\b/i;

export function avertissementsExportPdf(vc: Pick<DevisClient, "lignes" | "photos" | "contact" | "cgv" | "joindre_cgv">): AvertissementExport[] {
  const out: AvertissementExport[] = [];
  const avecPhoto = new Set(vc.photos.filter((p) => p.mime !== "application/pdf").map((p) => p.ligne_id));
  for (const l of [...vc.lignes].sort((a, b) => a.ordre - b.ordre)) {
    const d = [l.finition, l.descriptif_client, l.type === "commentaire" ? l.texte : null].map((x) => (x ?? "").trim()).filter(Boolean).join("\n");
    if (!d) continue;
    // Un texte sans titre (commentaire sous un objet) est rapporté à son objet : nom et photos du parent.
    const parent = !l.libelle?.trim() && l.parent_id ? vc.lignes.find((x) => x.id === l.parent_id) : undefined;
    const cible = parent ?? l;
    const nom = cible.libelle?.trim() || "Ligne sans titre";
    const m = d.match(NOTE_INTERNE);
    if (m) out.push({ code: "note_interne", ligneId: cible.id, message: `« ${nom} » : le descriptif semble contenir une note interne (« ${m[0]} »).` });
    if (VISUEL.test(d) && !avecPhoto.has(cible.id) && !avecPhoto.has(l.id)) out.push({ code: "visuel_absent", ligneId: cible.id, message: `« ${nom} » cite un visuel ou un plan, mais aucune image visible client n'est rattachée.` });
  }
  const vus = new Set<string>();
  const uniques = out.filter((a) => { const k = `${a.code}:${a.ligneId}`; if (vus.has(k)) return false; vus.add(k); return true; });
  out.length = 0; out.push(...uniques);
  if (!vc.contact?.nom?.trim()) out.push({ code: "sans_contact", message: "Aucun contact destinataire : le PDF n'aura pas de « À l'attention de »." });
  if (vc.joindre_cgv === false || !vc.cgv?.trim()) out.push({ code: "sans_cgv", message: "Les conditions générales de vente ne seront pas jointes." });
  return out;
}
