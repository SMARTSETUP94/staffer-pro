import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
async function exigerCap(supabase: any, cap: string) {
  const { data, error } = await supabase.rpc("user_has_cap", { _cap: cap });
  if (error || data !== true) throw new Error("Action non autorisée");
}

/** Extraction (texte + images incorporées des PDF légers) d'un PDF de la boîte. */
export const extraireImagesPdf = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ documentId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await exigerCap(context.supabase, "section.affaires");
    const { extrairePdf } = await import("@/lib/devis/images-ia.server");
    const r = await extrairePdf(context.supabase, context.userId, data.documentId);
    return { etat: r.etat, images: r.images, pages: r.pages, textes: "textes" in r ? r.textes : [] };
  });

/** Dépôt d'un rendu de page fait dans le navigateur : revérifié par le serveur, jamais écrit directement par le navigateur. */
export const deposerRenduPage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ parentId: uuid, affaireId: uuid, page: z.number().int().min(1).max(30), base64: z.string().min(100).max(4_500_000), texte: z.string().max(8000).nullable() }).parse(i))
  .handler(async ({ data, context }) => {
    await exigerCap(context.supabase, "section.affaires");
    const { deposerRendu } = await import("@/lib/devis/images-ia.server");
    return deposerRendu(context.supabase, context.userId, data);
  });

export const categoriserDocumentsAffaire = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ affaireId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await exigerCap(context.supabase, "section.affaires");
    const { categoriserBoite } = await import("@/lib/devis/images-ia.server");
    const r = await categoriserBoite(context.supabase, data.affaireId);
    return { traites: r.traites, appels: r.appels };
  });

export const proposerImagesDevis = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ devisId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { proposerPhotos } = await import("@/lib/devis/images-ia.server");
    return proposerPhotos(context.supabase, context.userId, data.devisId, "app");
  });

/** Ajout validé par l'humain : copie serveur + devis_photo_ajouter, copie retirée si l'ajout échoue. */
export const ajouterImagesAuDevis = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ devisId: uuid, items: z.array(z.object({ ligneId: uuid, documentId: uuid, legende: z.string().max(300).nullable(), visibleClient: z.boolean() })).min(1).max(60) }).parse(i))
  .handler(async ({ data, context }) => {
    const { copierDocumentVersDevis } = await import("@/lib/devis/images-ia.server");
    const res: { documentId: string; ligneId: string; ok: boolean; erreur?: string }[] = [];
    for (const it of data.items) {
      try { await copierDocumentVersDevis(context.supabase, { devisId: data.devisId, ...it }); res.push({ documentId: it.documentId, ligneId: it.ligneId, ok: true }); }
      catch (e) { res.push({ documentId: it.documentId, ligneId: it.ligneId, ok: false, erreur: (e as Error).message.slice(0, 200) }); }
    }
    return res;
  });
