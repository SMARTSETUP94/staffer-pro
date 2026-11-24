/** Client HTTP Pennylane (API v2), serveur uniquement. Le jeton n'est jamais renvoyé ni journalisé. */
const BASE = "https://app.pennylane.com/api/external/v2";
/** Garde-fou : Staffing n'envoie jamais de devis par e-mail ni ne change son statut dans Pennylane. */
const INTERDIT = /send_by_email|update_status|customer_invoices/;

export class PennylaneErreur extends Error {
  constructor(message: string, public statut: number | null) { super(message); }
}

export function jetonPennylane(): string {
  const t = process.env["PENNYLANE_API_TOKEN"];
  if (!t) throw new PennylaneErreur("Clé Pennylane absente", null);
  return t;
}

export async function appelPennylane<T = any>(chemin: string, init: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
  if (INTERDIT.test(chemin)) throw new PennylaneErreur("Appel Pennylane interdit", null);
  const headers: Record<string, string> = { Authorization: `Bearer ${jetonPennylane()}`, Accept: "application/json" };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  for (let essai = 0; essai < 3; essai++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    let r: Response;
    try {
      r = await fetch(`${BASE}${chemin}`, { method: init.method ?? "GET", headers, redirect: "manual", signal: ctrl.signal,
        body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined) });
    } catch {
      throw new PennylaneErreur("Pennylane ne répond pas", null);
    } finally { clearTimeout(t); }
    if (r.status === 429 && essai < 2) { await new Promise((ok) => setTimeout(ok, 1000 * Number(r.headers.get("retry-after") ?? 2))); continue; }
    const texte = await r.text();
    if (!r.ok) {
      let msg = `Pennylane a refusé la demande (${r.status})`;
      try { const j = JSON.parse(texte); if (j?.message || j?.error) msg += ` : ${String(j.message ?? j.error).slice(0, 300)}`; } catch { /* corps non JSON */ }
      if (r.status === 401) msg = "Jeton Pennylane invalide ou expiré";
      if (r.status === 403) msg = "Jeton Pennylane sans le droit nécessaire (vérifier les scopes)";
      throw new PennylaneErreur(msg, r.status);
    }
    return (texte ? JSON.parse(texte) : null) as T;
  }
  throw new PennylaneErreur("Pennylane : trop de demandes, réessayez", 429);
}

export async function listerClientsPennylane() {
  const out: { id: string; name: string; reg_no: string | null; vat_number: string | null }[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 100; page++) {
    const q = new URLSearchParams({ limit: "100" }); if (cursor) q.set("cursor", cursor);
    const r: any = await appelPennylane(`/customers?${q}`);
    for (const c of r?.items ?? []) out.push({ id: String(c.id), name: String(c.name ?? [c.first_name, c.last_name].filter(Boolean).join(" ")), reg_no: c.reg_no ?? null, vat_number: c.vat_number ?? null });
    if (!r?.has_more || !r?.next_cursor) break;
    cursor = r.next_cursor;
  }
  return out;
}

export async function chercherDevisParReference(ref: string): Promise<any | null> {
  const filter = JSON.stringify([{ field: "external_reference", operator: "eq", value: ref }]);
  try {
    const r: any = await appelPennylane(`/quotes?limit=5&filter=${encodeURIComponent(filter)}`);
    return (r?.items ?? []).find((q: any) => q.external_reference === ref) ?? null;
  } catch (e) {
    if (e instanceof PennylaneErreur && (e.statut === 400 || e.statut === 422)) return null;
    throw e;
  }
}

/** Champs utiles d'un devis Pennylane relu (noms tolérants aux variantes de l'API). */
export function lireDevisPennylane(q: any) {
  return {
    id: String(q?.id ?? ""),
    numero: (q?.quote_number ?? q?.invoice_number ?? q?.label ?? null) as string | null,
    total_ht: (q?.currency_amount_before_tax ?? q?.amount_before_tax ?? null) as string | number | null,
    lien: (q?.public_file_url ?? q?.file_url ?? null) as string | null,
  };
}
