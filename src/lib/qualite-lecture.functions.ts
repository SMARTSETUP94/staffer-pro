import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PostgrestError } from "@supabase/supabase-js";

// Read every page explicitly; never silently truncate the anomaly counters.
async function pages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await read(offset, offset + 499);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

export const lireQualite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const check = await db.rpc("qualite_assert_admin");
    if (check.error) throw new Error("Réservé aux administrateurs");
    const [employes, dispos, clients, affaires, demandes, devis, affectations, actions] = await Promise.all([
      pages((a,b) => db.from("employes").select("id,nom,prenom,actif,telephone,categories_permis,caces,poste_principal,est_chef_equipe_terrain,statut_contrat,fusionne_dans,historique_qualite").is("fusionne_dans",null).order("id").range(a,b)),
      pages((a,b) => db.from("dispos_intervenants").select("id,nom,prenom,actif,employe_id,employes_refuses,telephone,permis,caces,poste_terrain,est_chef_equipe_terrain").order("id").range(a,b)),
      pages((a,b) => db.from("clients").select("id,nom,actif,siret,domaines_email,email").is("fusionne_dans",null).order("id").range(a,b)),
      pages((a,b) => db.from("affaires").select("id,numero,nom,phase,statut_opportunite,ca_estime_ht,charge_affaires_id,date_evenement_debut,date_montage,created_at").is("archived_at",null).order("id").range(a,b)),
      pages((a,b) => db.from("emails_entrants").select("id,subject,from_name,from_email,received_at,client_id,client_a_identifier,source_boite,statut,opportunite_id").eq("source_boite","devis").neq("statut","dismissed").order("id").range(a,b)),
      pages((a,b) => db.from("devis").select("id,numero,affaire_id,created_at,cree_par_mcp,statut_redaction,montant_ht,redige_dans_staffing").is("supprime_le",null).eq("est_modele",false).eq("archive",false).order("id").range(a,b)),
      pages((a,b) => db.from("assignations").select("id,employe_id").order("id").range(a,b)),
      pages((a,b) => db.from("opportunite_actions").select("id,affaire_id,prochaine_action_due_le").order("id").range(a,b)),
    ]);
    const derniers = new Map<string, typeof devis[number]>();
    for (const d of devis) if (d.affaire_id && (!derniers.has(d.affaire_id) || d.created_at > (derniers.get(d.affaire_id)?.created_at ?? ""))) derniers.set(d.affaire_id,d);
    const montants: Record<string,number | null> = {};
    const demandesDeTotal = devis.filter(d => (d.redige_dans_staffing || d.cree_par_mcp) && (derniers.get(d.affaire_id ?? "")?.id === d.id || (d.cree_par_mcp && ["brouillon","a_valider"].includes(d.statut_redaction ?? ""))));
    // Bounded concurrency; return only the sale amount, never costs or quote content.
    for (let i=0;i<demandesDeTotal.length;i+=6) await Promise.all(demandesDeTotal.slice(i,i+6).map(async d => {
      const result = await db.rpc("devis_lire_client",{_devis_id:d.id});
      if (result.error) throw new Error(`Montant du devis ${d.numero} indisponible`);
      const value = result.data;
      const net = value && typeof value === "object" && !Array.isArray(value) ? value.net_ht : null;
      montants[d.id] = typeof net === "number" ? net : null;
    }));
    return { employes,dispos,clients,affaires,demandes,devis:devis.map(d => ({...d,net_ht: d.redige_dans_staffing || d.cree_par_mcp ? montants[d.id] ?? null : d.montant_ht})),affectes:[...new Set(affectations.map(a=>a.employe_id).filter((id):id is string=>!!id))],actions };
  });

export type QualiteLecture = Awaited<ReturnType<typeof lireQualite>>;