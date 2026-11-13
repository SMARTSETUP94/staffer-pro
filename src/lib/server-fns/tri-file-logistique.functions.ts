/**
 * Reclassement de la file logistique par lots (L2), réservé aux administrateurs.
 * Le bilan est en lecture seule. L'application exige une confirmation et des nombres
 * identiques au bilan affiché ; elle classe sans suite (aucune suppression) avec un motif.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { bilanTri, GROUPES_TRI, type GroupeTri, type LigneFile } from "@/lib/logistique/tri-file";

const GROUPES = Object.keys(GROUPES_TRI) as [GroupeTri, ...GroupeTri[]];

async function lireFile(supabase: any): Promise<LigneFile[]> {
  const out: LigneFile[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from("emails_entrants").select("id,subject,from_email,received_at,source_boite")
      .eq("statut", "pending_review").eq("categorie_ia", "logistique").order("received_at", { ascending: true }).order("id").range(from, from + 499);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as LigneFile[]));
    if ((data ?? []).length < 500) return out;
  }
}
async function exigerAdmin(supabase: any) {
  const { data } = await supabase.rpc("is_admin");
  if (!data) throw new Error("Réservé aux administrateurs");
}

export const bilanFileLogistique = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigerAdmin(context.supabase);
    const rows = await lireFile(context.supabase);
    const b = bilanTri(rows);
    return { total: rows.length, restant: b.restant, groupes: b.groupes.map(({ ids: _ids, ...g }) => g) };
  });

export const appliquerTriFileLogistique = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ confirmation: z.literal(true), lots: z.array(z.object({ groupe: z.enum(GROUPES), nombre: z.number().int().min(1) })).min(1).max(GROUPES.length) }).parse(i))
  .handler(async ({ data, context }) => {
    await exigerAdmin(context.supabase);
    const b = bilanTri(await lireFile(context.supabase));
    const resultat: Record<string, number> = {};
    for (const lot of data.lots) {
      const g = b.groupes.find((x) => x.groupe === lot.groupe);
      if (!g || g.nombre !== lot.nombre) throw new Error("La file a changé depuis le bilan : relancez le bilan avant de confirmer. Rien n'a été modifié.");
    }
    for (const lot of data.lots) {
      const g = b.groupes.find((x) => x.groupe === lot.groupe)!;
      const regle = GROUPES_TRI[lot.groupe];
      let n = 0;
      for (let i = 0; i < g.ids.length; i += 100) {
        const { data: up, error } = await context.supabase.from("emails_entrants")
          .update({ statut: "dismissed", categorie_ia: regle.categorie, motif_classement: regle.motif })
          .in("id", g.ids.slice(i, i + 100)).eq("statut", "pending_review").select("id");
        if (error) throw new Error(`Lot « ${regle.libelle} » : ${error.message} (${n} déjà classés)`);
        n += (up ?? []).length;
      }
      resultat[lot.groupe] = n;
    }
    return { resultat };
  });
