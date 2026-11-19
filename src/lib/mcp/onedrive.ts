import { ToolError } from "@lovable.dev/mcp-js";
import { controlerOctets, PHOTO_MAX_OCTETS, trop, type Mime } from "./fichiers";

/** Lecture seule du dossier OneDrive « Staffing » de smart@setup.paris, par jeton d'application (jamais exposé). */
export const ONEDRIVE_UPN = "smart@setup.paris";
export const ONEDRIVE_RACINE = "Staffing";
const GRAPH = "https://graph.microsoft.com/v1.0";
export const PERMISSION_MANQUANTE = "Permission Sites.Selected non accordée au OneDrive de smart@ (lecture du dossier Staffing impossible) : à faire accorder par l'administrateur Microsoft 365";

/** Chemin relatif sous Staffing/ (ex. 9539/02_entree.jpg) : pas de .., pas de chemin absolu, pas de raccourci. */
export function cheminOneDriveValide(chemin: string) {
  const c = chemin.trim().replace(/^Staffing\//i, "");
  if (!c || c.length > 400) throw new ToolError("Chemin OneDrive vide ou trop long");
  if (/[\\:*?"<>|#%\u0000-\u001f]/.test(c) || c.startsWith("/") || c.endsWith("/") || c.includes("//")) throw new ToolError(`Chemin OneDrive refusé : ${c} (chemin relatif sous Staffing/, ex. 9539/02_entree.jpg)`);
  const segs = c.split("/");
  if (segs.some(s => s === ".." || s === "." || !s.trim() || s !== s.trim())) throw new ToolError("Chemin OneDrive refusé : « .. » et segments vides interdits");
  if (/\.(url|lnk)$/i.test(c)) throw new ToolError("Raccourci OneDrive refusé : fournir le fichier lui-même");
  return segs.map(encodeURIComponent).join("/");
}
export function itemIdValide(id: string) {
  if (!/^[A-Za-z0-9!._-]{5,200}$/.test(id)) throw new ToolError("Identifiant OneDrive invalide");
  return id;
}
export type DriveItem = { id?: string; name?: string; size?: number; file?: unknown; folder?: unknown; package?: unknown; remoteItem?: unknown; shared?: unknown;
  parentReference?: { driveId?: string; path?: string } };
/** L'élément doit être un fichier du drive de smart@, rangé sous Staffing/ ; ni dossier, ni raccourci, ni élément partagé d'un autre drive. */
export function elementAutorise(item: DriveItem, driveId: string) {
  if (item.remoteItem) throw new ToolError("Élément partagé depuis un autre OneDrive ou raccourci : refusé (copier le fichier dans Staffing/)");
  if (item.folder || item.package || !item.file) throw new ToolError("L'élément OneDrive n'est pas un fichier");
  if (!item.parentReference?.driveId || item.parentReference.driveId !== driveId) throw new ToolError("Fichier hors du OneDrive de smart@ : refusé");
  const p = decodeURIComponent(item.parentReference.path ?? "");
  const racine = `/drive/root:/${ONEDRIVE_RACINE}`;
  const sous = p.toLowerCase() === racine.toLowerCase() || p.toLowerCase().startsWith(racine.toLowerCase() + "/");
  if (!sous || p.split("/").includes("..")) throw new ToolError(`Fichier hors du dossier ${ONEDRIVE_RACINE} : refusé`);
  if (Number(item.size ?? 0) > PHOTO_MAX_OCTETS) throw trop(PHOTO_MAX_OCTETS, Number(item.size));
  return `${ONEDRIVE_RACINE}${p.slice(racine.length)}/${item.name ?? ""}`;
}

async function jetonGraph(fetcher: typeof fetch) {
  const tenant = process.env.MS_GRAPH_TENANT_ID, clientId = process.env.MS_GRAPH_CLIENT_ID, secret = process.env.MS_GRAPH_CLIENT_SECRET;
  if (!tenant || !clientId || !secret) throw new ToolError("Accès Microsoft non configuré sur le serveur");
  const r = await fetcher(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }) });
  if (!r.ok) throw new ToolError(`Jeton Microsoft refusé (HTTP ${r.status})`);
  return ((await r.json()) as { access_token: string }).access_token;
}
async function graph(fetcher: typeof fetch, token: string, path: string) {
  const r = await fetcher(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401 || r.status === 403) throw new ToolError(PERMISSION_MANQUANTE);
  if (r.status === 404) throw new ToolError("Fichier introuvable dans le dossier OneDrive Staffing");
  if (!r.ok) throw new ToolError(`OneDrive indisponible (HTTP ${r.status})`);
  return r.json();
}

/** Télécharge un fichier du dossier Staffing (chemin relatif ou identifiant) : garde-fous de drive, de dossier, de type, de fin de fichier et de taille. */
export async function telechargerOneDrive(src: { chemin?: string; itemId?: string }, mime?: Mime, fetcher: typeof fetch = fetch) {
  const enc = src.chemin ? cheminOneDriveValide(src.chemin) : null;
  const id = src.itemId ? itemIdValide(src.itemId) : null;
  if (!enc === !id) throw new ToolError("Fournir onedrive_chemin ou onedrive_item_id");
  const token = await jetonGraph(fetcher);
  const u = encodeURIComponent(ONEDRIVE_UPN);
  const drive = await graph(fetcher, token, `/users/${u}/drive?$select=id`) as { id?: string };
  if (!drive.id) throw new ToolError(PERMISSION_MANQUANTE);
  const sel = "$select=id,name,size,file,folder,package,remoteItem,parentReference";
  const item = await graph(fetcher, token, enc ? `/drives/${drive.id}/root:/${ONEDRIVE_RACINE}/${enc}?${sel}` : `/drives/${drive.id}/items/${id}?${sel}`) as DriveItem;
  const chemin = elementAutorise(item, drive.id);
  const r = await fetcher(`${GRAPH}/drives/${drive.id}/items/${encodeURIComponent(String(item.id))}/content`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401 || r.status === 403) throw new ToolError(PERMISSION_MANQUANTE);
  if (!r.ok || !r.body) throw new ToolError(`Téléchargement OneDrive refusé (HTTP ${r.status})`);
  const reader = r.body.getReader(); const parts: Uint8Array[] = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > PHOTO_MAX_OCTETS) { await reader.cancel(); throw trop(PHOTO_MAX_OCTETS, n); }
    parts.push(value);
  }
  const bytes = new Uint8Array(new ArrayBuffer(n)); let o = 0;
  for (const p of parts) { bytes.set(p, o); o += p.length; }
  return { ...controlerOctets(bytes, mime, PHOTO_MAX_OCTETS), source: `OneDrive ${chemin}`.slice(0, 200), nom: String(item.name ?? "") };
}
