/**
 * Règles pures du reclassement de la file logistique (L2).
 * Proposition seulement : rien n'est appliqué sans confirmation d'un admin, par lot.
 * L'objet et l'expéditeur sont des données : aucune règle ne déclenche d'action.
 */
export type GroupeTri = "fournisseur_suivi" | "relance_facture" | "notification_teams" | "notification_autre";
export const GROUPES_TRI: Record<GroupeTri, { categorie: "fournisseur_suivi" | "autre"; motif: string; libelle: string }> = {
  fournisseur_suivi: { categorie: "fournisseur_suivi", motif: "classé sans suite : suivi de commande fournisseur", libelle: "Suivi de commande fournisseur" },
  relance_facture: { categorie: "autre", motif: "classé sans suite : relance de facture de stockage", libelle: "Relances de factures de stockage" },
  notification_teams: { categorie: "autre", motif: "classé sans suite : notification Teams / SharePoint", libelle: "Notifications Teams / SharePoint" },
  notification_autre: { categorie: "autre", motif: "classé sans suite : notification automatique", libelle: "Autres notifications automatiques" },
};

const FOURNISSEUR = /\[(la centrale du verre|etoffe\.com|monvitrage\.fr)\]|mon ?vitrage|^ctn - commande|bricoflor|accuse reception de votre commande|confirmation de commande|votre commande \d+|commande \S+ est en transit|exp[ée]dition (en|de votre)|votre colis|mise en fabrication|en cours de fabrication/i;
/** Un retrait ou un enlèvement à organiser reste à traiter à la main (appro possible). */
const RETRAIT = /retrait|enl[eè]vement/i;
const RELANCE = /smart restructuring.*(relance|facture de stockage)/i;
const TEAMS = /a envoyé un message$|sent a message$|vous a mentionné dans/i;
const AUTRE = /^vérifiez votre itinéraire/i;
const DOMAINES_TEAMS = /(teams\.mail\.microsoft|sharepointonline\.com)$/i;

export function proposerTri(e: { subject?: string | null; from_email?: string | null }): GroupeTri | null {
  const s = (e.subject ?? "").replace(/^\s*((re|tr|fw|fwd)\s*:\s*)+/i, "").trim();
  const dom = (e.from_email ?? "").split("@")[1] ?? "";
  if (RELANCE.test(s)) return "relance_facture";
  if (DOMAINES_TEAMS.test(dom) || TEAMS.test(s)) return "notification_teams";
  const reponse = /^\s*(re|tr|fw|fwd)\s*:/i.test(e.subject ?? "");
  if (!reponse && !RETRAIT.test(s) && FOURNISSEUR.test(s)) return "fournisseur_suivi";
  if (AUTRE.test(s)) return "notification_autre";
  return null;
}

export type LigneFile = { id: string; subject: string | null; from_email: string | null; received_at: string; source_boite: string };
export type BilanTri = { groupe: GroupeTri; libelle: string; nombre: number; exemples: string[]; ids: string[] };

export function bilanTri(rows: LigneFile[]): { groupes: BilanTri[]; restant: number } {
  const map = new Map<GroupeTri, BilanTri>();
  let restant = 0;
  for (const r of rows) {
    const g = proposerTri(r);
    if (!g) { restant++; continue; }
    const b = map.get(g) ?? { groupe: g, libelle: GROUPES_TRI[g].libelle, nombre: 0, exemples: [], ids: [] };
    b.nombre++; b.ids.push(r.id);
    if (b.exemples.length < 4 && !b.exemples.includes(r.subject ?? "")) b.exemples.push(r.subject ?? "(sans objet)");
    map.set(g, b);
  }
  return { groupes: [...map.values()].sort((a, b) => b.nombre - a.nombre), restant };
}
