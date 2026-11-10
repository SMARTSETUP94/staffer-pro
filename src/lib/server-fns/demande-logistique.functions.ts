/**
 * Formulaire « Demande logistique » : lien public (jeton vérifié en base) ou utilisateur connecté.
 * Toutes les lectures/écritures passent par des fonctions de base réservées au rôle serveur ;
 * l'adresse IP est lue ici, jamais fournie par le navigateur.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TYPES_ETAPE } from "@/lib/logistique/gabarit-demande";

const BUCKET = "demandes-logistique";
const MIME: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
const MAX_OCTETS = 10 * 1024 * 1024;

const jetonSchema = z.string().regex(/^[0-9a-f]{48}$/);
const txt = (n: number) => z.string().trim().max(n).nullable().optional();
export const interventionSchema = z.object({
  type: z.enum(TYPES_ETAPE),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heure_debut: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  heure_fin: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  a_partir_de: z.boolean().optional(),
  lieu: txt(300), contact_sur_place: txt(200), acces: txt(500),
  vehicule: txt(100), vehicule_id: z.string().uuid().nullable().optional(),
  nb_personnes: z.number().int().min(0).max(50).nullable().optional(),
  responsable: txt(100), responsable_id: z.string().uuid().nullable().optional(),
  commentaire: txt(2000),
});
const fichierSchema = z.object({ type: z.string(), taille: z.number().int().positive() });
const creerSchema = z.object({
  demandeur: z.string().uuid(),
  projet: z.string().uuid(),
  interventions: z.array(interventionSchema).min(1).max(10),
  fichiers: z.array(fichierSchema).max(5).default([]),
  piege: z.string().max(0).optional(),
});

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
function ipRequete(): string {
  const h = getRequest().headers;
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "inconnue";
}
function propre(msg: string) {
  return /Lien invalide/.test(msg) ? "Lien invalide ou expiré" : /Trop d'envois/.test(msg) ? "Trop d'envois, réessayez dans une heure" : msg.replace(/^.*?ERROR:\s*/, "");
}

async function listes(jeton: string | null) {
  const a = await admin();
  const [p, v] = await Promise.all([
    a.rpc("demande_log_public_personnes", { _jeton: jeton as string }),
    a.rpc("demande_log_public_vehicules", { _jeton: jeton as string }),
  ]);
  if (p.error || v.error) throw new Error(propre((p.error ?? v.error)!.message));
  return { personnes: p.data ?? [], vehicules: v.data ?? [] };
}
async function projet(jeton: string | null, numero: string) {
  const { data, error } = await (await admin()).rpc("demande_log_public_projet", { _jeton: jeton as string, _numero: numero });
  if (error) throw new Error(propre(error.message));
  return data?.[0] ?? null;
}
async function creer(jeton: string | null, cle: string, d: z.infer<typeof creerSchema>) {
  for (const f of d.fichiers) {
    if (!MIME[f.type]) throw new Error("Pièces jointes : PDF, JPG ou PNG uniquement");
    if (f.taille > MAX_OCTETS) throw new Error("Pièces jointes : 10 Mo maximum par fichier");
  }
  const a = await admin();
  const { data: id, error } = await a.rpc("demande_log_public_creer", {
    _jeton: jeton as string, _cle: cle, _demandeur: d.demandeur, _projet: d.projet,
    _interventions: d.interventions.map((i) => ({ ...i, libelle: i.type, source: "formulaire" })), _nb_fichiers: d.fichiers.length,
  });
  if (error || !id) throw new Error(propre(error?.message ?? "Envoi impossible"));
  const uploads: Array<{ path: string; token: string }> = [];
  for (const f of d.fichiers) {
    const path = `${id}/${crypto.randomUUID()}.${MIME[f.type]}`;
    const { data: up, error: e } = await a.storage.from(BUCKET).createSignedUploadUrl(path);
    if (e || !up) throw new Error("Dépôt des pièces jointes impossible");
    uploads.push({ path, token: up.token });
  }
  return { id: id as string, uploads };
}
async function fichierOk(jeton: string | null, demande: string, path: string) {
  const a = await admin();
  const dossier = path.split("/")[0];
  const nom = path.split("/")[1];
  const { data: obj } = await a.storage.from(BUCKET).list(dossier, { search: nom });
  const o = obj?.find((x) => x.name === nom);
  if (!o) throw new Error("Fichier introuvable");
  const meta = o.metadata as { size?: number; mimetype?: string } | null;
  if ((meta?.size ?? 0) > MAX_OCTETS || (meta?.mimetype && !MIME[meta.mimetype])) throw new Error("Fichier refusé");
  const { error } = await a.rpc("demande_log_public_fichier", { _jeton: jeton as string, _demande: demande, _chemin: path });
  if (error) throw new Error(propre(error.message));
  return { ok: true };
}

/* ---------- Lien public (jeton obligatoire) ---------- */
export const demLogPublicListes = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ jeton: jetonSchema }).parse(i))
  .handler(async ({ data }) => listes(data.jeton));
export const demLogPublicProjet = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ jeton: jetonSchema, numero: z.string().regex(/^\d{4,5}$/) }).parse(i))
  .handler(async ({ data }) => projet(data.jeton, data.numero));
export const demLogPublicCreer = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => creerSchema.extend({ jeton: jetonSchema }).parse(i))
  .handler(async ({ data }) => creer(data.jeton, `ip:${ipRequete()}`, data));
export const demLogPublicFichier = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ jeton: jetonSchema, demande: z.string().uuid(), path: z.string().max(200) }).parse(i))
  .handler(async ({ data }) => fichierOk(data.jeton, data.demande, data.path));

/* ---------- Utilisateur connecté (sans jeton) ---------- */
export const demLogListes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const l = await listes(null);
    const { data: emp } = await context.supabase.from("employes").select("id").eq("profile_id", context.userId).maybeSingle();
    const moi = emp ? l.personnes.find((p) => p.employe_id === emp.id)?.id ?? null : null;
    return { personnes: l.personnes.map(({ employe_id: _e, ...p }) => p), vehicules: l.vehicules, moi };
  });
export const demLogProjet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ numero: z.string().regex(/^\d{4,5}$/) }).parse(i))
  .handler(async ({ data }) => projet(null, data.numero));
export const demLogCreer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => creerSchema.parse(i))
  .handler(async ({ data, context }) => creer(null, `user:${context.userId}`, data));
export const demLogFichier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ demande: z.string().uuid(), path: z.string().max(200) }).parse(i))
  .handler(async ({ data }) => fichierOk(null, data.demande, data.path));
