/** Assistant IA de remplissage : applique une consigne en langage naturel aux étapes proposées (rien n'est écrit en base). */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const N = (t: string) => ({ type: [t, "null"] });
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["message", "operations"],
  properties: {
    message: { type: "string" },
    operations: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["toutes", "types", "indices", "nb_personnes", "lieu", "heure_debut", "heure_fin", "contenu", "commentaire", "keep"],
      properties: {
        toutes: { type: "boolean" }, types: { type: "array", items: { type: "string" } }, indices: { type: "array", items: { type: "integer" } },
        nb_personnes: N("integer"), lieu: N("string"), heure_debut: N("string"), heure_fin: N("string"),
        contenu: N("string"), commentaire: N("string"), keep: N("boolean") } } },
  },
};
export type EtapeOperation = { toutes: boolean; types: string[]; indices: number[]; nb_personnes: number | null; lieu: string | null; heure_debut: string | null; heure_fin: string | null; contenu: string | null; commentaire: string | null; keep: boolean | null };

export const assistantEtapes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ instruction: z.string().min(1).max(2000), etapes: z.array(z.record(z.string(), z.unknown())).max(200), contexte: z.string().max(30000).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("user_has_cap", { _cap: "logistique.proposition.view" });
    if (!ok) throw new Error("Accès refusé");
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Clé IA manquante");
    const { appelerIAJson, messageErreurIA } = await import("@/lib/ai/fournisseur.server");
    try {
      const r = await appelerIAJson<{ message: string; operations: EtapeOperation[] }>(key, {
        usage: "assistant_etapes", userId: context.userId, nomSchema: "modifs", schema: SCHEMA as Record<string, unknown>,
        systeme: "Tu aides à remplir une liste d'étapes logistiques (SETUP Paris, décor). L'utilisateur donne une consigne en français. " +
          "Tu as accès au document source (email ou jalonnement) : utilise-le pour répondre aux consignes qui s'y réfèrent (ex. « mets les pax indiqués dans le mail » → pour chaque étape, retrouve dans le texte la ligne de la même date et son effectif ; une opération par étape avec indices=[index]). " +
          "Traduis la consigne en operations. Chaque opération a une cible : toutes=true pour toutes les étapes (par défaut si la consigne ne précise rien), sinon types (ex. [\"permanence\"]) et/ou indices (index fournis). " +
          "Puis les valeurs à écrire ; null = ne pas toucher ce champ. « une personne » / « 1p » = nb_personnes 1 ; « 3 pers » = 3. Un lieu cité (même sans guillemets, ex. « au studio Lendit », « lieu Lendit ») va dans lieu, tel quel. Heures HH:MM (8h → 08:00). keep=false = décocher. " +
          "N'invente jamais de valeur non demandée. Si la consigne est incompréhensible, operations = [] et message = une question courte. Sinon message = une phrase confirmant ce qui a été appliqué.",
        contenu: `${data.contexte ? `Document source :\n${data.contexte}\n\n` : ""}Consigne : ${data.instruction}\n\nÉtapes :\n${JSON.stringify(data.etapes)}`,
      });
      return r.data;
    } catch (e) { throw new Error(messageErreurIA(e)); }
  });
