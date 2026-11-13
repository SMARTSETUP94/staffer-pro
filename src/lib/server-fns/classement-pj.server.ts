/**
 * Cœur du classement automatique des pièces jointes d'une demande devis@ dans l'affaire DÉJÀ rattachée.
 * Outlook : lecture seule (GET uniquement). La fonction ne choisit jamais l'affaire et n'écrit sur la demande
 * que la trace classement_pj, via emails_classement_pj_enregistrer.
 * db = client de l'utilisateur (RLS) ou, pour la relance serveur, client service ; l'auteur des documents est
 * toujours la personne inscrite dans la trace (rattache_par), jamais un compte choisi au hasard.
 */
import { isDocumentAffaireCode, validateEmailDocument } from "@/lib/affaire-document-rules";
import { estLogoSignature, cleImage, dimensionsImage, etatBilan, MOTIF_LOGO, PIECES_MAX, type BilanClassement, type PieceBilan } from "@/lib/pieces-jointes-classement";

import { categorieParRegle } from "@/lib/devis/images-ia";
import { empreinte } from "@/lib/devis/empreinte";

type Graph = { base: string; token: string };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET Microsoft avec délai, journal du code HTTP et du corps d'erreur, nouvel essai sur 429/5xx/réseau. */
async function graphFetch(g: Graph, path: string, essais: number, delaiMs: number): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(`${g.base}${path}`, { headers: { Authorization: `Bearer ${g.token}` }, signal: AbortSignal.timeout(delaiMs) });
      if (r.ok) return r;
      const corps = (await r.text().catch(() => "")).slice(0, 300);
      console.error(`[classement-pj] Microsoft ${r.status} sur ${path.split("?")[0]} : ${corps}`);
      if (r.status < 500 && r.status !== 429) throw Object.assign(new Error(`Microsoft ${r.status} : ${corps.slice(0, 120)}`), { definitif: true });
      last = new Error(`Microsoft ${r.status}`);
    } catch (e: any) {
      if (e?.definitif) throw e;
      console.error(`[classement-pj] lecture Microsoft échouée (${path.split("?")[0]}) : ${e?.name ?? ""} ${e?.message ?? e}`);
      last = e;
    }
    if (i < essais - 1) await pause(800 * (i + 1));
  }
  throw Object.assign(last instanceof Error ? last : new Error("Microsoft indisponible"), { reseau: true });
}
const graphGet = async (g: Graph, path: string, essais = 3) => (await graphFetch(g, path, essais, 20_000)).json();
/** Contenu brut d'une pièce (/$value) : pas de base64, délai adapté à 15 Mo. */
export const graphBrut = async (g: Graph, att: string, essais = 3) =>
  new Uint8Array(await (await graphFetch(g, `/attachments/${encodeURIComponent(att)}/$value`, essais, 120_000)).arrayBuffer());

/** Clés « nom|taille » des images collées dans les 5 autres mails du même expéditeur (lecture seule). */
async function imagesRepetees(db: any, g: Graph, emailId: string, fromEmail: string | null): Promise<Set<string>> {
  const vues = new Set<string>();
  if (!fromEmail) return vues;
  const { data } = await db.from("emails_entrants").select("id").eq("source_boite", "devis").eq("from_email", fromEmail).neq("id", emailId).order("received_at", { ascending: false }).limit(5);
  const { resolveMessage } = await import("@/lib/server-fns/shared-inbox-attachments.functions");
  for (const r of (data ?? []) as { id: string }[]) {
    try {
      const v = await (await graphFetch({ base: await resolveMessage(db, r.id), token: g.token }, "/attachments?$select=id,name,size,isInline,contentType", 1, 15_000)).json();
      for (const a of (v.value ?? []) as any[]) if (a.isInline && /^image\//i.test(a.contentType ?? "")) vues.add(cleImage(a.name, a.size));
    } catch { /* un mail illisible ne bloque pas la règle */ }
  }
  return vues;
}

export type ResultatClassement = { bilan: BilanClassement; numero: string | null };

export async function classerPiecesJointes(db: any, emailId: string, auteurId: string, opts: { essais?: number } = {}): Promise<ResultatClassement> {
  const { data: email, error } = await db.from("emails_entrants").select("id,subject,source_boite,opportunite_id,classement_pj,from_email").eq("id", emailId).eq("source_boite", "devis").maybeSingle();
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
    console.error(`[classement-pj] liste des pièces de ${emailId} illisible : ${e?.message ?? e}`);
    return { bilan: await enregistrer({ ...base, etat: etatBilan([], true, tentatives), pieces: email.classement_pj?.pieces ?? [] }), numero: affaire.numero };
  }
  const fichiers = liste.filter((a) => a["@odata.type"] !== "#microsoft.graph.itemAttachment" && a["@odata.type"] !== "#microsoft.graph.referenceAttachment").slice(0, PIECES_MAX);
  const pieces: PieceBilan[] = [];
  let reseau = false;
  const repetees = fichiers.some((a) => a.isInline) ? await imagesRepetees(db, g, emailId, email.from_email ?? null) : new Set<string>();
  for (const a of fichiers) {
    const att = String(a.id), nom = String(a.name ?? "piece-jointe").slice(0, 300), mime = String(a.contentType ?? "application/octet-stream");
    const { data: deja } = await db.from("affaire_documents").select("id").eq("affaire_id", affaireId).eq("source_email_id", emailId).eq("source_attachment_id", att).is("deleted_at", null).maybeSingle();
    if (deja) { pieces.push({ attachment_id: att, nom, resultat: "doublon", document_id: deja.id }); continue; }
    try {
      validateEmailDocument(mime, Number(a.size ?? 0));
    } catch (e: any) { pieces.push({ attachment_id: att, nom, resultat: "refusee", motif: String(e.message).slice(0, 300) }); continue; }
    if (estLogoSignature({ nom, mime, taille: Number(a.size ?? 0), inline: !!a.isInline, repetee: repetees.has(cleImage(nom, a.size)) })) { pieces.push({ attachment_id: att, nom, resultat: "ecartee_logo", motif: MOTIF_LOGO }); continue; }
    // Une pièce à la fois, contenu brut : une erreur sur une pièce n'arrête pas les suivantes.
    let bytes: Uint8Array;
    try { bytes = await graphBrut(g, att, opts.essais ?? 3); }
    catch (e: any) { if (e?.reseau) reseau = true; pieces.push({ attachment_id: att, nom, resultat: "refusee", motif: `Lecture Microsoft impossible : ${String(e?.message ?? e).slice(0, 150)}` }); continue; }
    if (estLogoSignature({ nom, mime, taille: bytes.byteLength, inline: !!a.isInline, dims: dimensionsImage(bytes) })) { pieces.push({ attachment_id: att, nom, resultat: "ecartee_logo", motif: MOTIF_LOGO }); continue; }
    try { validateEmailDocument(mime, bytes.byteLength); } catch (e: any) { pieces.push({ attachment_id: att, nom, resultat: "refusee", motif: String(e.message).slice(0, 300) }); continue; }
    const id = crypto.randomUUID();
    const ext = nom.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "bin";
    const path = `${affaireId}/${id}.${ext}`;
    const up = await db.storage.from("affaires-photos").upload(path, bytes, { contentType: mime, upsert: false });
    if (up.error) { pieces.push({ attachment_id: att, nom, resultat: "refusee", motif: "Dépôt du fichier refusé" }); continue; }
    const regle = categorieParRegle(nom);
    const ins = await db.from("affaire_documents").insert({ id, affaire_id: affaireId, storage_path: path, filename: nom, mime_type: mime, taille_bytes: bytes.byteLength, uploaded_by: auteurId, description: `Email : ${email.subject ?? "Sans objet"}`, source_email_id: emailId, source_attachment_id: att,
      empreinte_sha256: await empreinte(bytes), ...(regle ? { categorie: regle, categorie_source: "regle" } : {}) });
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
export async function bilanReprise(db: any, detailMax = 150) {
  const rows: any[] = [];
  for (let off = 0; ; off += 500) {
    const r = await db.from("emails_entrants").select("id,opportunite_id,classement_pj,has_attachments").eq("source_boite", "devis").not("opportunite_id", "is", null).order("id").range(off, off + 499);
    if (r.error) throw new Error(r.error.message);
    rows.push(...(r.data ?? []));
    if ((r.data?.length ?? 0) < 500) break;
  }
  const aTraiter = rows.filter((r) => !r.classement_pj || ["a_reprendre", "echec", "partiel"].includes(r.classement_pj.etat));
  const { resolveMessage, getToken } = await import("@/lib/server-fns/shared-inbox-attachments.functions");
  const token = await getToken().catch(() => null);
  const p = { total: 0, deja_classees: 0, logos_probables: 0, a_classer: 0, mails_inaccessibles: 0, mails_examines: 0 };
  for (const r of aTraiter.slice(0, detailMax)) {
    if (!r.has_attachments) { p.mails_examines++; continue; }
    try {
      if (!token) throw new Error("token");
      const v = await (await graphFetch({ base: await resolveMessage(db, r.id), token }, "/attachments?$select=id,name,size,isInline,contentType", 1, 15_000)).json();
      const fichiers = ((v.value ?? []) as any[]).filter((a) => a["@odata.type"] === "#microsoft.graph.fileAttachment");
      const { data: docs } = await db.from("affaire_documents").select("source_attachment_id").eq("source_email_id", r.id).eq("affaire_id", r.opportunite_id).is("deleted_at", null);
      const deja = new Set(((docs ?? []) as any[]).map((d) => d.source_attachment_id));
      for (const a of fichiers) {
        p.total++;
        if (deja.has(a.id)) p.deja_classees++;
        else if (estLogoSignature({ nom: a.name ?? "", mime: a.contentType ?? "", taille: Number(a.size ?? 0), inline: !!a.isInline })) p.logos_probables++;
        else p.a_classer++;
      }
      p.mails_examines++;
    } catch { p.mails_inaccessibles++; p.mails_examines++; }
  }
  return { rattachees: rows.length, deja_classees: rows.length - aTraiter.length, a_traiter: aTraiter.length, pieces: p, ids: aTraiter.map((r) => r.id as string) };
}
