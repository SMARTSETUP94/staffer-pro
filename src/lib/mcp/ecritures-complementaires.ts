import { ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { compactResult, type McpAppContext } from "./policy";
import { argumentsHash } from "./write-policy";
import { confirmationSchema } from "./write-schemas";
import { causeJournal, PHOTO_MIMES, sansSourceFichier, type Mime } from "./fichiers";
import { devisWriteEnabled, obtenirFichier } from "./devis";

/** Écritures du connecteur hors devis_mcp_appliquer : dépôt dans les documents d'une affaire et proposition d'article au catalogue. */
export const CATEGORIES_DOCUMENT = ["brief", "plan", "visuel", "reperage", "offre_fournisseur", "devis_setup", "autre", "moodboard", "esquisse_commerciale", "logistique",
  "avant_montage", "pendant_montage", "apres_montage", "avant_demontage", "pendant_demontage", "apres_demontage", "incident"] as const;
const uuid = z.string().uuid();
export const complementSchemas = {
  documents_affaire_televerser: { affaire_id: uuid,
    fichier_base64: z.string().min(8).optional().describe("Petit fichier JPG, PNG ou PDF en base64 ; à la confirmation, renvoyer fichier_ref à la place."),
    url: z.string().url().max(2000).optional().describe("Lien https : partage OneDrive / SharePoint, staffing.setup.paris ou stockage de l'application."),
    onedrive_chemin: z.string().min(1).max(400).optional().describe("Chemin relatif sous Staffing/ du OneDrive de smart@setup.paris, ex. 9539/plan_entree.pdf."),
    onedrive_item_id: z.string().min(5).max(200).optional(), fichier_ref: z.string().regex(/^[0-9a-f]{64}$/).optional().describe("Empreinte renvoyée par l'aperçu (10 minutes)."),
    mime: z.enum(["image/jpeg", "image/png", "application/pdf"]).optional(),
    nom: z.string().trim().min(1).max(120).optional().describe("Nom lisible du document (défaut : nom du fichier OneDrive)."),
    categorie: z.enum(CATEGORIES_DOCUMENT).optional().describe("Catégorie existante des documents d'affaire (devis_setup pour un devis Set Up)."),
    source: z.string().max(200).optional().describe("Origine : mail de…, plan fourni par…"), ...confirmationSchema },
  materiaux_proposer: { devis_id: uuid.describe("Devis en cours de rédaction qui motive la proposition."),
    produit: z.string().trim().min(1).max(255), unite: z.string().trim().min(1).max(40).describe("m², ml, unité, plaque…"),
    ref: z.string().max(120).optional(), fournisseur: z.string().max(255).optional(), format_texte: z.string().max(255).optional(), epaisseur_mm: z.number().finite().min(0).optional(),
    prix_achat: z.number().finite().min(0).optional().describe("Prix d'achat HT relu sur une offre ; enregistré seulement si le compte a le droit coûts."),
    source: z.string().trim().min(1).max(200).describe("Origine du prix : offre fournisseur du…, site…, mail de…"), ...confirmationSchema },
} as const;
export type ComplementName = keyof typeof complementSchemas;

export function documentsWriteEnabled(c: McpAppContext) {
  return c.canWrite === true && c.caps.has("api.mcp.write") && c.caps.has("section.affaires") && c.writeScopes?.has("section.affaires") === true;
}
export const complementEnabled = (c: McpAppContext, name: ComplementName) => name === "documents_affaire_televerser" ? documentsWriteEnabled(c) : devisWriteEnabled(c);

async function snapshotAffaire(c: McpAppContext, affaireId: string) {
  const a = await c.db.from("affaires").select("id,numero,nom,updated_at").eq("id", affaireId).is("archived_at", null).maybeSingle();
  if (a.error || !a.data) throw new ToolError("Affaire introuvable ou accès refusé");
  return a.data as { id: string; numero: string | null; nom: string | null; updated_at: string };
}

export async function runComplement(context: McpAppContext, name: ComplementName, args: Record<string, any>) {
  let etape = "droits"; const mesure: Record<string, number | undefined> = { longueur_base64: typeof args.fichier_base64 === "string" ? args.fichier_base64.length : undefined };
  const temp = name === "documents_affaire_televerser" ? await import("./fichier-temp.server").catch(() => null) : null;
  try {
    if (!complementEnabled(context, name)) throw new ToolError(name === "documents_affaire_televerser" ? "Dépôt refusé : droit Affaires (périmètre global) requis" : "Écriture refusée : droit de rédaction des devis requis");
    const fresh = await context.db.rpc("mcp_assert_write", { _tool: name });
    if (fresh.error) throw new ToolError("Écriture MCP refusée : droits ou connexion modifiés");
    let affaireId: string, payload: Record<string, unknown>, vue: Record<string, unknown>, hashArgs: Record<string, unknown> = args;
    let depot: { path: string; bytes: Uint8Array<ArrayBuffer>; mime: Mime; sha: string; origine: string; nom: string | null; source: string | null } | null = null;
    if (name === "documents_affaire_televerser") {
      affaireId = String(args.affaire_id);
      etape = "lecture de l'affaire"; const aff = await snapshotAffaire(context, affaireId);
      etape = "contrôle du fichier"; if (temp) void temp.purgerTemp(context.userId);
      const f = await obtenirFichier(args, { db: context.db, affaireId, userId: context.userId, temp: temp ? { lire: temp.lireTemp } : undefined }, { document: false });
      mesure.taille_octets = f.bytes.length;
      const path = `${affaireId}/mcp/${f.sha}.${PHOTO_MIMES[f.mime]}`;
      depot = { path, bytes: f.bytes, mime: f.mime, sha: f.sha, origine: f.origine, nom: f.nom, source: f.source };
      const nom = (args.nom ?? f.nom ?? null) as string | null;
      payload = { affaire_id: affaireId, storage_path: path, mime: f.mime, size_bytes: f.bytes.length, empreinte_sha256: f.sha, nom: nom ? nom.slice(0, 120) : null, categorie: args.categorie ?? null, source: args.source ?? f.source };
      hashArgs = sansSourceFichier(args, f.sha);
      const ex = await context.db.from("affaire_documents").select("id,filename").eq("affaire_id", affaireId).eq("empreinte_sha256", f.sha).is("deleted_at", null).limit(1);
      vue = { affaire: { id: aff.id, numero: aff.numero, nom: aff.nom }, document: { nom: payload.nom, type: f.mime, taille_octets: f.bytes.length, categorie: payload.categorie, source: payload.source },
        doublon: ex.data?.[0] ? { document_id: ex.data[0].id, nom: ex.data[0].filename, consigne: "Fichier identique déjà présent : la confirmation renverra ce document sans doublon." } : null };
      (payload as any)._snapshot = aff.updated_at;
    } else {
      etape = "lecture du devis";
      const etat = await context.db.rpc("devis_mcp_etat", { _devis_id: args.devis_id });
      if (etat.error || !etat.data) throw new ToolError("Devis introuvable ou accès refusé");
      affaireId = String((etat.data as any).affaire_id);
      const aff = await snapshotAffaire(context, affaireId);
      const { confirmation_id: _c, ...a } = args;
      payload = { ...a, _snapshot: aff.updated_at };
      const proches = await context.db.rpc("materiaux_rechercher", { _q: String(args.produit), _familles: null, _fournisseurs: null, _epaisseur: null, _recent_seulement: false, _tri: "pertinence", _limit: 5 });
      const couts = context.caps.has("devis.couts");
      vue = { proposition: { produit: args.produit, unite: args.unite, ref: args.ref ?? null, fournisseur: args.fournisseur ?? null, prix_achat: couts ? args.prix_achat ?? null : undefined, source: args.source },
        statut_cree: "propose (à valider par un admin dans Prix proposés ; jamais un article actif)",
        ...(args.prix_achat != null && !couts ? { avertissement: "Prix d'achat non enregistré : le compte n'a pas le droit coûts." } : {}),
        articles_proches: ((proches.data ?? []) as any[]).map(m => ({ id: m.id, produit: m.produit, unite: m.unite, fournisseur: m.fournisseur ?? null })) };
    }
    const snapshot = String((payload as any)._snapshot); delete (payload as any)._snapshot;
    const hash = await argumentsHash(hashArgs);
    if (typeof args.confirmation_id === "string") {
      let depose = false;
      if (depot && !(vue as any).doublon) {
        etape = "dépôt du fichier";
        const up = await context.db.storage.from("affaires-photos").upload(depot.path, depot.bytes, { contentType: depot.mime, upsert: false });
        if (up.error && !/exist|duplicate/i.test(up.error.message)) throw new ToolError(`Dépôt du fichier refusé : ${up.error.message}`.slice(0, 250));
        depose = !up.error;
      }
      etape = "confirmation";
      const { data, error } = await context.db.rpc("mcp_execute_write_locked", { _confirmation_id: args.confirmation_id, _tool: name, _arguments_hash: hash, _payload: payload as never, _diff: {} });
      if (error) throw new ToolError(`Confirmation indisponible : ${error.message}`.slice(0, 250));
      const out = data as Record<string, any>;
      if (depot && depose && (out?.error || (out?.doublon && temp))) await temp?.retirerDocumentOrphelin(depot.path);
      if (depot && !out?.error && depot.origine === "temp" && temp) await temp.retirerTemp(context.userId, depot.sha, depot.mime);
      return { ...compactResult(out), ...(out?.error ? { isError: true } : {}) };
    }
    let fichier_ref: string | undefined;
    if (depot && depot.origine === "direct" && temp) { etape = "zone temporaire"; fichier_ref = await temp.deposerTemp(context.userId, depot.bytes, depot.mime, { source: depot.source, nom: depot.nom }); }
    etape = "aperçu";
    const { data, error } = await context.db.rpc("mcp_write_preview", { _tool: name, _arguments_hash: hash, _payload: payload as never, _affaire_id: affaireId, _etape_id: null as never, _snapshot: snapshot, _diff: {} });
    if (error) throw new ToolError(`Aperçu refusé : ${error.message}`.slice(0, 250));
    return compactResult({ statut: "preview", ...vue, ...(data as object), ...(fichier_ref ? { fichier_ref, consigne_fichier: "À la confirmation, remplacer la source du fichier par fichier_ref ; les autres arguments restent identiques." } : {}),
      consigne: "Montrer cet aperçu à l'utilisateur, puis renvoyer les mêmes arguments avec confirmation_id sous 10 minutes." });
  } catch (error) {
    const cause = causeJournal(etape, error, mesure);
    if (!(error instanceof ToolError)) console.error(`[mcp ${name}] ${cause.etape} : ${cause.erreur_type} ${cause.erreur_message}`);
    const audit = await context.db.from("mcp_audit_log").insert({ user_id: context.userId, client_id: context.clientId, tool: name, statut: "refused", arguments: cause });
    if (audit.error) throw new ToolError("Journal indisponible : écriture interrompue");
    return { ...compactResult({ error: error instanceof ToolError ? error.message : `Erreur interne pendant l'étape « ${etape} » (${cause.erreur_type})`, statut: "refused" }), isError: true };
  }
}
