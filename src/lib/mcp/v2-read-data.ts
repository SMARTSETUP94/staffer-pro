import { ToolError } from "@lovable.dev/mcp-js";
import { compactResult, safeAuditArguments, type McpAppContext } from "./policy";
import { pageRows } from "./read-data";
import { conflitsVehicules } from "@/lib/logistique/etapes";
import type { V2ReadName } from "./write-schemas";

export const V2_READ_CAPS: Record<V2ReadName, string> = { rechercher_clients: "clients.view", planning_logistique: "logistique.planning.view", vehicules_disponibles: "logistique.planning.view", lister_propositions_logistiques: "logistique.proposition.view" };
export const ETAPE_SELECT = "id,affaire_id,type,date_debut,date_fin,heure_debut,heure_fin,horaire_libre,lieu_libre,vehicule_id,responsable,statut,note,commentaire_equipe,updated_at,affaire:affaires(id,numero,nom,lieu),vehicule:vehicules(id,nom,immatriculation)";
export async function logisticsRows(context: McpAppContext, du: string, au: string) {
  if (au < du || (Date.parse(au) - Date.parse(du)) / 86400000 > 92) throw new ToolError("Période invalide ou supérieure à 93 jours");
  const { data, error } = await context.db.from("affaire_etapes_logistiques").select(ETAPE_SELECT).lte("date_debut", au).or(`date_fin.gte.${du},and(date_fin.is.null,date_debut.gte.${du})`).neq("statut", "annule").order("date_debut").order("id").limit(1000);
  if (error || (data?.length ?? 0) >= 1000) throw new ToolError("Planning indisponible ou période trop volumineuse");
  return data ?? [];
}
export async function readV2(context: McpAppContext, name: V2ReadName, args: Record<string, unknown>) {
  const start = Date.now(); let count = 0, status = "ok", result;
  try {
    if (!context.caps.has(V2_READ_CAPS[name])) throw new ToolError("Droit métier insuffisant");
    let rows: Record<string, unknown>[] = [];
    if (name === "rechercher_clients") {
      const q = String(args.q).replace(/[,%()]/g, " ");
      const { data, error } = await context.db.from("clients").select("id,nom,actif").eq("actif", true).ilike("nom", `%${q}%`).order("nom").order("id").limit(1000);
      if (error || (data?.length ?? 0) >= 1000) throw new ToolError("Recherche indisponible ou trop large"); rows = data ?? [];
    } else if (name === "lister_propositions_logistiques") {
      let query = context.db.from("jalonnements").select("id,affaire_id,nom_fichier,statut,nb_etapes_planifiees,created_at").order("created_at").order("id").limit(1000);
      if (args.affaire_id) query = query.eq("affaire_id", args.affaire_id);
      const { data, error } = await query;
      if (error || (data?.length ?? 0) >= 1000) throw new ToolError("Propositions indisponibles ou trop nombreuses"); rows = data ?? [];
    } else {
      const stages = await logisticsRows(context, String(args.du), String(args.au));
      const conflicts = conflitsVehicules(stages);
      if (name === "planning_logistique") rows = stages.filter(e => (!args.type || e.type === args.type) && (!args.affaire || e.affaire_id === args.affaire) && (!args.vehicule || e.vehicule_id === args.vehicule)).map(e => ({ ...e, conflit_vehicule: conflicts.has(e.id) }));
      else {
        const { data, error } = await context.db.from("vehicules").select("id,nom,immatriculation,type,date_debut_location,date_fin_location").eq("actif", true).order("nom").order("id").limit(1000);
        if (error || (data?.length ?? 0) >= 1000) throw new ToolError("Véhicules indisponibles");
        rows = (data ?? []).filter(v => !stages.some(e => e.vehicule_id === v.id) && (!v.date_debut_location || v.date_debut_location <= String(args.du)) && (!v.date_fin_location || v.date_fin_location >= String(args.au)));
      }
    }
    const page = pageRows(rows, args); count = page.rows.length; result = compactResult(page);
  } catch (error) { status = "refuse"; result = { ...compactResult({ error: error instanceof ToolError ? error.message : "Lecture indisponible" }), isError: true }; }
  const audit = await context.db.from("mcp_audit_log").insert({ user_id: context.userId, client_id: context.clientId, tool: name, arguments: safeAuditArguments(args), statut: status, nb_lignes: count, duree_ms: Date.now() - start });
  if (audit.error) throw new ToolError("Journal indisponible"); return result;
}