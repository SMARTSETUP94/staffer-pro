/** Règles pures partagées : fiche client prête pour Pennylane. */

export const CONDITIONS_PAIEMENT = [
  "Payable dès réception",
  "Paiement sous 30 jours",
  "Paiement 30 jours fin de mois",
  "Paiement sous 45 jours",
  "Paiement 45 jours fin de mois",
  "Paiement sous 60 jours",
] as const;

export const PAYS_OPTIONS: { code: string; label: string }[] = [
  { code: "FR", label: "France" },
  { code: "MC", label: "Monaco" },
  { code: "BE", label: "Belgique" },
  { code: "CH", label: "Suisse" },
  { code: "LU", label: "Luxembourg" },
  { code: "IT", label: "Italie" },
  { code: "ES", label: "Espagne" },
  { code: "DE", label: "Allemagne" },
  { code: "GB", label: "Royaume-Uni" },
  { code: "NL", label: "Pays-Bas" },
  { code: "US", label: "États-Unis" },
];

const LA_POSTE = "356000000";

/** Clé de Luhn sur SIREN (9) ou SIRET (14), exception La Poste. */
export function luhnOk(num: string): boolean {
  if (!/^\d{9}$/.test(num) && !/^\d{14}$/.test(num)) return false;
  if (num === LA_POSTE) return true;
  if (num.length === 14 && num.startsWith(LA_POSTE)) {
    const s = [...num].reduce((a, c) => a + Number(c), 0);
    return s % 5 === 0;
  }
  let s = 0;
  for (let i = 1; i <= num.length; i++) {
    let d = Number(num[num.length - i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    s += d;
  }
  return s % 10 === 0;
}

export function nettoyerChiffres(v: string | null | undefined): string {
  return (v ?? "").replace(/\s/g, "");
}

/** SIREN effectif : saisi, sinon déduit du SIRET. */
export function sirenEffectif(siren: string | null | undefined, siret: string | null | undefined): string | null {
  const s = nettoyerChiffres(siren);
  if (/^\d{9}$/.test(s)) return s;
  const t = nettoyerChiffres(siret);
  return /^\d{14}$/.test(t) ? t.slice(0, 9) : null;
}

/** TVA intracom FR calculée depuis le SIREN. */
export function tvaDepuisSiren(siren: string): string | null {
  if (!/^\d{9}$/.test(siren)) return null;
  const cle = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(cle).padStart(2, "0")}${siren}`;
}

export function tvaCoherente(tva: string | null | undefined, siren: string | null): boolean | null {
  const t = (tva ?? "").replace(/\s/g, "").toUpperCase();
  if (!t || !siren || !t.startsWith("FR")) return null;
  return t === tvaDepuisSiren(siren);
}

export function emailValide(e: string): boolean {
  return /^[^@\s,]+@[^@\s,]+\.[a-z]{2,}$/i.test(e);
}

export function codePostalValide(cp: string | null | undefined, pays: string | null | undefined): boolean {
  if (!cp) return true;
  return (pays ?? "FR") !== "FR" || /^\d{5}$/.test(cp);
}

export interface ClientPennylane {
  nom: string | null;
  type_client: string | null;
  siren: string | null;
  siret: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string | null;
  emails_facturation: string[] | null;
  conditions_paiement: string | null;
  prenom_facturation?: string | null;
  nom_facturation?: string | null;
  plateforme_facturation?: string | null;
}

/** Liste des champs manquants pour Pennylane (vide = fiche complète). */
export function champsManquantsPennylane(c: ClientPennylane): string[] {
  const m: string[] = [];
  const particulier = c.type_client === "particulier";
  if (!c.nom?.trim()) m.push("Dénomination");
  if (particulier && !(c.nom_facturation?.trim())) m.push("Nom (particulier)");
  if (!particulier && (c.pays ?? "FR") === "FR" && !sirenEffectif(c.siren, c.siret)) m.push("SIREN");
  if (!c.adresse?.trim()) m.push("Adresse");
  if (!c.code_postal?.trim()) m.push("Code postal");
  if (!c.ville?.trim()) m.push("Ville");
  if (!c.pays?.trim()) m.push("Pays");
  // Une plateforme de facturation (Chorus, Sy by Cegedim…) remplace l'e-mail.
  if (!(c.emails_facturation ?? []).some(emailValide) && !c.plateforme_facturation?.trim())
    m.push("E-mail ou plateforme de facturation");
  if (!c.conditions_paiement) m.push("Conditions de paiement");
  return m;
}
