/**
 * Cœur du classement automatique des pièces jointes d'une demande devis@ dans l'affaire DÉJÀ rattachée.
 * Outlook : lecture seule (GET uniquement). La fonction ne choisit jamais l'affaire et n'écrit sur la demande
 * que la trace classement_pj, via emails_classement_pj_enregistrer.
 * db = client de l'utilisateur (RLS) ou, pour la relance serveur, client service ; l'auteur des documents est
 * toujours la personne inscrite dans la trace (rattache_par), jamais un compte choisi au hasard.
 */
import { isDocumentAffaireCode, validateEmailDocument } from "@/lib/affaire-document-rules";
import { estLogoSignature, dimensionsImage, etatBilan, MOTIF_LOGO, PIECES_MAX, type BilanClassement, type PieceBilan } from "@/lib/pieces-jointes-classement";

type Graph = { base: string; token: string };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graphGet(g: Graph, path: string, essais = 3): Promise<any> {
  let last: unknown;
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(`${g.base}${path}`, { headers: { Authorization: `Bearer ${g.token}` } });
      if (r.ok) return await r.json();
      if (r.status < 500 && r.status !== 429) throw Object.assign(new Error(`Microsoft ${r.status}`), { definitif: true });
      last = new Error(`Microsoft ${r.status}`);
    } catch (e: any) { if (e?.definitif) throw e; last = e; }
    if (i < essais - 1) await pause(800 * (i + 1));
  }
  throw Object.assign(last instanceof Error ? last : new Error("Microsoft indisponible"), { reseau: true });
}

export type ResultatClassement = { bilan: BilanClassement; numero: string | null };

export async function classerPiecesJointes(db: any, emailId: string, auteurId: string, opts: { essais?: number } = {}): Promise<ResultatClassement> {
  const { data: email, error } = await db.from("emails_entrants").select("id,subject,source_boite,opportunite_id,classement_pj").eq("id", emailId).eq("source_boite", "devis").maybeSingle();
  if (error || !email) throw new Error("Demande client introuvable ou accès refusé");
  if (!email.opportunite_id) throw new Error("La demande n'est rattachée à aucune affaire");
  const affaireId: string = email.opportunite_id;
  const { data: affaire } = await db.from("affaires").select("id,numero").eq("id", affaireId).maybeSingle();
  const tentatives = Math.min(10, Number(email.classement_pj?.tentatives ?? 0) + 1);
  const base: BilanClassement = { etat: "classe", tentatives, affaire_id: affaireId, rattache_par: auteurId, pieces: [] };
  const enregistrer = async (b: BilanClassement) => {
    const r = await db.rpc("emails_classement_pj_enregistrer", { _email_id: emailId, _affaire_id: affaireId, _bilan: b });
    if (r.error) throw new Error(r.error.message);
    return b;
  };
  if (!affaire || !isDocumentAffaireCode(affaire.numero)) return { bilan: await enregistrer({ ...base, etat: "echec" }), numero: affaire?.numero ?? null };

  const { resolveMessage, getToken } = await import("@/lib/server-fns/shared-inbox-attachments.functions");
  let g: Graph, liste: any[];
  try {
    g = { base: await resolveMessage(db, emailId), token: await getToken() };
    liste = ((await graphGet(g, "/attachments?$select=id,name,contentType,size,isInline", opts.essais ?? 3)).value ?? []) as any[];
  } catch (e: any) {
    return { bilan: await enregistrer({ ...base, etat: etatBilan([], true, tentatives), pieces: email.classement_pj?.pieces ?? [] }), numero: affaire.numero };
  }
  const fichiers = liste.filter((a) => a["@odata.type"] !== "#microsoft.graph.itemAttachment" && a["@odata.type"] !== "#microsoft.graph.referenceAttachment").slice(0, PIECES_MAX);
  const pieces: PieceBilan[] = [];
  let reseau = false;
  for (const a of fichiers) {
    const att = String(a.id), nom = String(a.name ?? "piece-jointe").slice(0, 300), mime = String(a.contentType ?? "application/octet-stream");
    const { data: deja } = await db.from("affaire_documents").select("id").eq("affaire_id", affaireId).eq("source_email_id", emailId).eq("source_attachment_id", att).is("deleted_at", null).maybeSingle();
    if (deja) { pieces.push({ attachment_id: att, nom, resultat: "doublon", document_id: deja.id }); continue; }
    try {
      validateEmailDocument(mime, Number(a.size ?? 0));
    } catch (e: any) { pieces.push({ attachment_id: att, nom, resultat: "refusee", motif: String(e.message).slice(0, 300) }); continue; }
    if (estLogoSignature({ nom, mime, taille: Number(a.size ?? 0), inline: !!a.isInline })) { pieces.push({ attachment_id: att, nom, resultat: "ecartee_logo", motif: MOTIF_LOGO }); continue; }
    let full: any;
    try { full = await graphGet(g, `/attachments/${encodeURIComponent(att)}`, opts.essais ?? 3); }
    catch (e: any) { if (e?.reseau) reseau = true; pieces.push({ attachment_id: att, nom, resultat: "refusee", motif: "Lecture Microsoft impossible" }); continue; }
    if (!full.contentBytes) { pieces.push({ attachment_id: att, nom, resultat: "refusee", motif: "Email joint ou lien, pas un fichier" }); continue; }
    const bytes = Uint8Array.from(atob(full.contentBytes), (c) => c.charCodeAt(0));
    if (estLogoSignature({ nom, mime, taille: bytes.byteLength, inline: !!a.isInline, dims: dimensionsImage(bytes) })) { pieces.push({ attachment_id: att, nom, resultat: "ecartee_logo", motif: MOTIF_LOGO }); continue; }
    try { validateEmailDocument(mime, bytes.byteLength); } catch (e: any) { pieces.push({ attachment_id: att, nom, resultat: "refusee", motif: String(e.message).slice(0, 300) }); continue; }
    const id = crypto.randomUUID();
    const ext = nom.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "bin";
    const path = `${affaireId}/${id}.${ext}`;
    const up = await db.storage.from("affaires-photos").upload(path, bytes, { contentType: mime, upsert: false });
    if (up.error) { pieces.push({ attachment_id: att, nom, resultat: "refusee", motif: "Dépôt du fichier refusé" }); continue; }
    const ins = await db.from("affaire_documents").insert({ id, affaire_id: affaireId, storage_path: path, filename: nom, mime_type: mime, taille_bytes: bytes.byteLength, uploaded_by: auteurId, description: `Email : ${email.subject ?? "Sans objet"}`, source_email_id: emailId, source_attachment_id: att });
    if (ins.error) {
      await db.storage.from("affaires-photos").remove([path]);
      if (ins.error.code === "23505") {
        const { data: s } = await db.from("affaire_documents").select("id").eq("affaire_id", affaireId).eq("source_email_id", emailId).eq("source_attachment_id", att).is("deleted_at", null).maybeSingle();
        if (s) { pieces.push({ attachment_id: att, nom, resultat: "doublon", document_id: s.id }); continue; }
      }
      pieces.push({ attachment_id: att, nom, resultat: "refusee", motif: "Enregistrement refusé" }); continue;
    }
    pieces.push({ attachment_id: att, nom, resultat: "classee", document_id: id });
  }
  return { bilan: await enregistrer({ ...base, etat: etatBilan(pieces, reseau, tentatives), pieces }), numero: affaire.numero };
}

/** Bilan prévisionnel pour la reprise admin : lecture seule (base + Outlook), rien n'est écrit. */
export async function bilanReprise(db: any) {
  const rows: any[] = [];
  for (let off = 0; ; off += 500) {
    const r = await db.from("emails_entrants").select("id,opportunite_id,classement_pj,has_attachments").eq("source_boite", "devis").not("opportunite_id", "is", null).order("id").range(off, off + 499);
    if (r.error) throw new Error(r.error.message);
    rows.push(...(r.data ?? []));
    if ((r.data?.length ?? 0) < 500) break;
  }
  const aTraiter = rows.filter((r) => !r.classement_pj || ["a_reprendre", "echec", "partiel"].includes(r.classement_pj.etat));
  return { rattachees: rows.length, deja_classees: rows.length - aTraiter.length, a_traiter: aTraiter.length, ids: aTraiter.map((r) => r.id as string) };
}
