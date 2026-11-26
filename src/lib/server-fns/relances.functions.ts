import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BrouillonRelance } from "@/lib/relances/brouillon";
import type { ReponseRelances } from "@/lib/relances/regles";

/** Brouillon de relance rédigé par l'IA. Ne fait qu'un texte : aucun envoi, aucune écriture. */
export const redigerRelance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    affaireId: z.string().uuid(), chargeId: z.string().uuid().nullable(), tous: z.boolean(), mentionnerMontant: z.boolean(),
  }).parse(input))
  .handler(async ({ data, context }): Promise<{ brouillon: BrouillonRelance | null; error: string | null }> => {
    setResponseHeader("Cache-Control", "no-store");
    const { data: res, error } = await context.supabase.rpc("relances_a_faire", { p_charge_id: data.chargeId ?? undefined, p_tous: data.tous });
    if (error) throw new Error("Relances inaccessibles avec vos droits");
    const ligne = (res as unknown as ReponseRelances).lignes.find(l => l.affaire_id === data.affaireId);
    if (!ligne) throw new Error("Opportunité absente de vos relances");
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { brouillon: null, error: "Configuration IA manquante." };
    const { data: actions } = await context.supabase.from("opportunite_actions").select("type,date,texte")
      .eq("affaire_id", data.affaireId).order("date", { ascending: false }).limit(5);
    const { data: profil } = await context.supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const historique = (actions ?? []).map(a => `${String(a.date).slice(0, 10)} ${a.type} : ${String(a.texte ?? "").slice(0, 300)}`);
    if (!actions?.length && ligne.derniere_action) historique.push(`${ligne.derniere_action.date.slice(0, 10)} ${ligne.derniere_action.type} : ${ligne.derniere_action.texte}`);
    const { appelerIAZod, messageErreurIA } = await import("@/lib/ai/fournisseur.server");
    const { brouillonRelanceSchema, contexteBrouillon, SYSTEME_RELANCE } = await import("@/lib/relances/brouillon");
    try {
      const r = await appelerIAZod(key, { usage: "mail_client", userId: context.userId, zod: brouillonRelanceSchema, nomSchema: "brouillon_relance",
        systeme: SYSTEME_RELANCE,
        contenu: contexteBrouillon(ligne, { mentionnerMontant: data.mentionnerMontant, historique, signataire: profil?.full_name ?? null }) });
      if (!r.data.corps.trim()) return { brouillon: null, error: "L'IA n'a pas fourni de brouillon exploitable." };
      return { brouillon: r.data, error: null };
    } catch (e) {
      return { brouillon: null, error: messageErreurIA(e) || "L'IA n'a pas fourni de brouillon exploitable." };
    }
  });
