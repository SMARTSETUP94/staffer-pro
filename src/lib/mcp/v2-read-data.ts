import { ToolError } from "@lovable.dev/mcp-js";
import { compactResult, safeAuditArguments, type McpAppContext } from "./policy";
import { pageRows } from "./read-data";
import { conflitsVehicules } from "@/lib/logistique/etapes";
import type { V2ReadName } from "./write-schemas";
import { affichagePilotage, periodesEnChevauchement } from "@/lib/equipe-projet";

export const V2_READ_CAPS: Record<V2ReadName, string> = { rechercher_clients: "clients.view", planning_logistique: "logistique.planning.view", vehicules_disponibles: "logistique.planning.view", lister_propositions_logistiques: "logistique.proposition.view", planning_pilotage: "planning.pilotage" };
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
    } else if (name === "planning_pilotage") {
      const du = String(args.du), au = String(args.au);
      if (au < du || (Date.parse(au) - Date.parse(du)) / 86400000 > 185) throw new ToolError("Période invalide ou supérieure à 6 mois");
      let query = context.db.from("affaire_roles").select("id,affaire_id,role,employe_id,date_debut,date_fin,employes(nom,prenom),affaires(numero,nom,phase,statut_opportunite,archived_at)")
        .in("role", args.role ? [String(args.role)] : ["concepteur", "responsable_projet"]).not("date_debut", "is", null)
        .lte("date_debut", au).or(`date_fin.gte.${du},date_fin.is.null`).order("date_debut").order("id").limit(1000);
      if (args.employe) query = query.eq("employe_id", String(args.employe));
      const { data, error } = await query;
      if (error || (data?.length ?? 0) >= 1000) throw new ToolError("Planning de pilotage indisponible ou trop volumineux");
      const actives = (data ?? []).filter((l: any) => l.affaires && !l.affaires.archived_at);
      const byEmp = new Map<string, any[]>();
      actives.filter((l: any) => affichagePilotage(l.affaires) !== "potentiel").forEach((l: any) => byEmp.set(l.employe_id, [...(byEmp.get(l.employe_id) ?? []), l]));
      const over = new Set<string>();
      byEmp.forEach((ls, emp) => periodesEnChevauchement(ls).forEach(a => over.add(`${emp}|${a}`)));
      const affIds = [...new Set(actives.map((l: any) => String(l.affaire_id)))];
      const chargeBe = new Map<string, Record<string, unknown>>();
      if (affIds.length) {
        const { data: ch, error: ce } = await context.db.rpc("devis_charge_be", { _affaire_ids: affIds });
        if (ce) throw new ToolError("Charge bureau d'étude indisponible");
        for (const c of (ch ?? []) as any[]) chargeBe.set(c.affaire_id, { jours: Number(c.jours_be), heures: Number(c.heures_be), devis: `R${c.version}`, etat: c.etat });
      }
      rows = actives.map((l: any) => ({
        affaire_id: l.affaire_id, numero: l.affaires.numero, nom: l.affaires.nom, role: l.role,
        employe_id: l.employe_id, personne: [l.employes?.prenom, l.employes?.nom].filter(Boolean).join(" "),
        date_debut: l.date_debut, date_fin: l.date_fin,
        charge: affichagePilotage(l.affaires) === "potentiel" ? "potentielle" : "reelle",
        chevauchement: over.has(`${l.employe_id}|${l.affaire_id}`),
        charge_be: l.role === "concepteur" ? chargeBe.get(l.affaire_id) ?? null : null,
      }));
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