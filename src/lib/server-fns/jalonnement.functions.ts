/**
 * Lecture IA d'un jalonnement (PDF, image, Excel ou texte) → étapes logistiques proposées.
 * Rien n'est écrit en base : l'humain valide ensuite côté client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getToken, resolveMessage } from "./shared-inbox-attachments.functions";
import { bodyToPlainText } from "@/lib/shared-inbox-classify";
import { ETAPE_TYPES } from "@/lib/logistique/etapes";

const MAX_B64 = 20 * 1024 * 1024;

export type JalonnementEtape = {
  type: (typeof ETAPE_TYPES)[number];
  date_debut: string;
  date_fin: string | null;
  heure_debut: string | null;
  heure_fin: string | null;
  lieu: string | null;
  note: string | null;
  nb_personnes: number | null;
  responsable: string | null;
  numero_affaire: string | null;
};
export type JalonnementResult = {
  numero_affaire: string | null;
  nom_evenement: string | null;
  lieu: string | null;
  resume: string | null;
  etapes: JalonnementEtape[];
};

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["numero_affaire", "nom_evenement", "lieu", "resume", "etapes"],
  properties: {
    numero_affaire: { type: ["string", "null"] },
    nom_evenement: { type: ["string", "null"] },
    lieu: { type: ["string", "null"] },
    resume: { type: ["string", "null"] },
    etapes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["type", "date_debut", "date_fin", "heure_debut", "heure_fin", "lieu", "note", "nb_personnes", "responsable", "numero_affaire"],
        properties: {
          type: { type: "string", enum: [...ETAPE_TYPES] },
          date_debut: { type: "string" },
          date_fin: { type: ["string", "null"] },
          heure_debut: { type: ["string", "null"] },
          heure_fin: { type: ["string", "null"] },
          lieu: { type: ["string", "null"] },
          note: { type: ["string", "null"] },
          nb_personnes: { type: ["integer", "null"] },
          responsable: { type: ["string", "null"] },
          numero_affaire: { type: ["string", "null"] },
        },
      },
    },
  },
};

export function instructions(today: string) {
  return [
    "Tu lis un jalonnement (planning d'exploitation d'un événement / plateau TV) pour SETUP Paris, société de scénographie et de décor.",
    `Date du jour : ${today}.`,
    "",
    "1. REPÈRE SETUP. Dans le document, SETUP peut apparaître sous : « SET UP », « SETUP », « SMART - SET UP », « SMART RESTRUCTURING », « Smart », « équipe déco / décor » (si aucun autre décorateur n'est nommé). " +
      "Deux mises en page existent : (a) une colonne par prestataire → ne lis QUE la colonne SET UP ; (b) une ligne par action avec une colonne Intervenant → ne garde que les lignes où SETUP intervient, plus les livraisons/chargements de DÉCOR. " +
      "Ignore les autres prestataires (lumière, son, vidéo, LED, structure, informatique…), les tournages, répétitions et pauses repas.",
    "",
    "2. TYPE D'ÉTAPE : tracage (traçage décor) ; livraison (arrivée des camions/containers décor sur site) ; montage (montage, boisage, moquette, habillage, tapisserie, soffites, gradins, vomitoires…) ; " +
      "finitions (finitions, peinture, retouches) ; permanence (« perm », suivi technique SETUP, présence pendant tournages) ; demontage ; rotation (rotation / navette de matériel entre atelier et site) ; chargement (chargement décor en fin de démontage) ; dechargement. " +
      "Les journées « OFF » ne génèrent rien.",
    "",
    "3. UNE ÉTAPE PAR JOUR ET PAR TYPE : fusionne matin + après-midi d'un même jour (ex. 7h-12h puis 13h-20h → heure_debut 07:00, heure_fin 20:00). " +
      "En principe UNE SEULE étape SETUP par jour : choisis le type dominant (montage > finitions > permanence) et cite les autres tâches dans la note. Exceptions : une livraison/un traçage/un chargement à heure précise reste une étape à part. Garde un jour = une étape pour conserver l'effectif de chaque jour.",
    "",
    "4. EFFECTIF : nb_personnes = effectif SETUP du jour s'il est écrit (« 19P », « 7P », « PAX (5) », « 3 tech SMART SET UP », « 1 tapissier Set up ») ; sinon null. Prends le maximum du jour si matin et après-midi diffèrent. Si le document liste des NOMS de personnes, compte-les pour nb_personnes mais ne recopie JAMAIS ces noms (ni dans la note).",
    "4b. RESPONSABLE : responsable = nom du responsable / chef d'équipe de l'intervention s'il est indiqué (« Resp. », « Responsable », « Chef ») ; sinon null.",
    "4c. PLANNING INTERNE SETUP (« Planning du … au … ») : tableau déjà décidé, par jour, avec chantier, responsable, opération (Rotation/Montage/Démontage/Chargement/Déchargement), adresse, commentaires (horaires, véhicule). Garde TOUTES les lignes ; heures et véhicule dans heure_debut/heure_fin et la note ; l'adresse dans lieu. Les pages peuvent être dans le désordre : trie par date. Ce planning couvre souvent PLUSIEURS chantiers : renseigne numero_affaire sur CHAQUE étape (numéro à 4 chiffres de la ligne), et laisse numero_affaire global à null s'il y en a plusieurs.",
    "4e. RÈGLES PLATEAU TV (planning de production d'émission) : SETUP assure une PERMANENCE (type permanence) chaque jour de TOURNAGE et chaque jour de « répétitions toutes équipes » ; une étape par date. Les encodages et les répétitions simples (sans « toutes équipes ») ne génèrent rien. Une liste « 4, 5 janvier 2027 » ou « 24, 25 et 30 novembre » = une date par jour cité, ne jamais en sauter. Une installation de nuit (ex. double fauteuil dans la nuit du jeudi au vendredi) = une étape montage à la date du jeudi, avec la précision en note. « Montage / démontage selon jalonnement » sans date = aucune étape (le jalonnement viendra à part). Un traçage daté = étape tracage. Mets dans le note la séquence (ex. « Perm. tournage Blinds J2 », « Perm. répét. toutes équipes Battles »). Dates « en option » : garde-les avec « (option) »dans la note. ",
    "4d. Pour chaque étape, numero_affaire = numéro SETUP à 4 chiffres propre à cette ligne s'il est écrit, sinon null.",
    "",
    "5. DATES : format YYYY-MM-DD. Si l'année manque, prends la prochaine occurrence après aujourd'hui. Corrige les incohérences évidentes (ex. « lundi 09-oct » au milieu de novembre → 9 novembre, en suivant le jour de semaine et la séquence). " +
      "Heures HH:MM ou null. date_fin = null sauf étape réellement continue sur plusieurs jours sans détail jour par jour.",
    "",
    "6. TEXTE BARRÉ = annulé : ignore-le. Les consignes sans horaire (ex. « ne pas mettre le dibon derrière l'orchestre ») vont dans la note de l'étape la plus proche, pas dans une étape à part.",
    "",
    "7. NOTE : courte, utile au chef d'équipe (tâches clés, nombre de camions, contraintes d'accès, quai, horaire imposé, engins). lieu = adresse du site si indiquée.",
    "",
    "numero_affaire = numéro SETUP à 4 chiffres s'il apparaît (ex. 4130, 6042), sinon null — ne devine jamais. nom_evenement = nom de l'émission ou de l'événement. resume = 2 phrases max : période, lieu, ce que fait SETUP. Réponds en JSON strict.",
  ].join("\n");
}

async function fileToParts(name: string, mime: string, base64: string): Promise<any[]> {
  if (base64.length > MAX_B64) throw new Error("Fichier trop volumineux (> 15 Mo)");
  const lower = name.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf"))
    return [{ type: "input_file", filename: name, file_data: `data:application/pdf;base64,${base64}` }];
  if (mime.startsWith("image/")) return [{ type: "input_image", image_url: `data:${mime};base64,${base64}` }];
  if (/\.(xlsx|xlsm|xls|csv)$/.test(lower) || mime.includes("sheet") || mime.includes("excel")) {
    const XLSX = await import("xlsx-js-style");
    const wb = XLSX.read(base64, { type: "base64", cellDates: true });
    const txt = wb.SheetNames.map((s) => `# Feuille ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s], { FS: " | " })}`).join("\n\n");
    return [{ type: "input_text", text: `Contenu du tableur ${name} :\n${txt.slice(0, 60000)}` }];
  }
  if (mime.startsWith("text/") || lower.endsWith(".txt")) {
    const txt = new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
    return [{ type: "input_text", text: bodyToPlainText(txt, mime.includes("html") ? "html" : "text").slice(0, 60000) }];
  }
  throw new Error("Format non pris en charge (PDF, image, Excel ou texte uniquement)");
}

async function callAI(parts: any[]): Promise<JalonnementResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Clé IA manquante");
  const { appelerIAJson, messageErreurIA } = await import("@/lib/ai/fournisseur.server");
  const contenu = parts.map((p: any) => p.type === "input_text" ? { type: "text" as const, text: p.text }
    : p.type === "input_file" ? { type: "pdf" as const, nom: p.filename, base64: String(p.file_data).split(",")[1] ?? "" }
    : { type: "image" as const, mime: String(p.image_url).slice(5, String(p.image_url).indexOf(";")), base64: String(p.image_url).split(",")[1] ?? "" });
  try {
    const r = await appelerIAJson<JalonnementResult>(key, { usage: "jalonnement", systeme: instructions(new Date().toISOString().slice(0, 10)), contenu, schema: SCHEMA as Record<string, unknown>, nomSchema: "jalonnement", maxSortie: 16000 });
    return r.data;
  } catch (e) { throw new Error(`Analyse IA impossible : ${messageErreurIA(e)}`); }
}

async function checkCap(supabase: any) {
  const { data } = await supabase.rpc("user_has_cap", { _cap: "logistique.proposition.view" });
  if (!data) throw new Error("Accès refusé");
}

export const analyserJalonnementFichier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ name: z.string().min(1), mime: z.string(), base64: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    await checkCap(context.supabase);
    return callAI(await fileToParts(data.name, data.mime, data.base64));
  });

export const analyserJalonnementEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ emailId: z.string().uuid(), attachmentId: z.string().nullable() }).parse(i))
  .handler(async ({ data, context }) => {
    await checkCap(context.supabase);
    const { data: em } = await context.supabase
      .from("emails_entrants").select("subject, body_full, body_content_type, body_preview").eq("id", data.emailId).maybeSingle();
    if (!em) throw new Error("Email introuvable");
    const parts: any[] = [{
      type: "input_text",
      text: `Email — objet : ${em.subject ?? ""}\n${bodyToPlainText(em.body_full, em.body_content_type) || em.body_preview || ""}`,
    }];
    if (data.attachmentId) {
      const base = await resolveMessage(context.supabase, data.emailId);
      const token = await getToken();
      const r = await fetch(`${base}/attachments/${encodeURIComponent(data.attachmentId)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Microsoft ${r.status}`);
      const a = (await r.json()) as { name?: string; contentType?: string; contentBytes?: string };
      if (!a.contentBytes) throw new Error("Pièce jointe illisible");
      parts.push(...(await fileToParts(a.name ?? "fichier", a.contentType ?? "", a.contentBytes)));
    }
    return callAI(parts);
  });
