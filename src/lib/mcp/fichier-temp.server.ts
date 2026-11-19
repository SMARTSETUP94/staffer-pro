import { ToolError } from "@lovable.dev/mcp-js";
import { controlerOctets, PHOTO_MAX_OCTETS, PHOTO_MIMES, sha256, type Mime } from "./fichiers";

/**
 * Zone temporaire du connecteur : bucket privé « mcp-tmp » sans aucune politique utilisateur.
 * Seul ce module (serveur) y accède ; chemins liés à l'appelant (<user_id>/<sha256>), purge après 10 minutes.
 * Aucune donnée métier n'y transite : uniquement le fichier en attente de confirmation et sa fiche (type, source, nom).
 */
const BUCKET = "mcp-tmp";
export const TEMP_TTL_MS = 10 * 60 * 1000;
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
type Fiche = { mime: Mime; source: string | null; nom: string | null; taille: number };

export async function deposerTemp(userId: string, bytes: Uint8Array<ArrayBuffer>, mime: Mime, fiche: { source: string | null; nom: string | null }) {
  const db = await admin(); const ref = await sha256(bytes);
  const up = await db.storage.from(BUCKET).upload(`${userId}/${ref}.${PHOTO_MIMES[mime]}`, bytes, { contentType: mime, upsert: true });
  if (up.error) throw new ToolError(`Zone temporaire indisponible : ${up.error.message}`.slice(0, 200));
  const f: Fiche = { mime, source: fiche.source, nom: fiche.nom, taille: bytes.length };
  const meta = await db.storage.from(BUCKET).upload(`${userId}/${ref}.json`, new Blob([JSON.stringify(f)], { type: "application/json" }), { contentType: "application/json", upsert: true });
  if (meta.error) throw new ToolError("Zone temporaire indisponible");
  return ref;
}
export async function lireTemp(userId: string, ref: string) {
  if (!/^[0-9a-f]{64}$/.test(ref)) throw new ToolError("fichier_ref invalide (empreinte SHA-256 renvoyée par l'aperçu)");
  const db = await admin();
  const liste = await db.storage.from(BUCKET).list(userId, { search: ref, limit: 5 });
  const meta = (liste.data ?? []).find(o => o.name === `${ref}.json`);
  if (!meta || Date.now() - new Date(meta.created_at ?? 0).getTime() > TEMP_TTL_MS) throw new ToolError("fichier_ref inconnu ou expiré (10 minutes) : refaire l'aperçu avec le fichier");
  const m = await db.storage.from(BUCKET).download(`${userId}/${ref}.json`);
  if (m.error || !m.data) throw new ToolError("fichier_ref inconnu ou expiré");
  const fiche = JSON.parse(await m.data.text()) as Fiche;
  const f = await db.storage.from(BUCKET).download(`${userId}/${ref}.${PHOTO_MIMES[fiche.mime]}`);
  if (f.error || !f.data) throw new ToolError("fichier_ref inconnu ou expiré");
  const bytes = new Uint8Array(await f.data.arrayBuffer());
  if (await sha256(bytes) !== ref) throw new ToolError("Fichier temporaire altéré : refaire l'aperçu");
  return { ...controlerOctets(bytes, fiche.mime, PHOTO_MAX_OCTETS), source: fiche.source, nom: fiche.nom };
}
export async function retirerTemp(userId: string, ref: string, mime: Mime) {
  const db = await admin();
  await db.storage.from(BUCKET).remove([`${userId}/${ref}.${PHOTO_MIMES[mime]}`, `${userId}/${ref}.json`]).catch(() => null);
}
/** Purge bornée : fichiers de plus de 10 minutes de l'appelant, puis d'au plus 50 autres dossiers. Jamais bloquante. */
export async function purgerTemp(userId: string) {
  try {
    const db = await admin(); const limite = Date.now() - TEMP_TTL_MS;
    const dossiers = [userId, ...((await db.storage.from(BUCKET).list("", { limit: 50 })).data ?? []).map(d => d.name).filter(n => n && n !== userId)];
    for (const d of dossiers.slice(0, 51)) {
      const vieux = ((await db.storage.from(BUCKET).list(d, { limit: 100 })).data ?? []).filter(o => o.created_at && new Date(o.created_at).getTime() < limite).map(o => `${d}/${o.name}`);
      if (vieux.length) await db.storage.from(BUCKET).remove(vieux);
    }
  } catch { /* purge best-effort */ }
}
/** Retire une copie déposée dans affaires-photos qu'aucun document ne référence (échec ou doublon à la confirmation). */
export async function retirerDocumentOrphelin(path: string) {
  const db = await admin();
  const { count } = await db.from("affaire_documents").select("id", { count: "exact", head: true }).eq("storage_path", path);
  if ((count ?? 1) > 0) return false;
  const { error } = await db.storage.from("affaires-photos").remove([path]);
  return !error;
}
