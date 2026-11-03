import { ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { compactResult, safeAuditArguments, type McpAppContext } from "./policy";
import { argumentsHash } from "./write-policy";
import { confirmationSchema } from "./write-schemas";
import { dateSchema } from "./schemas";

/** Écritures devis autorisées pour Claude. Toute autre action devis reste dans l'application. */
export const DEVIS_WRITE_TOOLS = ["devis_creer_brouillon", "devis_remplir", "devis_modifier_entete", "devis_ajouter_photo", "devis_nouvelle_version", "devis_soumettre"] as const;
export type DevisWriteName = typeof DEVIS_WRITE_TOOLS[number];
export const DEVIS_READ_TOOLS = ["devis_lister", "devis_lire", "devis_referentiel", "materiaux_rechercher", "devis_charge_be"] as const;
export type DevisReadName = typeof DEVIS_READ_TOOLS[number];
export const DEVIS_READ_CAPS: Record<DevisReadName, string> = {
  devis_lister: "devis.view", devis_lire: "devis.view", devis_referentiel: "devis.rediger", materiaux_rechercher: "devis.rediger", devis_charge_be: "devis.view",
};
export const LOT_MAX = 300;
export const PHOTO_MAX_OCTETS = 10 * 1024 * 1024;
export const PHOTO_MIMES = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" } as const;

const uuid = z.string().uuid();
const num = z.number().finite();
const mode = z.enum(["autonomie", "conversation"]).describe("autonomie = tâche planifiée ou initiative de Claude : refusé si un humain a repris le brouillon. conversation = l'utilisateur demande explicitement dans la conversation de compléter ce devis.");
const heure = z.object({
  poste: z.string().min(1).max(40).describe("Code poste : suivi_projet, plans_bem, construction, metallerie, peinture, cnc, laser, impression_uv, impressions_souples, tapisserie, montage, logistique."),
  niveau: z.string().max(40).optional().describe("standard ; pour montage : chef ou monteur."),
  heures: num.min(0).max(100000), taux_vente: num.min(0).optional().describe("Omettre pour le taux de la grille."),
  montant_force: num.optional().describe("Montant exact de la ligne (taux affiché dérivé)."), par_unite: z.boolean().optional(),
}).strict();
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
export const tailleLot = (lignes: z.infer<typeof element>[]) => lignes.reduce((n, e) => n + 1 + (e.heures?.length ?? 0) + (e.materiaux?.length ?? 0) + (e.libres?.length ?? 0), 0);

export const devisSchemas = {
  devis_lister: { affaire_id: uuid.optional(), recherche: z.string().max(120).optional(), statuts: z.array(z.enum(["brouillon", "a_valider", "valide", "transfere", "signe", "refuse"])).max(6).optional(), limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).default(0) },
  devis_lire: { devis_id: uuid },
  devis_referentiel: {},
  materiaux_rechercher: { q: z.string().min(1).max(200), familles: z.array(z.string().max(80)).max(20).optional(), fournisseurs: z.array(uuid).max(20).optional(), epaisseur: num.min(0).optional(), recent_seulement: z.boolean().default(false), limit: z.number().int().min(1).max(50).default(20) },
  devis_charge_be: { affaire_ids: z.array(uuid).min(1).max(50) },
  devis_creer_brouillon: { affaire_id: uuid, modele_id: z.union([uuid, z.literal("vierge")]).optional().describe("Omettre = modèle par défaut ; « vierge » = sans modèle."), cle_externe: z.string().min(1).max(255).optional(), note: z.string().max(4000).optional().describe("Hypothèses à confirmer, affichées en tête de l'éditeur."), mode, ...confirmationSchema },
  devis_remplir: { devis_id: uuid, lignes: z.array(element).min(1).max(LOT_MAX).refine(l => tailleLot(l) <= LOT_MAX, `${LOT_MAX} lignes maximum par appel (heures, matériaux et lignes libres comprises) : découper en plusieurs appels`), cle_externe: z.string().min(1).max(255).optional(), mode, ...confirmationSchema },
  devis_modifier_entete: { devis_id: uuid, champs: z.object({
    client_id: uuid.nullable().optional(), contact_id: uuid.nullable().optional(), client_final_id: uuid.nullable().optional(), libelle: z.string().max(500).optional(),
    date_devis: dateSchema.optional(), date_validite: dateSchema.nullable().optional(), validite_jours: z.number().int().min(1).max(365).optional(),
    date_visite_technique: dateSchema.nullable().optional(), date_montage: dateSchema.nullable().optional(), date_evenement_debut: dateSchema.nullable().optional(), date_evenement_fin: dateSchema.nullable().optional(), date_demontage: dateSchema.nullable().optional(),
    remise: z.object({ mode: z.enum(["aucune", "montant", "pct", "net_cible"]), valeur: num.min(0).optional() }).strict().optional(),
  }).strict().refine(p => Object.keys(p).length > 0, "Modification vide"), mode, ...confirmationSchema },
  devis_ajouter_photo: { devis_id: uuid, ligne_id: uuid.describe("Objet du devis."), fichier_base64: z.string().min(8).describe("Contenu JPG, PNG ou PDF en base64, 10 Mo maximum."), mime: z.enum(["image/jpeg", "image/png", "application/pdf"]), legende: z.string().max(300).optional(), source: z.string().max(200).optional().describe("Origine : pièce jointe du mail de…, plan, référence…"), visible_client: z.boolean().default(false), mode, ...confirmationSchema },
  devis_nouvelle_version: { devis_id: uuid.describe("Devis envoyé / validé à reprendre ; l'original n'est jamais modifié."), note: z.string().max(4000).optional(), mode, ...confirmationSchema },
  devis_soumettre: { devis_id: uuid, note: z.string().max(4000).describe("Ce qui reste à confirmer par le chargé d'affaires."), mode, ...confirmationSchema },
} as const;

export function devisReadEnabled(context: McpAppContext, name: DevisReadName) { return context.caps.has(DEVIS_READ_CAPS[name]); }
export function devisWriteEnabled(context: McpAppContext) {
  return context.caps.has("api.mcp.write") && context.caps.has("devis.rediger") && context.writeScopes?.has("devis.rediger") === true;
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
  return Object.fromEntries(TOTAUX.filter(k => k in c).map(k => [k, c[k] as never]));
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
      data = { rows: [1], devis: r.data as never, redaction_claude: (meta.data ?? null) as never };
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
    } else {
      const r = await context.db.rpc("devis_charge_be", { _affaire_ids: args.affaire_ids });
      if (r.error) throw new ToolError("Charge BE indisponible");
      data = { rows: ((r.data ?? []) as any[]).map(c => ({ ...c, jours_be: arrondi1(c.jours_be), heures_be: arrondi1(c.heures_be) })) };
    }
    count = (data.rows as unknown[]).length;
    if (name === "devis_lire") { const { rows: _r, ...rest } = data; result = compactResult(rest); }
    else result = compactResult(data);
  } catch (error) {
    if (status !== "refuse") status = "erreur";
    result = { ...compactResult({ error: error instanceof ToolError ? error.message : "Lecture indisponible" }), isError: true };
  }
  const audit = await context.db.from("mcp_audit_log").insert({ user_id: context.userId, client_id: context.clientId, tool: name, arguments: safeAuditArguments(args), nb_lignes: count, duree_ms: Date.now() - start, statut: status });
  if (audit.error) throw new ToolError("Journal indisponible : lecture interrompue");
  return result;
}

/** Décode et contrôle un fichier : type réel (signature) et taille. */
export function controlerFichier(base64: string, mime: keyof typeof PHOTO_MIMES, max = PHOTO_MAX_OCTETS) {
  const clean = base64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) throw new ToolError("Contenu base64 invalide");
  if (Math.floor(clean.length * 3 / 4) > max + 4) throw new ToolError(`Fichier trop volumineux (${max / 1024 / 1024} Mo maximum)`);
  const bin = atob(clean); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length > max) throw new ToolError(`Fichier trop volumineux (${max / 1024 / 1024} Mo maximum)`);
  const sig = (s: number[]) => s.every((b, i) => bytes[i] === b);
  const ok = mime === "image/jpeg" ? sig([0xff, 0xd8, 0xff]) : mime === "image/png" ? sig([0x89, 0x50, 0x4e, 0x47]) : sig([0x25, 0x50, 0x44, 0x46]);
  if (!ok) throw new ToolError("Le contenu ne correspond pas au type annoncé (JPG, PNG ou PDF uniquement)");
  return bytes;
}
async function sha256(bytes: Uint8Array) {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, "0")).join("");
}

/** Construit les arguments métier transmis à la base (jamais le fichier lui-même). */
export async function devisPayload(name: DevisWriteName, args: Record<string, any>): Promise<{ payload: Record<string, unknown>; fichier?: { path: string; bytes: Uint8Array; mime: string } }> {
  const { confirmation_id: _c, ...a } = args;
  if (name === "devis_ajouter_photo") {
    const bytes = controlerFichier(String(a.fichier_base64), a.mime);
    const path = `${a.devis_id}/mcp/${await sha256(bytes)}.${PHOTO_MIMES[a.mime as keyof typeof PHOTO_MIMES]}`;
    return { payload: { mode: a.mode, devis_id: a.devis_id, ligne_id: a.ligne_id, storage_path: path, mime: a.mime, size_bytes: bytes.length, legende: a.legende ?? null, source: a.source ?? null, visible_client: a.visible_client ?? false }, fichier: { path, bytes, mime: a.mime } };
  }
  return { payload: a };
}

function apercu(sim: Record<string, any>) {
  const av = sim.compte_avant ?? {}, ap = sim.compte_apres ?? {};
  const ajouts = Object.fromEntries(Object.keys(ap).map(k => [k, Number(ap[k] ?? 0) - Number(av[k] ?? 0)]));
  return { totaux_avant: resumeTotaux(sim.avant), totaux_apres: resumeTotaux(sim.apres), lignes_ajoutees: ajouts, ecarts_taux: sim.ecarts_taux ?? [], resultat: sim.resultat ?? null };
}

export async function runDevisWrite(context: McpAppContext, name: DevisWriteName, args: Record<string, any>) {
  try {
    if (!devisWriteEnabled(context)) throw new ToolError("Écriture devis refusée : droit de rédaction requis");
    const fresh = await context.db.rpc("mcp_assert_write", { _tool: name });
    if (fresh.error) throw new ToolError(fresh.error.message?.includes("devis non activé") ? "Module devis non activé pour ce compte" : "Écriture MCP refusée : droits ou connexion modifiés");
    let affaireId: string;
    if (name === "devis_creer_brouillon") affaireId = String(args.affaire_id);
    else {
      const etat = await context.db.rpc("devis_mcp_etat", { _devis_id: args.devis_id });
      if (etat.error || !etat.data) throw new ToolError("Devis introuvable ou accès refusé");
      affaireId = String((etat.data as any).affaire_id);
    }
    const { payload, fichier } = await devisPayload(name, args);
    const hash = await argumentsHash(args);
    const sim = await context.db.rpc("devis_mcp_simuler", { _tool: name, _payload: payload as never, _affaire_id: affaireId });
    if (sim.error) throw new ToolError("Aperçu indisponible");
    const s = sim.data as Record<string, any>;
    if (s?.error) throw new ToolError(String(s.error));
    const vue = apercu(s);
    if (typeof args.confirmation_id === "string") {
      if (fichier) {
        const up = await context.db.storage.from("devis-photos").upload(fichier.path, fichier.bytes, { contentType: fichier.mime, upsert: false });
        if (up.error && !/exist|duplicate/i.test(up.error.message)) throw new ToolError("Dépôt du fichier refusé");
      }
      const { data, error } = await context.db.rpc("mcp_execute_write_locked", { _confirmation_id: args.confirmation_id, _tool: name, _arguments_hash: hash, _payload: payload as never, _diff: vue as never });
      if (error) throw new ToolError("Confirmation indisponible");
      const out = data as Record<string, any>;
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
