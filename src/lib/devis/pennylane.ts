/**
 * Transfert d'un devis signé vers Pennylane (module pur, testable sans réseau).
 * Contenu construit depuis la vue client (devis_lire_client) via construireProgbat, donc mêmes lignes, prix
 * et ajustement d'arrondi que l'export ProGBat : aucun coût, taux, marge ni ligne interne.
 * Options retenues = comprises ; options non retenues retirées.
 */
import type { DevisClient, LigneClient } from "./pdf-client";
import { construireProgbat, type DonneesProgbat } from "./progbat-export";
import { calculerRemise, prixLignes, type RemiseMode } from "./calcul";

const cents = (v: number | null | undefined) => Math.round(Number(v ?? 0) * 100);
const r2 = (v: number) => Math.round(v * 100) / 100;

export type DonneesPennylane = DevisClient & { remise_mode?: string | null; remise_valeur?: number | null };

/** Options du devis (toutes, incluses ou non) avec leur prix (montant propre + objets). */
export function optionsDuDevis(v: Pick<DevisClient, "lignes">) {
  const m = new Map(v.lignes.map((l) => [l.id, Number(l.montant ?? 0)]));
  const inclusTout = v.lignes.map((l) => (l.type === "option" ? { ...l, option_incluse: true } : l));
  const prix = prixLignes(inclusTout, (id) => m.get(id) ?? 0);
  return v.lignes.filter((l) => l.type === "option").sort((a, b) => a.ordre - b.ordre)
    .map((o) => ({ id: o.id, libelle: o.libelle?.trim() || "Option", montant: prix[o.id] ?? 0, incluse: !!o.option_incluse }));
}

/** Données du devis avec les options retenues comprises et les autres retirées ; totaux recalculés. */
export function avecOptionsRetenues<T extends DonneesPennylane>(v: T, retenues: ReadonlySet<string>): T {
  const retirees = new Set<string>();
  const parent = new Map(v.lignes.map((l) => [l.id, l.parent_id]));
  const sousRetiree = (id: string): boolean => {
    let p: string | null | undefined = id;
    while (p) { if (retirees.has(p)) return true; p = parent.get(p); }
    return false;
  };
  for (const l of v.lignes) if (l.type === "option" && !retenues.has(l.id)) retirees.add(l.id);
  const lignes: LigneClient[] = v.lignes.filter((l) => !sousRetiree(l.id))
    .map((l) => ({ ...l, sous_total: null, ...(l.type === "option" ? { option_incluse: true } : {}) }));
  const m = new Map(lignes.map((l) => [l.id, Number(l.montant ?? 0)]));
  const prix = prixLignes(lignes, (id) => m.get(id) ?? 0);
  const total = r2(lignes.filter((l) => !l.parent_id && l.type !== "commentaire").reduce((s, l) => s + (prix[l.id] ?? 0), 0));
  const remise = calculerRemise(total, { mode: (v.remise_mode ?? "aucune") as RemiseMode, valeur: v.remise_valeur ?? null });
  const net = r2(total - remise);
  const tva = r2(net * Number(v.tva_pct ?? 20) / 100);
  return { ...v, lignes, total_ht: total, remise, net_ht: net, tva, ttc: r2(net + tva), options_ht: 0 };
}

/** Taux de TVA Pennylane (codes FR_xxx). Taux inconnu → null (transfert refusé). */
export function codeTva(pct: number | null | undefined): string | null {
  const t = Number(pct ?? 20);
  const table: Record<string, string> = { "20": "FR_200", "10": "FR_100", "8.5": "FR_85", "5.5": "FR_55", "2.1": "FR_21", "0": "exempt" };
  return table[String(t)] ?? null;
}

export type LignePennylane = { label: string; description?: string; quantity: number; unit: string; raw_currency_unit_price: string; vat_rate: string; section_rank: number };
export type SectionPennylane = { title: string; description?: string; rank: number };
export type DevisPennylanePayload = {
  date: string; deadline: string; customer_id: number; pdf_invoice_subject: string; external_reference: string; language: "fr_FR";
  invoice_line_sections: SectionPennylane[]; invoice_lines: LignePennylane[];
  discount?: { type: "absolute"; value: string };
};

const ajoutDescription = (prev: string | undefined, t: string) => (prev ? `${prev}\n${t}` : t);

export function construirePennylane(v: DonneesPennylane, retenues: ReadonlySet<string>, p: { customerId: number; reference: string }) {
  const d = avecOptionsRetenues(v, retenues);
  const vat = codeTva(d.tva_pct);
  if (!vat) throw new Error(`Taux de TVA ${d.tva_pct} % non pris en charge pour Pennylane`);
  if (!d.date_devis) throw new Error("Date du devis manquante");
  const deadline = d.date_validite ?? ajoutJours(d.date_devis, d.validite_jours ?? 30);
  const { lignes, fiche } = construireProgbat({ ...d, lignes: optionsEnSections(d.lignes), heures: {} } as DonneesProgbat);
  const sections: SectionPennylane[] = [];
  const out: LignePennylane[] = [];
  let rang = 0;
  for (const l of lignes) {
    if (l.kind === "titre") {
      rang += 1;
      sections.push({ title: l.designation === "Options" ? "Options retenues" : `${l.n}. ${l.designation}`, rank: rang });
    } else if (l.kind === "commentaire") {
      const dernier = out[out.length - 1];
      if (dernier && dernier.section_rank === rang) dernier.description = ajoutDescription(dernier.description, l.designation);
      else if (sections.length) { const s = sections[sections.length - 1]!; s.description = ajoutDescription(s.description, l.designation); }
    } else if (l.kind === "ligne") {
      if (!rang) { rang = 1; sections.push({ title: d.libelle?.trim() || "Devis", rank: 1 }); }
      out.push({ label: `${l.n} ${l.designation.replace(/^Option : /, "")}`.slice(0, 250), quantity: l.quantite, unit: unitePennylane(l.unite),
        raw_currency_unit_price: l.pu.toFixed(2), vat_rate: vat, section_rank: rang });
    }
  }
  if (!out.length) throw new Error("Aucune ligne à transférer");
  const remise = Number(d.remise ?? 0);
  const payload: DevisPennylanePayload = {
    date: d.date_devis, deadline, customer_id: p.customerId, pdf_invoice_subject: (d.libelle?.trim() || p.reference).slice(0, 250),
    external_reference: p.reference, language: "fr_FR", invoice_line_sections: sections, invoice_lines: out,
    ...(remise > 0 ? { discount: { type: "absolute" as const, value: remise.toFixed(2) } } : {}),
  };
  const sommeLignes = out.reduce((s, l) => s + Math.round(l.quantity * cents(Number(l.raw_currency_unit_price))), 0) / 100;
  return { payload, attendu: { total_ht: d.total_ht, remise, net_ht: d.net_ht ?? d.total_ht, somme_lignes: sommeLignes, controle_lignes: fiche.controle_ok }, donnees: d };
}

/** Correspondance des unités Staffing → libellés Pennylane (à valider au premier essai réel). */
export const UNITES_PENNYLANE: Record<string, string> = {
  u: "piece", ens: "forfait", forfait: "forfait", h: "hour", j: "day", m: "m", ml: "m", m2: "m2", "m²": "m2", m3: "m3", "m³": "m3", kg: "kg", l: "l",
};
export const unitePennylane = (u: string | null | undefined) => UNITES_PENNYLANE[(u ?? "u").trim().toLowerCase()] ?? "piece";

/**
 * Une section Pennylane par option retenue avec ses objets : chaque option devient un chapitre racine
 * (placé après les chapitres existants, dans l'ordre du devis). Option sans objet = une ligne forfait.
 */
export function optionsEnSections(lignes: LigneClient[]): LigneClient[] {
  const options = lignes.filter((l) => l.type === "option");
  if (!options.length) return lignes;
  const aEnfants = new Set(lignes.map((l) => l.parent_id).filter(Boolean) as string[]);
  const rang = new Map([...lignes].sort((a, b) => a.ordre - b.ordre).map((l, i) => [l.id, i]));
  return lignes.map((l) => {
    if (l.type !== "option") return l;
    if (aEnfants.has(l.id) && Number(l.quantite ?? 1) !== 1)
      throw new Error(`Option « ${l.libelle ?? ""} » : quantité ${l.quantite} avec objets, non transférable en section`);
    return { ...l, type: "zone", parent_id: null, ordre: 1_000_000 + (rang.get(l.id) ?? 0), libelle: `Option : ${l.libelle?.trim() || "Option"}` };
  });
}

function ajoutJours(iso: string, j: number) {
  const dt = new Date(`${iso}T12:00:00Z`); dt.setUTCDate(dt.getUTCDate() + j); return dt.toISOString().slice(0, 10);
}

/** Contrôle au centime du total HT relu dans Pennylane. */
export function controleTotal(attenduNetHt: number, totalPennylane: number | string | null | undefined) {
  const lu = totalPennylane == null || totalPennylane === "" ? null : Number(totalPennylane);
  if (lu == null || Number.isNaN(lu)) return { ok: false, ecart: null as number | null, lu: null as number | null };
  const ecart = (cents(lu) - cents(attenduNetHt)) / 100;
  return { ok: ecart === 0, ecart, lu };
}

// ——— Rapprochement clients ———
export type ClientStaffing = { id: string; nom: string; siret: string | null; tva_intracom: string | null; pennylane_id: string | null };
export type ClientPennylane = { id: string; name: string; reg_no: string | null; vat_number: string | null };
export type Rapprochement = { client: ClientStaffing; statut: "rapproche" | "sur" | "douteux" | "aucun"; motif: string | null; candidats: ClientPennylane[] };

const chiffres = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const tvaNorm = (s: string | null | undefined) => (s ?? "").replace(/[\s.-]/g, "").toUpperCase();
export function nomNormalise(s: string | null | undefined) {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(sas|sasu|sarl|eurl|sa|sci|snc|eirl|ei|scop|ste|societe|ets|group|groupe)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** SIRET (14 puis SIREN 9) → TVA intracom → nom normalisé. « sûr » = candidat unique par SIRET ou TVA. */
export function rapprocherClients(staffing: ClientStaffing[], pennylane: ClientPennylane[]): Rapprochement[] {
  const pris = new Set(staffing.map((c) => c.pennylane_id).filter(Boolean) as string[]);
  return staffing.map((c) => {
    if (c.pennylane_id) return { client: c, statut: "rapproche", motif: "déjà rapproché", candidats: pennylane.filter((p) => p.id === c.pennylane_id) };
    const libres = pennylane.filter((p) => !pris.has(p.id));
    const siret = chiffres(c.siret);
    if (siret.length >= 9) {
      const exact = libres.filter((p) => chiffres(p.reg_no) === siret);
      if (exact.length) return { client: c, statut: exact.length === 1 ? "sur" : "douteux", motif: "SIRET identique", candidats: exact };
      const siren = siret.slice(0, 9);
      const parSiren = libres.filter((p) => chiffres(p.reg_no).slice(0, 9) === siren && chiffres(p.reg_no).length >= 9);
      if (parSiren.length) return { client: c, statut: parSiren.length === 1 ? "sur" : "douteux", motif: "SIREN identique", candidats: parSiren };
    }
    const tva = tvaNorm(c.tva_intracom);
    if (tva.length >= 8) {
      const t = libres.filter((p) => tvaNorm(p.vat_number) === tva);
      if (t.length) return { client: c, statut: t.length === 1 ? "sur" : "douteux", motif: "TVA intracom identique", candidats: t };
    }
    const n = nomNormalise(c.nom);
    if (n) {
      const parNom = libres.filter((p) => nomNormalise(p.name) === n);
      if (parNom.length) return { client: c, statut: "douteux", motif: "nom identique", candidats: parNom };
      const proches = n.length >= 4 ? libres.filter((p) => { const q = nomNormalise(p.name); return q.length >= 4 && (q.includes(n) || n.includes(q)); }) : [];
      if (proches.length) return { client: c, statut: "douteux", motif: "nom proche", candidats: proches.slice(0, 5) };
    }
    return { client: c, statut: "aucun", motif: null, candidats: [] };
  });
}
