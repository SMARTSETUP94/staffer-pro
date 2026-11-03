/**
 * Lisibilité de l'éditeur de devis (module pur) : points de la note de Claude,
 * liste de contrôle avant validation, ancres vers la page des taux.
 */

/** Découpe la note de Claude en points (une phrase = un point). */
export function pointsNote(note: string | null | undefined): string[] {
  if (!note) return [];
  return note
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Ý«"])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Nombre de points encore à confirmer (non barrés). */
export function pointsRestants(points: string[], coches: string[]) {
  const c = new Set(coches);
  return points.filter((p) => !c.has(p)).length;
}

/** Ancre d'un poste sur la page des taux (même calcul des deux côtés). */
export function ancrePoste(libelle: string) {
  return "poste-" + libelle.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export type CibleControle =
  | { kind: "contact" } | { kind: "client" } | { kind: "dates" }
  | { kind: "ligne"; ligneId: string } | { kind: "taux" };
export type PointControle = { cle: string; libelle: string; ok: boolean; detail?: string; cible: CibleControle };

export interface EntreeControle {
  contactId: string | null;
  client: { adresse: string | null; siret: string | null } | null;
  dates: Record<string, string | null | undefined>;
  /** Lignes chiffrées à 0 € (matériaux / lignes libres), avec leur ligne d'objet. */
  lignesZero: { ligneId: string; designation: string }[];
  /** Objets (hors chapitres Suivi/Pose/Dépose) sans photo. */
  objetsSansPhoto: { ligneId: string; libelle: string }[];
  nbObjets: number;
  coutsManquants: number | null;
}

/** Liste de contrôle non bloquante affichée au-dessus de « Valider ». */
export function listeControle(e: EntreeControle): PointControle[] {
  const manqueClient = !e.client ? ["client"] : [!e.client.adresse && "adresse", !e.client.siret && "SIRET"].filter(Boolean) as string[];
  const datesCles: [string, string][] = [["date_montage", "montage"], ["date_evenement_debut", "début d'événement"], ["date_demontage", "démontage"]];
  const datesManq = datesCles.filter(([k]) => !e.dates[k]).map(([, l]) => l);
  const pts: PointControle[] = [
    { cle: "contact", libelle: "Contact choisi", ok: !!e.contactId, cible: { kind: "contact" } },
    { cle: "client", libelle: "Client complet", ok: manqueClient.length === 0, detail: manqueClient.length ? `manque ${manqueClient.join(", ")}` : undefined, cible: { kind: "client" } },
    { cle: "dates", libelle: "Dates clés renseignées", ok: datesManq.length === 0, detail: datesManq.length ? `manque ${datesManq.join(", ")}` : undefined, cible: { kind: "dates" } },
    { cle: "zero", libelle: "Aucune ligne à 0 € à confirmer", ok: e.lignesZero.length === 0,
      detail: e.lignesZero.length ? `${e.lignesZero.length} ligne(s) : ${e.lignesZero.slice(0, 3).map((l) => l.designation).join(", ")}${e.lignesZero.length > 3 ? "…" : ""}` : undefined,
      cible: e.lignesZero[0] ? { kind: "ligne", ligneId: e.lignesZero[0].ligneId } : { kind: "dates" } },
    { cle: "photos", libelle: "Photos jointes", ok: e.nbObjets === 0 || e.objetsSansPhoto.length === 0,
      detail: e.objetsSansPhoto.length ? `${e.objetsSansPhoto.length} objet(s) sans photo` : undefined,
      cible: e.objetsSansPhoto[0] ? { kind: "ligne", ligneId: e.objetsSansPhoto[0].ligneId } : { kind: "dates" } },
  ];
  if (e.coutsManquants != null) pts.push({ cle: "couts", libelle: "Coûts complets", ok: e.coutsManquants === 0, detail: e.coutsManquants ? `${e.coutsManquants} coût(s) manquant(s)` : undefined, cible: { kind: "taux" } });
  return pts;
}
