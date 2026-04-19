/**
 * Parsing & mapping des CSV RH (380 lignes) pour l'import des employés.
 *
 * Format attendu (séparateur `;`, encodage Windows-1252 → décodé en UTF-8 par
 * l'appelant) :
 *   Nom complet ; Contrat ; Poste ; Téléphone ; Mobile ; Email ; Date naissance ; Adresse
 *
 * Nom complet : "XX- NOM Prénom - Y" (XX préfixe interne ignoré, Y suffixe
 * métier ignoré car redondant avec la colonne Poste).
 */
import Papa from "papaparse";

export type ContratDb = "CDI" | "CDD" | "Interim" | "Independant";
export type MetierCode =
  | "construction"
  | "metallerie"
  | "peinture"
  | "numerique"
  | "tapisserie"
  | "machiniste"
  | "logistique"
  | "suivi_projet";

export interface ParsedEmployeRow {
  /** Numéro de ligne dans le CSV (1-based, en-tête exclus). */
  rowIndex: number;
  /** Données brutes pour debug / affichage. */
  raw: {
    nomComplet: string;
    contrat: string;
    poste: string;
    telephone: string;
    mobile: string;
    email: string;
    dateNaissance: string;
    adresse: string;
  };
  /** Données normalisées prêtes à insérer/mettre à jour. */
  parsed: {
    nom: string;
    prenom: string;
    type_contrat: ContratDb;
    sous_type_contrat: string | null;
    is_apprenti: boolean;
    agence_interim: string | null;
    metierCode: MetierCode | null;
    competencesSecondairesCodes: MetierCode[];
    telephone: string | null;
    mobile: string | null;
    email: string | null;
    date_naissance: string | null; // ISO yyyy-mm-dd
    adresse: string | null;
    non_staffing: boolean;
    actif: boolean;
  };
  /** Avertissements non bloquants (ex. métier déduit, date suspecte). */
  warnings: string[];
  /** Erreurs bloquantes — la ligne ne sera pas importée. */
  errors: string[];
  /** Si true, l'utilisateur peut quand même la garder mais elle ne participera pas au planning. */
  excluded: boolean;
}

/** Mapping libellé Poste (normalisé) → code métier. */
const POSTE_TO_METIER: Record<string, MetierCode> = {
  "constructeur": "construction",
  "machiniste decor": "machiniste",
  "machiniste décor": "machiniste",
  "peintre": "peinture",
  "peintre deco": "peinture",
  "peintre déco": "peinture",
  "serrurier": "metallerie",
  "tapissier": "tapisserie",
  "accessoiriste": "tapisserie",
  "management de projet": "suivi_projet",
  "bed/bec - tarifs bureau d'etude": "suivi_projet",
  "bed/bec - tarifs bureau d'étude": "suivi_projet",
  "bed": "suivi_projet",
  "bec": "suivi_projet",
  "operateur commande numerique": "numerique",
  "opérateur commande numérique": "numerique",
  "chef d'equipe": "machiniste",
  "chef d'équipe": "machiniste",
  "magasinier": "logistique",
};

/** Postes administratifs à exclure du staffing (non_staffing=true, actif=false). */
const POSTES_NON_STAFFING = new Set([
  "assistante rh",
  "assistant rh",
  "comptable",
  "assistante comptable",
  "assistant comptable",
]);

/** Suffixes contrat INTER-X → métier déduit quand le poste est vide. */
const INTERIM_SUFFIX_TO_METIER: Record<string, MetierCode> = {
  P: "peinture",
  CO: "construction",
  MA: "machiniste",
  S: "metallerie",
  T: "tapisserie",
};

const STRIP_DIACRITICS = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const norm = (s: string) => STRIP_DIACRITICS(s).toLowerCase().trim();

/** Décode un buffer Windows-1252 en string. */
export function decodeWindows1252(buffer: ArrayBuffer): string {
  return new TextDecoder("windows-1252").decode(buffer);
}

/** Sépare nom complet "[XX-] NOM Prénom [- Y]" → { nom, prenom }.
 * Tolère : préfixe absent, suffixe collé ("JULIA- C", "Aglae - p", "Brieg -C"),
 * espaces insécables, suffixes multiples ("- MP - AE"), casse mixte.
 */
export function parseNomComplet(input: string): { nom: string; prenom: string } | null {
  let s = (input ?? "")
    .replace(/\u00a0/g, " ") // NBSP
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  // Retire préfixe "XX-" ou "XX - " en début (2-4 lettres alpha).
  s = s.replace(/^[A-Za-z]{1,4}\s*-\s*/, "");
  // Retire les suffixes en fin (" - X", "-X", " -X", " - X - Y") jusqu'à 3 fois.
  // Suffixe = 1-4 caractères alpha (codes métier ou variantes).
  for (let i = 0; i < 3; i++) {
    const m = s.match(/\s*-\s*[A-Za-z]{1,4}\s*$/);
    if (!m) break;
    s = s.slice(0, m.index!).trim();
  }
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const isUpper = (t: string) => {
    const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
    return letters.length >= 2 && letters === letters.toUpperCase();
  };

  const nomTokens: string[] = [];
  const prenomTokens: string[] = [];

  if (tokens.every(isUpper)) {
    // Tout MAJ : dernier token = prénom (cas "BOUZIDI FARES")
    nomTokens.push(...tokens.slice(0, -1));
    prenomTokens.push(tokens[tokens.length - 1]);
  } else if (tokens.every((t) => !isUpper(t))) {
    // Tout casse mixte : premier = nom (ex. "Bouzidi Fares", "Carvalho Alberto")
    nomTokens.push(tokens[0]);
    prenomTokens.push(...tokens.slice(1));
  } else {
    // Mix : tokens MAJ initiaux = nom, le reste = prénom
    let switched = false;
    for (const t of tokens) {
      if (!switched && isUpper(t)) nomTokens.push(t);
      else {
        switched = true;
        prenomTokens.push(t);
      }
    }
    if (prenomTokens.length === 0 && nomTokens.length > 1) {
      prenomTokens.push(nomTokens.pop()!);
    }
  }

  const nom = nomTokens.join(" ").toUpperCase();
  const titleCase = (t: string) =>
    t
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join("-");
  const prenom = prenomTokens.map(titleCase).join(" ");
  if (!nom || !prenom) return null;
  return { nom, prenom };
}

interface ContratParsed {
  type: ContratDb;
  sousType: string | null;
  isApprenti: boolean;
  interimSuffix: string | null;
}

/** Décode le code contrat RH → enum DB + métadonnées. */
export function parseContrat(raw: string): ContratParsed {
  const code = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (code === "CDI") return { type: "CDI", sousType: null, isApprenti: false, interimSuffix: null };
  if (code === "CDIC") return { type: "CDI", sousType: "CDIC", isApprenti: false, interimSuffix: null };
  if (code === "CDD") return { type: "CDD", sousType: null, isApprenti: false, interimSuffix: null };
  if (code === "CDD - APPR" || code === "CDD-APPR" || code === "APPR")
    return { type: "CDD", sousType: "CDD-APPR", isApprenti: true, interimSuffix: null };
  if (code === "IND") return { type: "Independant", sousType: null, isApprenti: false, interimSuffix: null };
  if (code === "INTERIM") return { type: "Interim", sousType: null, isApprenti: false, interimSuffix: null };
  const interMatch = code.match(/^INTER\s*-\s*([A-Z]+)$/);
  if (interMatch) {
    const suffix = interMatch[1];
    return { type: "Interim", sousType: `INTER-${suffix}`, isApprenti: false, interimSuffix: suffix };
  }
  // Fallback : on tente CDI par défaut, à signaler.
  return { type: "CDI", sousType: code || null, isApprenti: false, interimSuffix: null };
}

/** Convertit une date "JJ/MM/AAAA" ou "JJ-MM-AAAA" en ISO yyyy-mm-dd. */
export function parseFrenchDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  let year = m[3];
  if (year.length === 2) {
    const n = Number(year);
    year = (n > 30 ? "19" : "20") + year;
  }
  const iso = `${year}-${month}-${day}`;
  // Validation grossière.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return iso;
}

/** Trouve le métier à partir du libellé poste (ou null si inconnu). */
export function mapPosteToMetier(poste: string): MetierCode | null {
  const n = norm(poste);
  if (!n) return null;
  if (POSTE_TO_METIER[n]) return POSTE_TO_METIER[n];
  // Recherche par inclusion (ex. "Peintre déco - intérimaire").
  for (const [k, v] of Object.entries(POSTE_TO_METIER)) {
    if (n.startsWith(k) || n.includes(k)) return v;
  }
  return null;
}

export function isPosteNonStaffing(poste: string): boolean {
  return POSTES_NON_STAFFING.has(norm(poste));
}

export interface ParseResult {
  rows: ParsedEmployeRow[];
  totalLines: number;
  parseErrors: string[];
}

/** Parse le contenu CSV (déjà décodé UTF-8) en lignes normalisées. */
export function parseCsv(text: string): ParseResult {
  const result = Papa.parse<string[]>(text, {
    delimiter: ";",
    skipEmptyLines: true,
  });
  const parseErrors = result.errors.map(
    (e) => `Ligne ${e.row ?? "?"} : ${e.message}`,
  );
  const all = result.data ?? [];
  if (all.length === 0) return { rows: [], totalLines: 0, parseErrors };

  // Détection en-tête : la première ligne contient-elle "nom" et "contrat" ?
  const first = all[0].map((c) => norm(c ?? ""));
  const hasHeader = first.some((c) => c.includes("nom")) &&
    first.some((c) => c.includes("contrat"));
  const dataRows = hasHeader ? all.slice(1) : all;

  const rows: ParsedEmployeRow[] = dataRows.map((cols, i) => {
    const raw = {
      nomComplet: (cols[0] ?? "").trim(),
      contrat: (cols[1] ?? "").trim(),
      poste: (cols[2] ?? "").trim(),
      telephone: (cols[3] ?? "").trim(),
      mobile: (cols[4] ?? "").trim(),
      email: (cols[5] ?? "").trim(),
      dateNaissance: (cols[6] ?? "").trim(),
      adresse: (cols[7] ?? "").trim(),
    };
    const errors: string[] = [];
    const warnings: string[] = [];

    const nameParsed = parseNomComplet(raw.nomComplet);
    if (!nameParsed) errors.push("Nom complet illisible");

    const contrat = parseContrat(raw.contrat);
    if (!raw.contrat) warnings.push("Contrat vide → CDI par défaut");

    const isAdmin = isPosteNonStaffing(raw.poste);
    let metierCode = mapPosteToMetier(raw.poste);
    let exclude = false;

    if (!raw.poste) {
      if (contrat.interimSuffix && INTERIM_SUFFIX_TO_METIER[contrat.interimSuffix]) {
        metierCode = INTERIM_SUFFIX_TO_METIER[contrat.interimSuffix];
        warnings.push(`Métier déduit du suffixe ${contrat.interimSuffix} → ${metierCode}`);
      } else {
        exclude = true;
        warnings.push("Poste vide → exclu du staffing");
      }
    } else if (isAdmin) {
      exclude = true;
      warnings.push(`Poste « ${raw.poste} » → exclu du staffing`);
    } else if (!metierCode) {
      warnings.push(`Poste « ${raw.poste} » non mappé → à corriger manuellement`);
    }

    // Auto-compétence secondaire : Constructeur → machiniste.
    const competencesSecondairesCodes: MetierCode[] = [];
    if (metierCode === "construction") competencesSecondairesCodes.push("machiniste");

    const dateIso = parseFrenchDate(raw.dateNaissance);
    if (raw.dateNaissance && !dateIso) warnings.push("Date de naissance illisible");

    const email = raw.email ? raw.email.toLowerCase() : null;

    return {
      rowIndex: i + 1,
      raw,
      parsed: {
        nom: nameParsed?.nom ?? "",
        prenom: nameParsed?.prenom ?? "",
        type_contrat: contrat.type,
        sous_type_contrat: contrat.sousType,
        is_apprenti: contrat.isApprenti,
        agence_interim: contrat.type === "Interim" ? null : null, // CSV ne fournit pas l'agence ; à enrichir manuellement.
        metierCode,
        competencesSecondairesCodes,
        telephone: raw.telephone || null,
        mobile: raw.mobile || null,
        email,
        date_naissance: dateIso,
        adresse: raw.adresse || null,
        non_staffing: exclude,
        actif: !exclude,
      },
      warnings,
      errors,
      excluded: exclude,
    };
  });

  return { rows, totalLines: dataRows.length, parseErrors };
}
