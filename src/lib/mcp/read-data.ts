import { ToolError } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "./policy";
import type { ToolName } from "./config";
import { chargeNiveau } from "@/lib/charge-atelier";
import { hasDoubleAffectation, hasAffecteAbsent, type QuiAffectation, type QuiAbsence } from "@/lib/qui-est-ou";

type Row = Record<string, any>;
type Args = Record<string, any>;
async function rowsOf(query: PromiseLike<{ data: any; error: any }>): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw new ToolError("Lecture indisponible ; vérifiez vos droits et les filtres.");
  return Array.isArray(data) ? data : data ? [data] : [];
}
export function pageRows(rows: unknown[], args: Args) {
  const offset = Number(args.cursor ?? 0), limit = Number(args.limit ?? 25);
  return { rows: rows.slice(offset, offset + limit), next_cursor: rows.length > offset + limit ? String(offset + limit) : null, currency: "EUR", amounts: "HT" };
}
function pageQuery(query: any, args: Args) {
  const offset = Number(args.cursor ?? 0), limit = Number(args.limit ?? 25);
  return query.range(offset, offset + limit);
}
async function paged(query: any, args: Args) {
  const rows = await rowsOf(pageQuery(query, args));
  const limit = Number(args.limit ?? 25);
  return { rows: rows.slice(0, limit), next_cursor: rows.length > limit ? String(Number(args.cursor ?? 0) + limit) : null, currency: "EUR", amounts: "HT" };
}
export function validateRange(args: Args) {
  if (args.du && args.au) {
    const days = (Date.parse(args.au) - Date.parse(args.du)) / 86400000;
    if (days < 0 || days > 92) throw new ToolError("Période invalide : maximum 93 jours inclusifs.");
  }
}
async function bounded(query: any): Promise<Row[]> {
  const rows = await rowsOf(query.limit(1000));
  if (rows.length >= 1000) throw new ToolError("Plus de 999 lignes sources : réduisez la période.");
  return rows;
}
const AFFAIRE_FIELDS = "id,numero,nom,client,lieu,typologie,statut,phase,date_montage,date_demontage,date_debut,date_fin_prevue,date_pat,date_evenement_debut,date_evenement_fin,chef_projet_id,charge_affaires_id";

// Non-global métier scopes fail closed until the corresponding scoped reader is implemented.
// This intentionally never widens the existing RLS, notably its historically broad planning policies.
async function requireAllScope(ctx: McpAppContext, cap: string) {
  const { data, error } = await ctx.db.rpc("user_cap_scope", { _cap: cap });
  if (error || data !== "all") throw new ToolError("Cet outil nécessite un accès global à cette section ; accès limité non exposé dans MCP v1.");
}
async function enrichAffaires(ctx: McpAppContext, rows: Row[]): Promise<Row[]> {
  const ids = [...new Set(rows.flatMap(r => [r.chef_projet_id, r.charge_affaires_id]).filter(Boolean))];
  const profiles = ids.length ? await rowsOf(ctx.db.from("profiles").select("id,full_name").in("id", ids)) : [];
  return rows.map(r => ({ ...r, chef_projet: profiles.find(p => p.id === r.chef_projet_id)?.full_name ?? null, charge_affaires: profiles.find(p => p.id === r.charge_affaires_id)?.full_name ?? null }));
}
export async function readData(ctx: McpAppContext, name: ToolName, args: Args): Promise<{ rows: unknown[]; [key: string]: unknown }> {
  const db = ctx.db;
  validateRange(args);
  if (name === "mon_profil") {
    const profile = await rowsOf(db.from("profiles").select("id,full_name,email").eq("id", ctx.userId));
    const roles = await rowsOf(db.from("user_roles").select("role").eq("user_id", ctx.userId));
    return { rows: [{ ...profile[0], roles: roles.map(r => r.role), capabilities: [...ctx.caps].sort() }] };
  }
  if (name === "pipeline_opportunites") {
    let query = db.rpc("list_opportunites_active").select("id,numero,nom,client,charge_affaires_id,statut_opportunite,date_opportunite,last_jalon_etape,next_action_due_le,next_action_text,taille");
    if (!ctx.caps.has("opportunites.read.all")) {
      if (!ctx.caps.has("opportunites.read.mine")) throw new ToolError("Droit commercial insuffisant");
      query = query.eq("charge_affaires_id", ctx.userId);
    }
    if (args.filtre) query = query.eq("statut_opportunite", args.filtre);
    const result = await paged(query.order("date_opportunite", { ascending: false }).order("id"), args);
    return { ...result, rows: result.rows.map(r => ({ ...r, ca_estime_ht: null, urgence: r.next_action_due_le ? r.next_action_due_le < new Date().toISOString().slice(0,10) : false })), unavailable: ["CA estimé non enregistré dans la source pipeline"] };
  }
  if (name === "demandes_clients") {
    await requireAllScope(ctx, "demandes_clients.view");
    let query = db.from("emails_entrants").select("id,source_boite,categorie_ia,received_at,from_name,from_email,opportunite_id,statut").eq("categorie_ia", "opportunite");
    if (args.statut) query = query.eq("statut", args.statut);
    return paged(query.order("received_at", { ascending: false }).order("id"), args);
  }
  if (name === "rechercher_affaires" || name === "echeances" || name === "fiche_affaire") {
    await requireAllScope(ctx, "section.affaires");
    let query = db.from("affaires").select(AFFAIRE_FIELDS).is("archived_at", null);
    if (name === "fiche_affaire") {
      if (Boolean(args.affaire_id) === Boolean(args.numero)) throw new ToolError("Renseignez affaire_id ou numero, exclusivement.");
      query = args.affaire_id ? query.eq("id", args.affaire_id) : query.eq("numero", args.numero);
      const affaires = await enrichAffaires(ctx, await rowsOf(query.limit(1)));
      const affaire = affaires[0]; if (!affaire) throw new ToolError("Affaire inaccessible ou introuvable");
      const detail: Row = { ...affaire };
      if (ctx.caps.has("affaire.equipe.view")) detail.equipe = await rowsOf(pageQuery(db.from("affaire_equipe").select("id,employe_id,phase,role_terrain,employes(nom,prenom)").eq("affaire_id", affaire.id).is("removed_at", null).order("id"), args));
      if (ctx.caps.has("objet.view")) {
        const objets = await rowsOf(pageQuery(db.from("fabrication_objets").select("id,reference,nom,quantite").eq("affaire_id", affaire.id).eq("archive", false).order("id"), args));
        const ids = objets.map(r => r.id);
        const prevues = ids.length ? await bounded(db.from("objet_heures_metier").select("objet_id,metier_id,heures_prevues").in("objet_id", ids)) : [];
        const planning = ids.length ? await bounded(db.from("atelier_planning").select("objet_id,metier_id,nb_pers,date").in("objet_id", ids)) : [];
        // Materialized consolidated view has no RLS: never expose it to scoped callers.
        const reelles = ids.length && ctx.caps.has("heures.audit") ? await bounded(db.from("v_objet_heures_consolidees").select("objet_id,metier_id,heures_reelles").eq("affaire_id", affaire.id).in("objet_id", ids)) : [];
        detail.objets = objets.map(o => ({ ...o, heures_metier: prevues.filter(p => p.objet_id === o.id).map(p => ({ ...p, heures_planifiees: planning.filter(v => v.objet_id === o.id && v.metier_id === p.metier_id).reduce((s,v) => s + Number(v.nb_pers)*8,0), heures_reelles_validees: ctx.caps.has("heures.audit") ? reelles.filter(v => v.objet_id === o.id && v.metier_id === p.metier_id).reduce((s,v) => s+Number(v.heures_reelles),0) : null })) }));
        detail.objets_pagination = { limit: args.limit, cursor: args.cursor, plus: objets.length > args.limit };
      }
      if (ctx.caps.has("devis.view")) detail.devis = await rowsOf(pageQuery(db.from("devis").select("id,numero,libelle,montant_ht,statut").eq("affaire_id", affaire.id).eq("archive", false).order("id"), args));
      if (ctx.caps.has("data.margins")) detail.marge = { disponible: false, raison: "La marge chantier utilise une source distincte non exposée dans MCP v1." };
      detail.currency = "EUR"; detail.amounts = "HT";
      return { rows: [detail] };
    }
    if (name === "echeances") {
      const du = new Date().toISOString().slice(0,10), end = new Date();
      end.setUTCDate(end.getUTCDate() + ({ "14j":14,"1m":31,"3m":92 }[args.fenetre as "14j"|"1m"|"3m"]));
      const au = end.toISOString().slice(0,10);
      const affaires = await bounded(query.neq("statut", "annule").or(`and(date_montage.gte.${du},date_montage.lte.${au}),and(date_demontage.gte.${du},date_demontage.lte.${au})`).order("id"));
      const operations = affaires.flatMap(a => ["montage","demontage"].filter(type => a[`date_${type}`] >= du && a[`date_${type}`] <= au).map(type => ({ affaire_id:a.id,numero:a.numero,nom:a.nom,client:a.client,lieu:a.lieu,type,date:a[`date_${type}`] }))).sort((a,b) => a.date.localeCompare(b.date)||a.affaire_id.localeCompare(b.affaire_id)||a.type.localeCompare(b.type));
      return pageRows(operations,args);
    }
    if (args.q) { const q = args.q.replace(/[^\p{L}\p{N} _-]/gu, " "); query = query.or(`numero.ilike.%${q}%,nom.ilike.%${q}%,client.ilike.%${q}%`); }
    for (const key of ["typologie","statut"]) if (args[key]) query = query.eq(key,args[key]);
    if (args.montage_du) query = query.gte("date_montage",args.montage_du);
    if (args.montage_au) query = query.lte("date_montage",args.montage_au);
    const result = await paged(query.order("numero").order("id"),args);
    return { ...result, rows: await enrichAffaires(ctx,result.rows) };
  }
  if (name === "heures_affaire") {
    await requireAllScope(ctx, "heures.audit");
    const affaires = await rowsOf(db.from("affaires").select("id").eq("id",args.affaire_id).limit(1));
    if (!affaires.length) throw new ToolError("Affaire inaccessible");
    let query = db.from("heures_saisies").select("id,date,employe_id,metier_id,heures_reelles,statut,employes(nom,prenom),metiers(libelle)").eq("affaire_id",args.affaire_id);
    if (args.du) query=query.gte("date",args.du); if (args.au) query=query.lte("date",args.au);
    const result = await paged(query.order("date").order("id"),args);
    const comparaison = ctx.caps.has("devis.view") ? await bounded(db.from("v_devis_consommation").select("devis_id,metier_id,metier,heures_prevues,heures_assignees,heures_reelles_validees,heures_reelles_soumises").eq("affaire_id",args.affaire_id)) : [];
    return { ...result, comparaison_devis: comparaison, comparaison_periode: "total affaire, hors filtre dates" };
  }
  if (name === "charge_atelier") {
    await requireAllScope(ctx, "section.fabrication");
    let query = db.from("atelier_planning").select("id,date,metier_id,nb_pers").gte("date",args.du).lte("date",args.au).gt("nb_pers",0).order("id");
    if (args.metier) query=query.eq("metier_id",args.metier);
    const planning = await bounded(query), metiers = await rowsOf(db.from("metiers").select("id,libelle,capacite_jour").order("id").limit(100));
    const cells = new Map<string, Row>();
    for (const p of planning) { const key=`${p.date}|${p.metier_id}`; const cell=cells.get(key) ?? {date:p.date,metier_id:p.metier_id,charge:0}; cell.charge+=Number(p.nb_pers); cells.set(key,cell); }
    const rows=[...cells.values()].map((c): Row => { const m=metiers.find(m=>m.id===c.metier_id); const niveau=chargeNiveau(c.charge,m?.capacite_jour ?? null); return {...c,metier:m?.libelle,capacite_jour:m?.capacite_jour ?? null,unite:"personnes/jour",statut:({sous:"vert",plein:"ambre",surcharge:"rouge",neutre:"neutre",vide:"vert"}[niveau])}; }).sort((a,b)=>a.date.localeCompare(b.date)||a.metier_id-b.metier_id);
    return pageRows(rows,args);
  }
  await requireAllScope(ctx, "planning.view");
  let query = db.from("assignations").select("id,employe_id,affaire_id,date,demi_journee,employes(nom,prenom),affaires(numero,nom)").gte("date",args.du).lte("date",args.au).order("date").order("id");
  if (args.employe) query=query.eq("employe_id",args.employe);
  const affectations = await bounded(query);
  let absQuery=db.from("absences").select("id,employe_id,date_debut,date_fin,demi_journee").eq("valide",true).lte("date_debut",args.au).gte("date_fin",args.du).order("id");
  if (args.employe) absQuery=absQuery.eq("employe_id",args.employe);
  const absences=await bounded(absQuery);
  const selected = args.affaire ? affectations.filter(a=>a.affaire_id===args.affaire) : affectations;
  const result=pageRows(selected,args);
  const anomalies=result.rows.flatMap(value=>{ const a=value as QuiAffectation; const cell=affectations.filter(b=>b.employe_id===a.employe_id&&b.date===a.date) as QuiAffectation[]; const abs=absences.filter(b=>b.employe_id===a.employe_id&&b.date_debut<=a.date&&b.date_fin>=a.date) as QuiAbsence[]; return [hasDoubleAffectation(cell)?{employe_id:a.employe_id,date:a.date,type:"double_affectation"}:null,hasAffecteAbsent(cell,abs)?{employe_id:a.employe_id,date:a.date,type:"affecte_absent"}:null].filter(Boolean); });
  return { ...result, absences: pageRows(absences,args), anomalies: [...new Map(anomalies.map(a=>[JSON.stringify(a),a])).values()] };
}