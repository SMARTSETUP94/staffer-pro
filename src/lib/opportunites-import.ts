/**
 * v0.17 — Parser CSV/Excel pour l'import initial des opportunités CRM.
 * Colonnes attendues (détection par header, insensible à la casse/accents) :
 *   - "code" / "numero" / "n°" → numéro 9XXX (obligatoire)
 *   - "client" → nom client (obligatoire)
 *   - "nom" / "libelle" / "intitule" → libellé (sinon = client)
 *   - "taille" / "size" → tres_petit | petit | moyen | gros | tres_gros
 *   - "statut" / "status" → a_faire | envoye | gagne | perdu | termine
 *   - "date" / "date_opportunite" → ISO ou DD/MM/YYYY
 *   - "ca" / "charge_affaires" / "responsable" → email du chargé d'affaires
 *   - "commentaires" / "notes" → texte libre
 *
 * UPSERT idempotent sur le numero d'affaire.
 */
import * as XLSX from "xlsx-js-style";
import type { OpportuniteStatut, OpportuniteTaille } from "./opportunites";

export interface ParsedOpportuniteRow {
  rowIndex: number;
  raw: Record<string, unknown>;
  parsed: {
    numero: string | null;
    client: string | null;
    nom: string | null;
    taille: OpportuniteTaille | null;
    statut: OpportuniteStatut;
    date_opportunite: string | null;
    charge_affaires_email: string | null;
    commentaires: string | null;
  };
  errors: string[];
  warnings: string[];
}

const TAILLE_VALUES: OpportuniteTaille[] = [
  "tres_petit",
  "petit",
  "moyen",
  "gros",
  "tres_gros",
];

const STATUT_VALUES: OpportuniteStatut[] = ["a_faire", "envoye", "gagne", "perdu", "termine"];

import { normalizeName } from "./string-normalize";

function normalizeKey(s: string): string {
  return normalizeName(s).replace(/[^a-z0-9]/g, "");
}

function findColumn(headers: string[], aliases: string[]): number {
  const normHeaders = headers.map(normalizeKey);
  for (const alias of aliases) {
    const i = normHeaders.indexOf(normalizeKey(alias));
    if (i !== -1) return i;
  }
  return -1;
}

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      const iso = `${d.y.toString().padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
      return iso;
    }
  }
  const s = String(v).trim();
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY ou DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${mo}-${d}`;
  }
  return null;
}

function parseTaille(v: unknown): OpportuniteTaille | null {
  if (v == null || v === "") return null;
  const k = normalizeKey(String(v));
  if (TAILLE_VALUES.includes(k as OpportuniteTaille)) return k as OpportuniteTaille;
  // Aliases courants
  if (k === "trespetit" || k === "tp" || k === "xs") return "tres_petit";
  if (k === "petit" || k === "p" || k === "s") return "petit";
  if (k === "moyen" || k === "m" || k === "med") return "moyen";
  if (k === "gros" || k === "g" || k === "l") return "gros";
  if (k === "tresgros" || k === "tg" || k === "xl") return "tres_gros";
  return null;
}

function parseStatut(v: unknown): OpportuniteStatut {
  if (v == null || v === "") return "a_faire";
  const k = normalizeKey(String(v));
  if (STATUT_VALUES.includes(k as OpportuniteStatut)) return k as OpportuniteStatut;
  if (k === "afaire" || k === "todo" || k === "nouveau") return "a_faire";
  if (k === "envoye" || k === "envoyee" || k === "sent") return "envoye";
  if (k === "gagne" || k === "gagnee" || k === "won" || k === "signe") return "gagne";
  if (k === "perdu" || k === "perdue" || k === "lost") return "perdu";
  if (k === "termine" || k === "terminee" || k === "done") return "termine";
  return "a_faire";
}

export function parseOpportunitesFile(buffer: ArrayBuffer): {
  rows: ParsedOpportuniteRow[];
  parseErrors: string[];
} {
  const parseErrors: string[] = [];
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array", raw: false, cellDates: false });
  } catch (e) {
    return {
      rows: [],
      parseErrors: [`Impossible de lire le fichier : ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { rows: [], parseErrors: ["Aucune feuille trouvée"] };
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  if (matrix.length < 2) {
    return { rows: [], parseErrors: ["Fichier vide ou sans données"] };
  }

  const headers = (matrix[0] as unknown[]).map((h) => String(h ?? "").trim());

  const idxNumero = findColumn(headers, ["code", "numero", "n", "no", "numéro", "num"]);
  const idxClient = findColumn(headers, ["client", "customer", "compte"]);
  const idxNom = findColumn(headers, ["nom", "libelle", "libellé", "intitule", "intitulé", "objet", "name"]);
  const idxTaille = findColumn(headers, ["taille", "size"]);
  const idxStatut = findColumn(headers, ["statut", "status", "etat", "état"]);
  const idxDate = findColumn(headers, [
    "date",
    "dateopportunite",
    "date_opportunite",
    "date opp",
    "dateopp",
  ]);
  const idxCa = findColumn(headers, [
    "ca",
    "chargeaffaires",
    "charge_affaires",
    "charge",
    "responsable",
    "owner",
    "email",
  ]);
  const idxNotes = findColumn(headers, ["commentaires", "notes", "comments", "comment"]);

  if (idxNumero === -1) parseErrors.push("Colonne 'code' (ou 'numero') introuvable.");
  if (idxClient === -1) parseErrors.push("Colonne 'client' introuvable.");

  const rows: ParsedOpportuniteRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i] as unknown[];
    if (!r || r.every((v) => v === "" || v == null)) continue;

    const errors: string[] = [];
    const warnings: string[] = [];

    const rawNumero = idxNumero !== -1 ? String(r[idxNumero] ?? "").trim() : "";
    const numero = rawNumero.match(/9\d{3}/)?.[0] ?? null;
    if (!numero) errors.push("Numéro 9XXX manquant ou invalide");

    const client = idxClient !== -1 ? String(r[idxClient] ?? "").trim() || null : null;
    if (!client) errors.push("Client manquant");

    const nom = idxNom !== -1 ? String(r[idxNom] ?? "").trim() || null : null;

    const taille = idxTaille !== -1 ? parseTaille(r[idxTaille]) : null;
    if (idxTaille !== -1 && !taille && r[idxTaille])
      warnings.push(`Taille non reconnue : "${r[idxTaille]}" → ignorée`);

    const statut = idxStatut !== -1 ? parseStatut(r[idxStatut]) : "a_faire";
    const date_opportunite = idxDate !== -1 ? parseDate(r[idxDate]) : null;

    const caRaw = idxCa !== -1 ? String(r[idxCa] ?? "").trim() : "";
    const charge_affaires_email = caRaw.includes("@") ? caRaw.toLowerCase() : null;
    if (caRaw && !charge_affaires_email) warnings.push(`CA "${caRaw}" — email attendu`);

    const commentaires = idxNotes !== -1 ? String(r[idxNotes] ?? "").trim() || null : null;

    const raw: Record<string, unknown> = {};
    headers.forEach((h, k) => {
      raw[h] = r[k];
    });

    rows.push({
      rowIndex: i + 1,
      raw,
      parsed: {
        numero,
        client,
        nom,
        taille,
        statut,
        date_opportunite,
        charge_affaires_email,
        commentaires,
      },
      errors,
      warnings,
    });
  }

  return { rows, parseErrors };
}
