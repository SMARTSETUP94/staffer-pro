import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DevisHeures = { id: string; numero: string; statut: string; source: "staffing" | "import"; heures: Record<string, number>; total: number };

/** Heures par métier de tous les devis lisibles d'un chantier (sans montants), sous les droits de l'appelant. */
export const lireHeuresDevisAffaire = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ affaireId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: devis, error } = await db.from("devis")
      .select("id,numero,version,redige_dans_staffing,statut_redaction,statut")
      .eq("affaire_id", data.affaireId).eq("est_modele", false).is("supprime_le", null)
      .order("created_at", { ascending: false }).limit(30);
    if (error) throw new Error("Devis indisponibles");
    const out: DevisHeures[] = [];
    for (const d of devis ?? []) {
      let heures: Record<string, number> = {};
      if (d.redige_dans_staffing) {
        const r = await db.rpc("devis_lire", { _devis_id: d.id });
        if (r.error) continue;
        const h = (r.data as unknown as { calcul?: { heures_metier?: Record<string, number> } })?.calcul?.heures_metier ?? {};
        heures = Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Number(v) || 0]));
      } else {
        const p = await db.from("devis_postes").select("metier_id,heures_prevues").eq("devis_id", d.id);
        if (p.error) continue;
        for (const x of p.data ?? []) if (x.metier_id != null) heures[String(x.metier_id)] = (heures[String(x.metier_id)] ?? 0) + Number(x.heures_prevues ?? 0);
      }
      const total = Object.values(heures).reduce((s, n) => s + n, 0);
      out.push({ id: d.id, numero: d.numero, statut: d.redige_dans_staffing ? (d.statut_redaction ?? "") : (d.statut ?? ""), source: d.redige_dans_staffing ? "staffing" : "import", heures, total: Math.round(total * 10) / 10 });
    }
    return out;
  });
