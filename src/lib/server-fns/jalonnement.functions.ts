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

const MODEL = "openai/gpt-6-astra";
const MAX_B64 = 20 * 1024 * 1024;

export type JalonnementEtape = {
  type: (typeof ETAPE_TYPES)[number];
  date_debut: string;
  date_fin: string | null;
  heure_debut: string | null;
  heure_fin: string | null;
  lieu: string | null;
  note: string | null;
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
        required: ["type", "date_debut", "date_fin", "heure_debut", "heure_fin", "lieu", "note"],
        properties: {
          type: { type: "string", enum: [...ETAPE_TYPES] },
          date_debut: { type: "string" },
          date_fin: { type: ["string", "null"] },
          heure_debut: { type: ["string", "null"] },
          heure_fin: { type: ["string", "null"] },
          lieu: { type: ["string", "null"] },
          note: { type: ["string", "null"] },
        },
      },
    },
  },
};

function instructions(today: string) {
  return (
    "Tu lis un jalonnement (planning d'exploitation d'un événement) pour SETUP Paris, société de scénographie. " +
    `Date du jour : ${today}. Extrais UNIQUEMENT les étapes qui concernent SETUP ou le décor/stand : ` +
    "livraison (arrivée du matériel sur site), montage, finitions, permanence (présence pendant l'événement), démontage, chargement/déchargement si écrits. " +
    "Ignore les créneaux des autres prestataires sauf si SETUP est cité. " +
    "Dates au format YYYY-MM-DD (devine l'année : la prochaine occurrence après aujourd'hui si absente), heures HH:MM ou null. " +
    "date_fin = dernier jour si l'étape dure plusieurs jours, sinon null. Note = contrainte utile (accès, quai, badge, horaire imposé), courte. " +
    "numero_affaire = numéro SETUP à 4 chiffres s'il apparaît (ex. 6042), sinon null. Ne devine jamais un numéro. Réponds en JSON strict."
  );
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
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL, stream: true, store: false,
      reasoning: { effort: "low" },
      instructions: instructions(new Date().toISOString().slice(0, 10)),
      input: [{ role: "user", content: parts }],
      text: { format: { type: "json_schema", name: "jalonnement", strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    let msg = t.slice(0, 300);
    try { msg = JSON.parse(t)?.error?.message ?? JSON.parse(t)?.message ?? msg; } catch { /* brut */ }
    if (res.status === 402) throw new Error("Crédits IA épuisés : rechargez dans Paramètres → Plans & crédits.");
    if (res.status === 429) throw new Error("IA momentanément saturée, réessayez dans une minute.");
    throw new Error(`Analyse IA impossible (${res.status}) : ${msg}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "", failed: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const p = line.slice(5).trim();
      if (!p || p === "[DONE]") continue;
      try {
        const ev = JSON.parse(p);
        if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
        else if (ev.type === "response.failed" || ev.type === "error") failed = ev.response?.error?.message ?? ev.message ?? "échec";
        else if (ev.type === "response.refusal.delta") failed = "L'IA a refusé d'analyser ce document.";
      } catch { /* ligne partielle */ }
    }
  }
  if (failed) throw new Error(`Analyse IA impossible : ${failed}`);
  if (!out.trim()) throw new Error("L'IA n'a rien renvoyé pour ce document.");
  return JSON.parse(out) as JalonnementResult;
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
