import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function droits(supabase: any) {
  const [a, b] = await Promise.all([supabase.rpc("user_has_cap", { _cap: "demandes_clients.view" }), supabase.rpc("user_has_cap", { _cap: "section.affaires" })]);
  if (a.error || b.error || !a.data || !b.data) throw new Error("Classement des documents non autorisé");
}

/** Classe les pièces jointes d'une demande dans l'affaire déjà rattachée (appelé après chaque rattachement). */
export const classerPiecesJointesDemande = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ emailId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await droits(context.supabase);
    const { classerPiecesJointes } = await import("./classement-pj.server");
    return classerPiecesJointes(context.supabase, data.emailId, context.userId);
  });

/** Reprise de l'existant (admin) : sans confirmation → bilan seulement ; avec confirmation → traite un lot. */
export const repriseClassementPj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ confirmer: z.boolean().default(false), lot: z.number().int().min(1).max(20).default(10) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("is_admin");
    if (error || !admin) throw new Error("Réservé aux administrateurs");
    await droits(context.supabase);
    const { bilanReprise, classerPiecesJointes } = await import("./classement-pj.server");
    const bilan = await bilanReprise(context.supabase);
    if (!data.confirmer) return { ...bilan, ids: undefined, traitees: 0, resultats: [] };
    const resultats: { id: string; etat: string; erreur?: string }[] = [];
    for (const id of bilan.ids.slice(0, data.lot)) {
      try { const r = await classerPiecesJointes(context.supabase, id, context.userId); resultats.push({ id, etat: r.bilan.etat }); }
      catch (e: any) { resultats.push({ id, etat: "erreur", erreur: String(e?.message ?? e).slice(0, 200) }); }
    }
    return { ...bilan, ids: undefined, traitees: resultats.length, resultats };
  });
