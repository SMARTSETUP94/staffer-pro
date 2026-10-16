/** Assistant IA de remplissage : applique une consigne en langage naturel aux étapes proposées (rien n'est écrit en base). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const N = (t: string) => ({ type: [t, "null"] });
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["message", "changes"],
  properties: {
    message: { type: "string" },
    changes: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["index", "nb_personnes", "lieu", "heure_debut", "heure_fin", "contenu", "commentaire", "keep"],
      properties: { index: { type: "integer" }, nb_personnes: N("integer"), lieu: N("string"), heure_debut: N("string"),
        heure_fin: N("string"), contenu: N("string"), commentaire: N("string"), keep: N("boolean") } } },
  },
};
export type EtapeChange = { index: number; nb_personnes: number | null; lieu: string | null; heure_debut: string | null; heure_fin: string | null; contenu: string | null; commentaire: string | null; keep: boolean | null };

export const assistantEtapes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ instruction: z.string().min(1).max(2000), etapes: z.array(z.record(z.string(), z.unknown())).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("user_has_cap", { _cap: "logistique.proposition.view" });
    if (!ok) throw new Error("Accès refusé");
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Clé IA manquante");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra", stream: true, store: false, reasoning: { effort: "low" },
        instructions: "Tu aides à remplir une liste d'étapes logistiques (SETUP Paris, décor). L'utilisateur donne une consigne en français. " +
          "Renvoie dans changes une entrée par étape concernée (index = index fourni) ; pour chaque champ, mets la nouvelle valeur, ou null pour ne pas le modifier. " +
          "Heures HH:MM. « une personne » = nb_personnes 1. keep=false pour décocher une étape, true pour la cocher. Si la consigne vise « toutes les étapes », modifie-les toutes ; si elle vise un type ou des dates, seulement celles-là. " +
          "message = une phrase courte résumant ce qui a été changé.",
        input: [{ role: "user", content: [{ type: "input_text", text: `Consigne : ${data.instruction}\n\nÉtapes :\n${JSON.stringify(data.etapes)}` }] }],
        text: { format: { type: "json_schema", name: "modifs", strict: true, schema: SCHEMA } },
      }),
    });
    if (!res.ok || !res.body) {
      if (res.status === 402) throw new Error("Crédits IA épuisés : rechargez dans Paramètres → Plans & crédits.");
      if (res.status === 429) throw new Error("IA momentanément saturée, réessayez dans une minute.");
      throw new Error(`IA indisponible (${res.status}) : ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = "", out = "", failed: string | null = null;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const p = line.slice(5).trim(); if (!p || p === "[DONE]") continue;
        try {
          const ev = JSON.parse(p);
          if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
          else if (ev.type === "response.failed" || ev.type === "error") failed = ev.response?.error?.message ?? ev.message ?? "échec";
          else if (ev.type === "response.refusal.delta") failed = "L'IA a refusé la consigne.";
        } catch { /* partiel */ }
      }
    }
    if (failed) throw new Error(failed);
    if (!out.trim()) throw new Error("L'IA n'a rien renvoyé.");
    return JSON.parse(out) as { message: string; changes: EtapeChange[] };
  });
