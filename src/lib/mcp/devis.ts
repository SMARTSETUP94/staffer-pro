import { ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { compactResult, safeAuditArguments, type McpAppContext } from "./policy";
import { argumentsHash } from "./write-policy";
import { confirmationSchema } from "./write-schemas";
import { dateSchema } from "./schemas";
import { extrait, noteApres } from "@/lib/devis/note";

/** Écritures devis autorisées pour Claude. Toute autre action devis reste dans l'application. */
export const DEVIS_WRITE_TOOLS = ["devis_creer_brouillon", "devis_remplir", "devis_modifier_entete", "devis_ajouter_photo", "devis_nouvelle_version", "devis_soumettre", "devis_enregistrer_transfert"] as const;
export type DevisWriteName = typeof DEVIS_WRITE_TOOLS[number];
export const DEVIS_READ_TOOLS = ["devis_lister", "devis_lire", "devis_referentiel", "materiaux_rechercher", "devis_charge_be", "devis_exporter_pdf", "devis_exporter_progbat", "devis_proposer_photos", "devis_note_version"] as const;
export type DevisReadName = typeof DEVIS_READ_TOOLS[number];
export const DEVIS_READ_CAPS: Record<DevisReadName, string> = {
  devis_lister: "devis.view", devis_lire: "devis.view", devis_referentiel: "devis.rediger", materiaux_rechercher: "devis.rediger", devis_charge_be: "devis.view", devis_exporter_pdf: "devis.view", devis_exporter_progbat: "devis.view", devis_proposer_photos: "devis.rediger", devis_note_version: "devis.view",
};
export const LOT_MAX = 300;
export const PHOTO_MAX_OCTETS = 10 * 1024 * 1024;
export const PHOTO_MIMES = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" } as const;

const uuid = z.string().uuid();
const num = z.number().finite();
const mode = z.enum(["autonomie", "conversation"]).describe("autonomie = tâche planifiée ou initiative de Claude : refusé si un humain a repris le brouillon. conversation = l'utilisateur demande explicitement dans la conversation de compléter ce devis.");
const heure = z.object({
  id: uuid.optional().describe("Ligne d'heures existante de cette ligne à mettre à jour (sinon : même poste + niveau déjà présent = mise à jour, pas de doublon)."),
  poste: z.string().min(1).max(40).optional().describe("Code poste : suivi_projet, plans_bem, construction, metallerie, peinture, cnc, laser, impression_uv, impressions_souples, tapisserie, montage, logistique."),
  niveau: z.string().max(40).optional().describe("standard ; pour montage : chef ou monteur."),
  heures: num.min(0).max(100000), taux_vente: num.min(0).optional().describe("Omettre pour le taux de la grille."),
  montant_force: num.optional().describe("Montant exact de la ligne (taux affiché dérivé)."), par_unite: z.boolean().optional(),
}).strict().refine(h => h.id || h.poste, "poste obligatoire (ou id d'une ligne d'heures existante)");
const materiau = z.object({
  materiau_id: uuid.optional().describe("Id catalogue (materiaux_rechercher). Sinon designation + prix_achat."),
  designation: z.string().max(255).optional(), fournisseur: z.string().max(255).optional(), ref: z.string().max(120).optional(), unite: z.string().max(40).optional(),
  quantite: num.min(0), prix_achat: num.min(0).optional(), coefficient: num.min(0).max(20).optional(),
}).strict().refine(m => m.materiau_id || m.designation, "materiau_id ou designation obligatoire");
const libre = z.object({
  categorie: z.enum(["achat", "sous_traitance", "location", "forfait"]).optional(), forfait_cle: z.string().max(60).optional(),
  designation: z.string().max(255).optional(), unite: z.string().max(40).optional(), quantite: num.optional(),
  prix_achat: num.optional(), prix_forfait: num.optional().describe("Prix de vente direct (négatif pour une régularisation)."),
  coefficient: num.min(0).max(20).optional(), par_unite: z.boolean().optional(), heures_info: num.optional(), poste_info: z.string().max(40).optional(),
}).strict();
const element = z.object({
  ref: z.string().min(1).max(40).optional().describe("Référence locale pour rattacher des enfants via parent_ref."),
  parent_ref: z.string().min(1).max(40).optional(), parent_id: uuid.optional(),
  ligne_id: uuid.optional().describe("Ligne existante (ex. objet du modèle) à compléter, sans la recréer."),
  type: z.enum(["zone", "objet", "commentaire", "chapitre_suivi", "chapitre_pose", "chapitre_depose", "option"]).optional(),
  libelle: z.string().max(500).optional(), quantite: num.min(0).optional(), descriptif_client: z.string().max(5000).optional(),
  longueur_mm: num.optional(), largeur_mm: num.optional(), hauteur_mm: num.optional(), finition: z.string().max(255).optional(),
  texte: z.string().max(5000).optional(), interne: z.boolean().optional(), incluse: z.boolean().optional().describe("Option : incluse dans le total (défaut non)."),
  heures: z.array(heure).max(LOT_MAX).optional(), materiaux: z.array(materiau).max(LOT_MAX).optional(), libres: z.array(libre).max(LOT_MAX).optional(),
}).strict().refine(e => e.type || e.ligne_id, "type ou ligne_id obligatoire");
export const tailleLot = (lignes: z.infer<typeof element>[], ops = 0) => ops + lignes.reduce((n, e) => n + 1 + (e.heures?.length ?? 0) + (e.materiaux?.length ?? 0) + (e.libres?.length ?? 0), 0);

const champsLigne = z.object({
  libelle: z.string().max(500).optional(), quantite: num.min(0).optional(), descriptif_client: z.string().max(5000).nullable().optional(),
  longueur_mm: num.nullable().optional(), largeur_mm: num.nullable().optional(), hauteur_mm: num.nullable().optional(), finition: z.string().max(255).nullable().optional(),
  texte: z.string().max(5000).nullable().optional(), interne: z.boolean().optional(), incluse: z.boolean().optional().describe("Option incluse dans le total."),
}).strict();
const champsHeure = z.object({ heures: num.min(0).max(100000).optional(), niveau: z.string().max(40).optional(), taux_vente: num.min(0).optional(), montant_force: num.nullable().optional(), par_unite: z.boolean().optional() }).strict();
const champsMateriau = z.object({ quantite: num.min(0).optional(), coefficient: num.min(0).max(20).optional(), materiau_id: uuid.optional().describe("Autre référence catalogue : l'ancienne ligne part à la corbeille.") }).strict();
const champsLibre = z.object({ quantite: num.optional(), prix_forfait: num.nullable().optional(), prix_achat: num.nullable().optional(), designation: z.string().max(255).optional(), coefficient: num.min(0).max(20).optional(), unite: z.string().max(40).optional(), heures_info: num.nullable().optional() }).strict();
const nonVide = (c: object) => Object.keys(c).length > 0;
const modification = z.discriminatedUnion("cible", [
  z.object({ cible: z.literal("ligne"), id: uuid, champs: champsLigne.refine(nonVide, "Modification vide") }).strict(),
  z.object({ cible: z.literal("heure"), id: uuid, champs: champsHeure.refine(nonVide, "Modification vide") }).strict(),
  z.object({ cible: z.literal("materiau"), id: uuid, champs: champsMateriau.refine(nonVide, "Modification vide") }).strict(),
  z.object({ cible: z.literal("libre"), id: uuid, champs: champsLibre.refine(nonVide, "Modification vide") }).strict(),
]);
const suppression = z.object({ cible: z.enum(["ligne", "heure", "materiau", "libre"]), id: uuid }).strict();

export const devisSchemas = {
  devis_lister: { affaire_id: uuid.optional(), recherche: z.string().max(120).optional(), statuts: z.array(z.enum(["brouillon", "a_valider", "valide", "transfere", "signe", "refuse"])).max(6).optional(), limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).default(0) },
  devis_lire: { devis_id: uuid },
  devis_note_version: { devis_id: uuid, version_id: uuid.describe("Identifiant d'une version lue dans note_historique de devis_lire.") },
  devis_proposer_photos: { devis_id: uuid.describe("Devis dont les zones et objets reçoivent des propositions d'images de la boîte de l'affaire.") },
  devis_referentiel: {},
  materiaux_rechercher: { q: z.string().min(1).max(200), familles: z.array(z.string().max(80)).max(20).optional(), fournisseurs: z.array(uuid).max(20).optional(), epaisseur: num.min(0).optional(), recent_seulement: z.boolean().default(false), limit: z.number().int().min(1).max(50).default(20) },
  devis_charge_be: { affaire_ids: z.array(uuid).min(1).max(50) },
  devis_exporter_pdf: { devis_id: uuid, niveau: z.enum(["detaille", "synthetique"]).default("detaille").describe("detaille : prix par objet ; synthetique : total par zone et chapitre."),
    regenerer: z.boolean().default(false).describe("true : générer un nouveau PDF même si un export de la version en cours existe.") },
  devis_exporter_progbat: { devis_id: uuid.describe("Devis validé par un humain dans Staffing, pas encore transféré."),
    mode: z.enum(["autonomie", "conversation"]).describe("conversation obligatoire : transfert ProGBat uniquement en session avec l'utilisateur ; autonomie refusée.") },
  devis_creer_brouillon: { affaire_id: uuid, modele_id: z.union([uuid, z.literal("vierge")]).optional().describe("Omettre = modèle par défaut ; « vierge » = sans modèle."), cle_externe: z.string().min(1).max(255).optional(), note: z.string().max(8000).optional().describe("Hypothèses à confirmer, affichées en tête de l'éditeur."), mode, ...confirmationSchema },
  devis_remplir: { devis_id: uuid,
    lignes: z.array(element).max(LOT_MAX).refine(l => tailleLot(l) <= LOT_MAX, `${LOT_MAX} lignes maximum par appel (heures, matériaux et lignes libres comprises) : découper en plusieurs appels`).optional().describe("Ajouts ; avec ligne_id, complète la ligne existante (libellé, quantité, dimensions, descriptif appliqués)."),
    modifications: z.array(modification).max(LOT_MAX).optional().describe("Modifier des éléments existants du brouillon (id lus avec devis_lire)."),
    suppressions: z.array(suppression).max(LOT_MAX).optional().describe("Suppression logique (corbeille restaurable par un humain). Le devis entier ne se supprime pas."),
    cle_externe: z.string().min(1).max(255).optional(), mode, ...confirmationSchema },
  devis_modifier_entete: { devis_id: uuid, champs: z.object({
    client_id: uuid.nullable().optional(), contact_id: uuid.nullable().optional(), client_final_id: uuid.nullable().optional(), libelle: z.string().max(500).optional(),
    date_devis: dateSchema.optional(), date_validite: dateSchema.nullable().optional(), validite_jours: z.number().int().min(1).max(365).optional(),
    date_visite_technique: dateSchema.nullable().optional(), date_montage: dateSchema.nullable().optional(), date_evenement_debut: dateSchema.nullable().optional(), date_evenement_fin: dateSchema.nullable().optional(), date_demontage: dateSchema.nullable().optional(),
    remise: z.object({ mode: z.enum(["aucune", "montant", "pct", "net_cible"]), valeur: num.min(0).optional() }).strict().optional(),
    note: z.object({ mode: z.enum(["remplacer", "ajouter"]).describe("ajouter : en fin de note, après une ligne « — Mise à jour du JJ/MM/AAAA (Claude) — »."), texte: z.string().min(1).max(8000) }).strict().optional().describe("Note / hypothèses en tête de l'éditeur (8 000 caractères au maximum au total)."),
    note_mcp_coches: z.array(z.string().min(1).max(2000)).max(200).optional().describe("Points de la note marqués comme traités (texte exact du point)."),
  }).strict().refine(p => Object.keys(p).length > 0, "Modification vide"), mode, ...confirmationSchema },
  devis_ajouter_photo: { devis_id: uuid, ligne_id: uuid.describe("Objet du devis."),
    document_id: uuid.optional().describe("Image JPG/PNG de la boîte de documents de l'affaire du devis (voir documents_affaire) : copiée dans le devis."), fichier_base64: z.string().min(8).optional().describe("Petit fichier uniquement : contenu JPG, PNG ou PDF en base64. Pour une vraie photo, préférer url."),
    url: z.string().url().max(2000).optional().describe("Lien https récupéré par le serveur : partage OneDrive / SharePoint, staffing.setup.paris ou stockage de l'application. 10 Mo maximum."),
    mime: z.enum(["image/jpeg", "image/png", "application/pdf"]).optional().describe("Facultatif : détecté d'après le contenu."), legende: z.string().max(300).optional(), source: z.string().max(200).optional().describe("Origine : pièce jointe du mail de…, plan, référence…"), visible_client: z.boolean().default(false), mode, ...confirmationSchema },
  devis_nouvelle_version: { devis_id: uuid.describe("Devis envoyé / validé à reprendre ; l'original n'est jamais modifié."), note: z.string().max(8000).optional(), mode, ...confirmationSchema },
  devis_enregistrer_transfert: { devis_id: uuid,
    numero_progbat: z.string().trim().toUpperCase().regex(/^(S\d{6}|D-\d{6}-\d{4})$/, "Numéro ProGBat : S + 6 chiffres (brouillon) ou D-AAAAMM-NNNN (finalisé)").describe("S003800 juste après l'import (brouillon ProGBat) ; D-AAAAMM-NNNN une fois le devis finalisé par un humain."),
    total_progbat: num.min(0).describe("Total net HT relu dans ProGBat, en euros."),
    motif: z.string().trim().min(1).max(1000).optional().describe("Obligatoire si le total ProGBat diffère du net HT Staffing au centime."),
    mode: z.enum(["autonomie", "conversation"]).describe("conversation obligatoire, avec l'accord explicite de l'utilisateur ; autonomie refusée."), ...confirmationSchema },
  devis_soumettre: { devis_id: uuid, note: z.string().max(8000).describe("Ce qui reste à confirmer par le chargé d'affaires."), mode, ...confirmationSchema },
} as const;

export function devisReadEnabled(context: McpAppContext, name: DevisReadName) { return context.caps.has(DEVIS_READ_CAPS[name]); }
export function devisWriteEnabled(context: McpAppContext) {
  return context.canWrite === true && context.caps.has("api.mcp.write") && context.caps.has("devis.rediger") && context.writeScopes?.has("devis.rediger") === true;
}

async function flagDevis(context: McpAppContext) {
  const { data, error } = await context.db.rpc("is_feature_flag_enabled", { _flag_key: "devis_staffing_v1" });
  if (error || data !== true) throw new ToolError("Module devis non activé pour ce compte");
}
const COUTS_MATERIAUX = ["prix_achat_net", "prix_m2", "prix_ml"] as const;
export function sansCouts<T extends Record<string, unknown>>(row: T, couts: boolean): T {
  if (couts) return row;
  const copy: Record<string, unknown> = { ...row };
  for (const k of COUTS_MATERIAUX) delete copy[k];
  return copy as T;
}
const arrondi1 = (v: unknown) => v == null ? null : Math.round(Number(v) * 10) / 10;
const TOTAUX = ["total_ht", "options_ht", "remise", "net_ht", "tva_pct", "tva", "ttc", "heures_metier", "marge", "marge_pct", "cout_total", "decomposition", "couts_manquants"] as const;
export function resumeTotaux(calcul: unknown) {
  if (!calcul || typeof calcul !== "object") return null;
  const c = calcul as Record<string, unknown>;
  return { ...Object.fromEntries(TOTAUX.filter(k => k in c).map(k => [k, c[k] as never])), ...margeFiable(c) };
}
/** Marge fiable seulement si aucun coût de revient ne manque (aucun coût n'est inventé). */
export function margeFiable(c: Record<string, unknown>) {
  if (!Array.isArray(c.couts_manquants)) return {};
  const m = c.couts_manquants as { libelle?: string; heures?: number | null }[];
  return m.length === 0 ? { marge_fiable: true } : {
    marge_fiable: false,
    alerte_marge: "marge incomplète : coûts manquants sur " + m.map(x => x.heures != null ? `${String(x.libelle ?? "?").toLowerCase()} (${x.heures} h)` : String(x.libelle ?? "?").toLowerCase()).join(", "),
  };
}

export async function readDevis(context: McpAppContext, name: DevisReadName, args: Record<string, any>) {
  const start = Date.now(); let count = 0, status = "ok", result;
  try {
    if (!devisReadEnabled(context, name)) { status = "refuse"; throw new ToolError("Droit métier insuffisant"); }
    await flagDevis(context);
    const couts = context.caps.has("devis.couts");
    let data: Record<string, unknown>;
    if (name === "devis_lister") {
      let rows: any[];
      if (args.affaire_id) {
        const r = await context.db.rpc("devis_lister", { _affaire_id: args.affaire_id });
        if (r.error) throw new ToolError("Liste des devis indisponible");
        rows = (r.data ?? []) as any[];
        const nets = await Promise.all(rows.map(d => context.db.rpc("devis_calculer", { _devis_id: d.id })));
        rows = rows.map((d, i) => ({ ...d, net_ht: (nets[i].data as any)?.net_ht ?? null }));
      } else {
        const r = await context.db.rpc("devis_lister_global", { _recherche: args.recherche ?? null, _statuts: args.statuts ?? null, _charge_affaires_id: null, _limit: args.limit ?? 25, _offset: args.offset ?? 0 });
        if (r.error) throw new ToolError("Liste des devis indisponible");
        rows = (r.data ?? []) as any[];
      }
      const ids = rows.map(d => d.id);
      const extra = ids.length ? await context.db.from("devis").select("id,date_envoi,cree_par_mcp,modifie_par_humain_le").in("id", ids) : { data: [], error: null };
      if (extra.error) throw new ToolError("Liste des devis indisponible");
      const byId = new Map((extra.data ?? []).map((e: any) => [e.id, e]));
      data = { rows: rows.map(d => ({ ...d, ...(byId.get(d.id) ?? {}) })) };
    } else if (name === "devis_lire") {
      const r = await context.db.rpc("devis_lire", { _devis_id: args.devis_id });
      if (r.error || !r.data) throw new ToolError("Devis introuvable ou accès refusé");
      const meta = await context.db.from("devis").select("cree_par_mcp,modifie_par_humain_le,note_mcp,cle_externe").eq("id", args.devis_id).maybeSingle();
      const lu = r.data as Record<string, any>;
      if (lu.calcul && typeof lu.calcul === "object") lu.calcul = { ...lu.calcul, ...margeFiable(lu.calcul) };
      const hist = await context.db.from("devis_textes_historique").select("id,source,auteur_id,cree_le,apres").eq("devis_id", args.devis_id).eq("cible", "note").order("cree_le", { ascending: false }).limit(5);
      const note_historique = (hist.data ?? []).map((h: any) => ({ version_id: h.id as string, source: h.source === "mcp" ? "Claude (MCP)" : h.source as string, auteur_id: h.auteur_id as string | null, date: h.cree_le as string, extrait: extrait(h.apres) }));
      data = { rows: [1], devis: lu as never, redaction_claude: (meta.data ?? null) as never, note_historique, note_historique_consigne: "Extraits seulement : texte complet d'une version avec devis_note_version." };
    } else if (name === "devis_note_version") {
      const r = await context.db.from("devis_textes_historique").select("id,cible,source,cree_le,avant,apres").eq("id", args.version_id).eq("devis_id", args.devis_id).eq("cible", "note").maybeSingle();
      if (r.error || !r.data) throw new ToolError("Version introuvable ou accès refusé");
      const h = r.data as any;
      data = { rows: [1], version_id: h.id, source: h.source === "mcp" ? "Claude (MCP)" : h.source, date: h.cree_le, texte: h.apres, texte_precedent: h.avant };
    } else if (name === "devis_referentiel") {
      const [taux, params, modeles, defaut] = await Promise.all([
        context.db.rpc("devis_taux_lister"),
        context.db.from("v_devis_parametres_courants").select("*"),
        context.db.rpc("devis_modeles_lister", { _actifs_seulement: true }),
        context.db.rpc("devis_modele_defaut_id"),
      ]);
      if (taux.error || params.error || modeles.error || defaut.error) throw new ToolError("Référentiel devis indisponible");
      const parametres = ((params.data ?? []) as any[]).filter(p => couts || !String(p.cle ?? "").startsWith("cout_"));
      const tauxRows = ((taux.data ?? []) as any[]).filter(t => t.actif).map(t => couts ? t : { ...t, cout_revient: undefined });
      data = { rows: tauxRows, taux: tauxRows, parametres, modeles: modeles.data ?? [], modele_defaut_id: defaut.data ?? null };
    } else if (name === "materiaux_rechercher") {
      const r = await context.db.rpc("materiaux_rechercher", { _q: args.q, _familles: args.familles ?? null, _fournisseurs: args.fournisseurs ?? null, _epaisseur: args.epaisseur ?? null, _recent_seulement: args.recent_seulement ?? false, _tri: "pertinence", _limit: args.limit ?? 20 });
      if (r.error) throw new ToolError("Recherche matériaux indisponible");
      data = { rows: ((r.data ?? []) as any[]).map(m => sansCouts(m, couts)) };
    } else if (name === "devis_exporter_progbat") {
      if (args.mode !== "conversation") { status = "refuse"; throw new ToolError("Export ProGBat refusé en autonomie : uniquement en conversation avec l'utilisateur"); }
      data = { rows: [1], ...(await exporterProgbatMcp(context, args.devis_id)) };
    } else if (name === "devis_proposer_photos") {
      const { proposerPhotos } = await import("@/lib/devis/images-ia.server");
      let r;
      try { r = await proposerPhotos(context.db, context.userId, args.devis_id, "mcp"); }
      catch (e) { throw new ToolError(e instanceof Error ? e.message : "Proposition indisponible"); }
      data = { rows: r.propositions, proposition_id: r.id, propositions: r.propositions.map(p => ({ ligne_id: p.ligne_id, zone_ou_objet: p.ligne_libelle, document_id: p.document_id, document: p.document_nom, confiance: p.confiance, justification: p.justification, visible_client: p.visible_client, legende: p.legende })),
        pdf_sans_rendu_de_page: r.sans_rendu, cout_eur: r.cout_eur, appels_ia: r.appels,
        consigne: "Lecture seule : rien n'est ajouté. Pour ajouter une image, devis_ajouter_photo avec document_id (aperçu puis confirmation)." };
    } else if (name === "devis_exporter_pdf") {
      data = { rows: [1], ...(await exporterPdfMcp(context, args.devis_id, args.niveau ?? "detaille", args.regenerer === true)) };
    } else {
      const r = await context.db.rpc("devis_charge_be", { _affaire_ids: args.affaire_ids });
      if (r.error) throw new ToolError("Charge BE indisponible");
      data = { rows: ((r.data ?? []) as any[]).map(c => ({ ...c, jours_be: arrondi1(c.jours_be), heures_be: arrondi1(c.heures_be) })) };
    }
    count = (data.rows as unknown[]).length;
    if (name === "devis_lire" || name === "devis_proposer_photos" || name === "devis_exporter_pdf" || name === "devis_exporter_progbat") { const { rows: _r, ...rest } = data; result = compactResult(rest); }
    else result = compactResult(data);
  } catch (error) {
    if (status !== "refuse") status = "erreur";
    result = { ...compactResult({ error: error instanceof ToolError ? error.message : "Lecture indisponible" }), isError: true };
  }
  const audit = await context.db.from("mcp_audit_log").insert({ user_id: context.userId, client_id: context.clientId, tool: name, arguments: safeAuditArguments(args), nb_lignes: count, duree_ms: Date.now() - start, statut: status });
  if (audit.error) throw new ToolError("Journal indisponible : lecture interrompue");
  return result;
}

type Mime = keyof typeof PHOTO_MIMES;
const trop = (max: number) => new ToolError(`Fichier trop volumineux (${max / 1024 / 1024} Mo maximum)`);
/** Type réel d'après la signature du contenu (JPG, PNG, PDF), sinon null. */
export function detecterType(bytes: Uint8Array): Mime | null {
  const sig = (s: number[]) => s.every((b, i) => bytes[i] === b);
  if (sig([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (sig([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (sig([0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  return null;
}
function controlerOctets(bytes: Uint8Array<ArrayBuffer>, mime: Mime | undefined, max: number) {
  if (bytes.length > max) throw trop(max);
  const reel = detecterType(bytes);
  if (!reel) throw new ToolError("Type de fichier refusé (JPG, PNG ou PDF uniquement, d'après le contenu)");
  if (mime && mime !== reel) throw new ToolError("Le contenu ne correspond pas au type annoncé (JPG, PNG ou PDF uniquement)");
  return { bytes, mime: reel };
}
/** Décode et contrôle un fichier : type réel (signature) et taille. */
export function controlerFichier(base64: string, mime?: Mime, max = PHOTO_MAX_OCTETS) {
  const clean = base64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) throw new ToolError("Contenu base64 invalide");
  if (Math.floor(clean.length * 3 / 4) > max + 4) throw trop(max);
  const bin = atob(clean); const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return controlerOctets(bytes, mime, max).bytes;
}

/** Hôtes d'où le serveur accepte de récupérer une image (redirections comprises). */
const HOTES_PHOTO = [/\.sharepoint\.com$/, /(^|\.)onedrive\.live\.com$/, /^1drv\.ms$/, /^staffing\.setup\.paris$/, /^znwffztmdgsshuvvzsvq\.supabase\.co$/];
export function hoteAutorise(u: URL) {
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const h = u.hostname.toLowerCase();
  // aucune adresse IP littérale (v4 ou v6) : seules les noms de la liste passent, ce qui exclut les réseaux privés
  if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return false;
  return HOTES_PHOTO.some(r => r.test(h));
}
/** Récupère un fichier par URL https côté serveur : hôtes autorisés à chaque redirection, 10 Mo maximum, type réel contrôlé. */
export async function telechargerFichier(url: string, mime?: Mime, max = PHOTO_MAX_OCTETS, fetcher: typeof fetch = fetch) {
  let u: URL;
  try { u = new URL(url); } catch { throw new ToolError("URL invalide"); }
  if (/\.sharepoint\.com$/i.test(u.hostname) && !u.searchParams.has("download")) u.searchParams.set("download", "1");
  for (let saut = 0; saut <= 5; saut++) {
    if (!hoteAutorise(u)) throw new ToolError(`Hôte non autorisé : ${u.hostname} (OneDrive, SharePoint, staffing.setup.paris ou stockage de l'application, en https)`);
    const r = await fetcher(u.toString(), { redirect: "manual", headers: { accept: "image/jpeg,image/png,application/pdf,*/*;q=0.1" } });
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.get("location");
      if (!loc) throw new ToolError("Redirection invalide");
      u = new URL(loc, u); continue;
    }
    if (!r.ok || !r.body) throw new ToolError(`Téléchargement refusé (HTTP ${r.status}) : vérifier que le lien est partagé en lecture`);
    if (Number(r.headers.get("content-length") ?? 0) > max) throw trop(max);
    const reader = r.body.getReader(); const parts: Uint8Array[] = []; let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > max) { await reader.cancel(); throw trop(max); }
      parts.push(value);
    }
    const bytes = new Uint8Array(new ArrayBuffer(n)); let o = 0;
    for (const p of parts) { bytes.set(p, o); o += p.length; }
    return { ...controlerOctets(bytes, mime, max), hote: u.hostname };
  }
  throw new ToolError("Trop de redirections");
}
async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, "0")).join("");
}

/** Construit les arguments métier transmis à la base (jamais le fichier lui-même). */
export async function devisPayload(name: DevisWriteName, args: Record<string, any>, ctx?: { db: any; affaireId: string }): Promise<{ payload: Record<string, unknown>; fichier?: { path: string; bytes: Uint8Array<ArrayBuffer>; mime: string } }> {
  const { confirmation_id: _c, ...a } = args;
  if (name === "devis_ajouter_photo") {
    if ([a.fichier_base64, a.url, a.document_id].filter(Boolean).length !== 1) throw new ToolError("Fournir soit url (recommandé), soit document_id (boîte de l'affaire), soit fichier_base64 (petits fichiers)");
    let bytes: Uint8Array<ArrayBuffer>, mime: Mime, source = a.source ?? null;
    if (a.document_id) {
      const doc = await lireDocumentAffaire(ctx, String(a.document_id));
      bytes = doc.bytes; mime = doc.mime; source = source ?? `document de l'affaire ${doc.nom}`.slice(0, 200);
      const path = `${a.devis_id}/mcp/${await sha256(bytes)}.${PHOTO_MIMES[mime]}`;
      return { payload: { mode: a.mode, devis_id: a.devis_id, ligne_id: a.ligne_id, storage_path: path, mime, size_bytes: bytes.length, legende: a.legende ?? null, source, visible_client: a.visible_client ?? false, source_document_id: a.document_id }, fichier: { path, bytes, mime } };
    }
    if (a.url) { const t = await telechargerFichier(String(a.url), a.mime); bytes = t.bytes; mime = t.mime; source = source ?? `lien ${t.hote}`; }
    else { bytes = controlerFichier(String(a.fichier_base64), a.mime); mime = detecterType(bytes) as Mime; }
    const path = `${a.devis_id}/mcp/${await sha256(bytes)}.${PHOTO_MIMES[mime]}`;
    return { payload: { mode: a.mode, devis_id: a.devis_id, ligne_id: a.ligne_id, storage_path: path, mime, size_bytes: bytes.length, legende: a.legende ?? null, source, visible_client: a.visible_client ?? false }, fichier: { path, bytes, mime } };
  }
  if (name === "devis_remplir") {
    const n = tailleLot(a.lignes ?? [], (a.modifications?.length ?? 0) + (a.suppressions?.length ?? 0));
    if (n === 0) throw new ToolError("Lot vide : fournir lignes, modifications ou suppressions");
    if (n > LOT_MAX) throw new ToolError(`${LOT_MAX} lignes maximum par appel (ajouts, modifications et suppressions comprises) : découper en plusieurs appels`);
  }
  return { payload: a };
}

function apercu(sim: Record<string, any>) {
  const av = sim.compte_avant ?? {}, ap = sim.compte_apres ?? {};
  const ajouts = Object.fromEntries(Object.keys(ap).map(k => [k, Number(ap[k] ?? 0) - Number(av[k] ?? 0)]));
  return { totaux_avant: resumeTotaux(sim.avant), totaux_apres: resumeTotaux(sim.apres), variation_nombre: ajouts, ecarts_taux: sim.ecarts_taux ?? [], resultat: sim.resultat ?? null };
}

const CHAMPS_AVANT: Record<string, string[]> = {
  ligne: ["type", "libelle", "quantite", "descriptif_client", "longueur_mm", "largeur_mm", "hauteur_mm", "finition", "texte", "interne", "option_incluse"],
  heure: ["ligne_id", "poste_libelle", "niveau", "heures", "taux_vente", "montant_force", "par_unite"],
  materiau: ["ligne_id", "designation", "quantite", "coefficient", "prix_vente"],
  libre: ["ligne_id", "designation", "quantite", "prix_forfait", "prix_achat", "prix_vente"],
};
const COLLECTION: Record<string, string> = { ligne: "lignes", heure: "heures", materiau: "materiaux", libre: "libres" };
/** Avant / après des éléments visés (valeurs lues avec les droits de l'appelant : coûts masqués sans devis.couts). */
export function elementsVises(lu: Record<string, any> | null, args: Record<string, any>) {
  const trouve = (cible: string, id: string) => {
    const row = ((lu?.[COLLECTION[cible]] ?? []) as any[]).find(r => r.id === id);
    return row ? Object.fromEntries(CHAMPS_AVANT[cible].filter(k => k in row).map(k => [k, row[k]])) : null;
  };
  return [
    ...((args.modifications ?? []) as any[]).map(m => ({ action: "modifier", cible: m.cible, id: m.id, avant: trouve(m.cible, m.id), apres: m.champs })),
    ...((args.suppressions ?? []) as any[]).map(s => ({ action: "supprimer", cible: s.cible, id: s.id, avant: trouve(s.cible, s.id), apres: null })),
    ...((args.lignes ?? []) as any[]).filter(e => e.ligne_id).map(e => {
      const { ligne_id, heures, materiaux, libres, ref: _r, parent_ref: _p, parent_id: _q, type: _t, ...champs } = e;
      return { action: "completer", cible: "ligne", id: ligne_id, avant: trouve("ligne", ligne_id), apres: champs, ajouts: { heures: heures?.length ?? 0, materiaux: materiaux?.length ?? 0, libres: libres?.length ?? 0 } };
    }),
  ];
}

export async function runDevisWrite(context: McpAppContext, name: DevisWriteName, args: Record<string, any>) {
  try {
    if (!devisWriteEnabled(context)) throw new ToolError("Écriture devis refusée : droit de rédaction requis");
    if (name === "devis_enregistrer_transfert" && args.mode !== "conversation") throw new ToolError("Transfert ProGBat refusé en autonomie : uniquement en conversation, avec l'accord explicite de l'utilisateur");
    const fresh = await context.db.rpc("mcp_assert_write", { _tool: name });
    if (fresh.error) throw new ToolError(fresh.error.message?.includes("devis non activé") ? "Module devis non activé pour ce compte" : "Écriture MCP refusée : droits ou connexion modifiés");
    let affaireId: string;
    if (name === "devis_creer_brouillon") affaireId = String(args.affaire_id);
    else {
      const etat = await context.db.rpc("devis_mcp_etat", { _devis_id: args.devis_id });
      if (etat.error || !etat.data) throw new ToolError("Devis introuvable ou accès refusé");
      affaireId = String((etat.data as any).affaire_id);
    }
    const { payload, fichier } = await devisPayload(name, args, { db: context.db, affaireId });
    const hash = await argumentsHash(args);
    const sim = await context.db.rpc("devis_mcp_simuler", { _tool: name, _payload: payload as never, _affaire_id: affaireId });
    if (sim.error) throw new ToolError("Aperçu indisponible");
    const s = sim.data as Record<string, any>;
    if (s?.error) throw new ToolError(String(s.error));
    let vue: Record<string, unknown> = apercu(s);
    if (name === "devis_modifier_entete" && (args.champs?.note || args.champs?.note_mcp_coches)) {
      const cur = await context.db.from("devis").select("note_mcp,note_mcp_coches").eq("id", args.devis_id).maybeSingle();
      const avant = (cur.data?.note_mcp ?? null) as string | null;
      let apres: string | null = avant;
      if (args.champs.note) { try { apres = noteApres(avant, args.champs.note.mode, args.champs.note.texte, new Date()); } catch (e) { throw new ToolError(e instanceof Error ? e.message : "Note invalide"); } }
      vue = { ...vue, note: { avant, apres, mode: args.champs.note?.mode ?? null }, ...(args.champs.note_mcp_coches ? { note_mcp_coches: { avant: cur.data?.note_mcp_coches ?? [], apres: args.champs.note_mcp_coches } } : {}) };
    }
    if (name === "devis_remplir" && (args.modifications?.length || args.suppressions?.length || (args.lignes ?? []).some((e: any) => e.ligne_id))) {
      const lu = await context.db.rpc("devis_lire", { _devis_id: args.devis_id });
      vue = { ...vue, elements_vises: elementsVises((lu.data ?? null) as Record<string, any> | null, args) };
    }
    if (typeof args.confirmation_id === "string") {
      if (fichier) {
        const up = await context.db.storage.from("devis-photos").upload(fichier.path, fichier.bytes, { contentType: fichier.mime, upsert: false });
        if (up.error && !/exist|duplicate/i.test(up.error.message)) throw new ToolError("Dépôt du fichier refusé");
      }
      const { data, error } = await context.db.rpc("mcp_execute_write_locked", { _confirmation_id: args.confirmation_id, _tool: name, _arguments_hash: hash, _payload: payload as never, _diff: vue as never });
      if (error) throw new ToolError("Confirmation indisponible");
      const out = data as Record<string, any>;
      if (fichier && out?.error) {
        const { retirerCopieOrpheline } = await import("@/lib/devis/images-ia.server");
        await retirerCopieOrpheline(fichier.path).catch(() => false);
      }
      return { ...compactResult({ ...out, totaux: resumeTotaux(out?.calcul), calcul: undefined }), ...(out?.error ? { isError: true } : {}) };
    }
    const { data, error } = await context.db.rpc("mcp_write_preview", { _tool: name, _arguments_hash: hash, _payload: payload as never, _affaire_id: affaireId, _etape_id: null as never, _snapshot: s.snapshot, _diff: {} });
    if (error) throw new ToolError("Aperçu refusé par les droits ou journal indisponible");
    return compactResult({ statut: "preview", mode: args.mode, ...vue, ...(data as object), consigne: "Montrer cet aperçu à l'utilisateur, puis renvoyer exactement les mêmes arguments avec confirmation_id sous 10 minutes." });
  } catch (error) {
    const audit = await context.db.from("mcp_audit_log").insert({ user_id: context.userId, client_id: context.clientId, tool: name, statut: "refused", arguments: {} });
    if (audit.error) throw new ToolError("Journal indisponible : écriture interrompue");
    return { ...compactResult({ error: error instanceof ToolError ? error.message : "Écriture indisponible", statut: "refused" }), isError: true };
  }
}

/** Dernier PDF client de la version en cours (ou nouvel export) + lien de téléchargement temporaire. Aucun envoi d'email. */
async function exporterPdfMcp(context: McpAppContext, devisId: string, niveau: "detaille" | "synthetique", regenerer: boolean) {
  const lu = await context.db.from("devis").select("numero,version,statut_redaction,updated_at").eq("id", devisId).maybeSingle();
  if (lu.error || !lu.data) throw new ToolError("Devis introuvable ou accès refusé");
  const h = await context.db.rpc("devis_exports_lister", { _devis_id: devisId });
  if (h.error) throw new ToolError("Historique des exports indisponible");
  let dernier = ((h.data ?? []) as any[]).find(e => e.niveau === niveau && e.version === lu.data!.version && e.statut_redaction === lu.data!.statut_redaction
    && new Date(e.cree_le) >= new Date(lu.data!.updated_at));
  let genere = false;
  if (!dernier || regenerer) {
    const { exporterDevisPdf } = await import("@/lib/devis/pdf-export");
    try {
      const r = await exporterDevisPdf(context.db as never, devisId, niveau);
      dernier = { storage_path: r.path, version: r.export.version, filigrane: r.export.filigrane, cree_le: new Date().toISOString() };
      genere = true;
    } catch (e) { throw new ToolError(e instanceof Error ? e.message : "Export PDF impossible"); }
  }
  const url = await context.db.storage.from("devis-exports").createSignedUrl(dernier.storage_path, 3600);
  if (url.error || !url.data) throw new ToolError("Lien de téléchargement indisponible");
  return { numero: lu.data.numero, version: dernier.version, niveau, filigrane_projet: dernier.filigrane === true, genere, cree_le: String(dernier.cree_le),
    nom_fichier: `Devis ${/-R\d+$/.test(lu.data.numero) ? lu.data.numero : `${lu.data.numero}-R${dernier.version}`}.pdf`, url_telechargement: url.data.signedUrl, expire_dans_secondes: 3600,
    rappel: "Lien temporaire. L'envoi au client reste fait par un humain (brouillon Outlook possible)." };
}

/** Excel ProGBat + fiche de contrôle d'un devis validé non transféré ; liens temporaires 1 h. Aucun envoi ni finalisation. */
async function exporterProgbatMcp(context: McpAppContext, devisId: string) {
  const lu = await context.db.from("devis").select("numero,version,statut_redaction,numero_progbat").eq("id", devisId).maybeSingle();
  if (lu.error || !lu.data) throw new ToolError("Devis introuvable ou accès refusé");
  if (lu.data.statut_redaction !== "valide" || lu.data.numero_progbat) {
    throw new ToolError(lu.data.numero_progbat ? `Devis déjà transféré dans ProGBat (${lu.data.numero_progbat})` : "Seul un devis validé par un humain dans Staffing peut être exporté vers ProGBat");
  }
  const { exporterDevisProgbat } = await import("@/lib/devis/progbat-io");
  let r: Awaited<ReturnType<typeof exporterDevisProgbat>>;
  try { r = await exporterDevisProgbat(context.db as never, devisId); }
  catch (e) { throw new ToolError(e instanceof Error ? e.message : "Export ProGBat impossible"); }
  const url = await context.db.storage.from("devis-exports").createSignedUrl(r.path, 3600);
  if (url.error || !url.data) throw new ToolError("Lien de téléchargement indisponible");
  const photos = await Promise.all(r.fiche.photos.map(async (p) => {
    const u = await context.db.storage.from("devis-photos").createSignedUrl(p.storage_path, 3600);
    return { objet: p.objet, legende: p.legende, url: u.data?.signedUrl ?? null };
  }));
  const { photos: _p, devis_id: _d, ...fiche } = r.fiche;
  return { numero: lu.data.numero, version: lu.data.version, nom_fichier: r.nom, url_telechargement: url.data.signedUrl, expire_dans_secondes: 3600,
    fiche_controle: { ...fiche, photos }, rappel: "Importer dans un devis ProGBat neuf et vide, cocher « La première ligne contient les titres », faire les réglages, relire le total, laisser le devis ProGBat en brouillon, puis proposer devis_enregistrer_transfert." };
}

/** Image de la boîte de documents : lue avec les droits de l'appelant, active, de l'affaire du devis, JPG/PNG réel, 10 Mo max. */
export async function lireDocumentAffaire(ctx: { db: any; affaireId: string } | undefined, documentId: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: Mime; nom: string }> {
  if (!ctx) throw new ToolError("Document de l'affaire indisponible");
  const { data: d } = await ctx.db.from("affaire_documents").select("id,affaire_id,storage_path,filename,mime_type,taille_bytes,deleted_at").eq("id", documentId).maybeSingle();
  if (!d || d.deleted_at || d.affaire_id !== ctx.affaireId) throw new ToolError("Document introuvable dans l'affaire de ce devis");
  if (Number(d.taille_bytes) > 10 * 1024 * 1024) throw new ToolError("Document trop volumineux (10 Mo maximum)");
  const { data: blob, error } = await ctx.db.storage.from("affaires-photos").download(d.storage_path);
  if (error || !blob) throw new ToolError("Lecture du document refusée");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = detecterType(bytes);
  if (mime !== "image/jpeg" && mime !== "image/png") throw new ToolError("Seules les images JPG ou PNG de la boîte peuvent être ajoutées comme photo");
  return { bytes, mime: mime as Mime, nom: String(d.filename) };
}
