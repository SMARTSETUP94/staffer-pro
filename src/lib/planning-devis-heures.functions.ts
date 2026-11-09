import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { heuresParObjet, type ObjetHeures } from "./planning-devis-objets";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DevisHeures = { id: string; numero: string; statut: string; source: "staffing" | "import"; heures: Record<string, number>; total: number; objets: ObjetHeures[] };

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
      let objets: ObjetHeures[] = [];
      if (d.redige_dans_staffing) {
        const r = await db.rpc("devis_lire", { _devis_id: d.id });
        if (r.error) continue;
        type Lu = { calcul?: { heures_metier?: Record<string, number> }; lignes?: { id: string; parent_id: string | null; type: string; quantite: number; libelle: string | null; option_incluse?: boolean }[]; heures?: { ligne_id: string; heures: number; par_unite: boolean; metier_id: number | null }[] };
        const lu = r.data as unknown as Lu;
        const h = lu?.calcul?.heures_metier ?? {};
        heures = Object.fromEntries(Object.entries(h).filter(([k]) => k !== "aucun").map(([k, v]) => [k, Number(v) || 0]));
        objets = heuresParObjet((lu?.lignes ?? []).map((l) => ({ ...l, option: l.type === "option" && !l.option_incluse })), lu?.heures ?? [], heures);
      } else {
        const p = await db.from("devis_postes").select("metier_id,heures_prevues").eq("devis_id", d.id);
        if (p.error) continue;
        for (const x of p.data ?? []) if (x.metier_id != null) heures[String(x.metier_id)] = (heures[String(x.metier_id)] ?? 0) + Number(x.heures_prevues ?? 0);
      }
      const total = Object.values(heures).reduce((s, n) => s + n, 0);
      out.push({ id: d.id, numero: d.numero, statut: d.redige_dans_staffing ? (d.statut_redaction ?? "") : (d.statut ?? ""), source: d.redige_dans_staffing ? "staffing" : "import", heures, objets, total: Math.round(total * 10) / 10 });
    }
    return out;
  });
