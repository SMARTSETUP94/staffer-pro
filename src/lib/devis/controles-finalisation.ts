/**
 * Contrôles « Avant de valider » — miroir pur de devis_controles_lire (proposé).
 * Bloquants : total HT ≤ 0, client facturé absent, validité passée. Le reste avertit.
 * Ne lit ni n'expose aucun coût ni marge : seulement des prix de vente et des champs présents.
 */
import { prixLignes } from "./calcul";

export type NiveauControle = "bloquant" | "avertissement";
export type CibleControle = "totaux" | "client" | "dates" | "contact" | "signataire" | "ligne";
export type PointControle = { code: string; niveau: NiveauControle; cible: CibleControle; message: string; ligneId?: string };

export type EntreeControles = {
  totalHt: number;
  aujourdhui: string; // AAAA-MM-JJ
  dateValidite: string | null;
  client: { email?: string | null; adresse?: string | null; code_postal?: string | null; ville?: string | null } | null;
  contactId: string | null;
  signataire: { prenom?: string | null; nom?: string | null; email?: string | null; telephone?: string | null };
  lignes: { id: string; parent_id: string | null; type: string; libelle: string | null; descriptif_client: string | null; option_incluse?: boolean | null }[];
  /** Montant propre de chaque ligne (calc.lignes), sans les enfants. */
  montants: Record<string, number>;
  materiaux: { ligne_id: string; designation: string | null; venteUnitaire: number }[];
  libres: { ligne_id: string; designation: string | null; venteUnitaire: number; forfaitSansPrix?: boolean }[];
};

const vide = (v: string | null | undefined) => !String(v ?? "").trim();

export function controlesFinalisation(e: EntreeControles): { points: PointControle[]; bloquants: number; avertissements: number } {
  const pts: PointControle[] = [];
  const add = (p: PointControle) => pts.push(p);
  if (!(Number(e.totalHt) > 0)) add({ code: "TOTAL_NON_POSITIF", niveau: "bloquant", cible: "totaux", message: "Total HT inférieur ou égal à 0 €" });
  if (!e.client) add({ code: "CLIENT_ABSENT", niveau: "bloquant", cible: "client", message: "Client facturé absent" });
  if (e.dateValidite && e.dateValidite.slice(0, 10) < e.aujourdhui) add({ code: "VALIDITE_PASSEE", niveau: "bloquant", cible: "dates", message: "Date de validité passée" });
  if (e.client) {
    if (vide(e.client.email)) add({ code: "CLIENT_EMAIL", niveau: "avertissement", cible: "client", message: "Client sans e-mail" });
    if (vide(e.client.adresse) || vide(e.client.code_postal) || vide(e.client.ville)) add({ code: "CLIENT_ADRESSE", niveau: "avertissement", cible: "client", message: "Adresse client incomplète" });
  }
  if (!e.contactId) add({ code: "CONTACT_ABSENT", niveau: "avertissement", cible: "contact", message: "Aucun contact choisi" });
  const s = e.signataire;
  if (vide(s.prenom) || vide(s.nom) || vide(s.email) || vide(s.telephone)) add({ code: "SIGNATAIRE_INCOMPLET", niveau: "avertissement", cible: "signataire", message: "Signataire incomplet" });

  const prix = prixLignes(e.lignes, (id) => Number(e.montants[id] ?? 0));
  const enfants = (id: string) => e.lignes.filter((l) => l.parent_id === id);
  const aObjet = (id: string): boolean => enfants(id).some((k) => k.type === "objet" || aObjet(k.id));
  for (const l of e.lignes) {
    const nom = l.libelle?.trim() || (l.type === "option" ? "Option" : "Objet");
    if (l.type === "option" && (prix[l.id] ?? 0) === 0 && !aObjet(l.id))
      add({ code: "OPTION_VIDE", niveau: "avertissement", cible: "ligne", ligneId: l.id, message: `${nom} : aucun objet ni prix` });
    else if ((l.type === "objet" || l.type === "option") && (prix[l.id] ?? 0) === 0)
      add({ code: "LIGNE_ZERO", niveau: "avertissement", cible: "ligne", ligneId: l.id, message: `${nom} : 0 € HT` });
    if (l.type !== "commentaire" && vide(l.descriptif_client))
      add({ code: "DESCRIPTIF_ABSENT", niveau: "avertissement", cible: "ligne", ligneId: l.id, message: `${l.libelle?.trim() || "Ligne"} : descriptif client absent` });
  }
  for (const m of e.materiaux) if (!(m.venteUnitaire > 0))
    add({ code: "MATIERE_SANS_PRIX", niveau: "avertissement", cible: "ligne", ligneId: m.ligne_id, message: `${m.designation?.trim() || "Matière"} : prix absent ou nul` });
  for (const f of e.libres) if (f.forfaitSansPrix || !(f.venteUnitaire > 0))
    add({ code: "ARTICLE_SANS_PRIX", niveau: "avertissement", cible: "ligne", ligneId: f.ligne_id, message: `${f.designation?.trim() || "Article"} : prix absent ou nul` });

  const bloquants = pts.filter((p) => p.niveau === "bloquant").length;
  return { points: [...pts.filter((p) => p.niveau === "bloquant"), ...pts.filter((p) => p.niveau === "avertissement")], bloquants, avertissements: pts.length - bloquants };
}

/** Finaliser : jamais avec un bloquant ; avec avertissements seulement après « je confirme ». */
export const peutFinaliser = (r: { bloquants: number; avertissements: number }, confirme: boolean) =>
  r.bloquants === 0 && (r.avertissements === 0 || confirme);
