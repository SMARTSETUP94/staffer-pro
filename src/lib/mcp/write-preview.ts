import { ToolError } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "./policy";
import type { WriteName } from "./write-schemas";
import { WRITE_CAPS, type WritePreview } from "./write-policy";
import { logisticsRows } from "./v2-read-data";
import { normalizeTypologieArgs } from "./typologie";
import { conflitsVehicules } from "@/lib/logistique/etapes";

const AFFAIRE_FIELDS = "id,numero,nom,client,client_id,phase,charge_affaires_id,date_montage,date_demontage,date_evenement_debut,date_evenement_fin,date_pat,lieu,notes,typologie_future,ca_estime_ht,chef_projet_id,dessinateur_id,statut,statut_opportunite,contact_site_nom,contact_site_tel,montage_nb_techniciens,montage_travail_nuit,montage_nb_semi,montage_nb_20m3,montage_nature_prestation,montage_notes,updated_at";
export async function prepareWrite(context: McpAppContext, tool: WriteName, args: Record<string, unknown>): Promise<WritePreview> {
  args = normalizeTypologieArgs(args);
  const { confirmation_id: _, ...content } = args;
  let payload: Record<string, unknown> = content;
  let before: Record<string, unknown> = {}, after: Record<string, unknown> = content;
  let affaireId: string | undefined, etapeId: string | undefined, snapshot: string | undefined;
  const warnings: string[] = [], duplicates: unknown[] = [];
  const confirming = typeof args.confirmation_id === "string";
  if (tool === "traiter_demande") return prepareTraiterDemande(context, content, confirming);
  if (tool === "creer_opportunite" && Array.isArray(args.email_ids) && !confirming) {
    const mails = await lireDemandes(context, args.email_ids as string[]);
    verifierDemandes(mails, args.email_ids as string[]);
    warnings.push(`${mails.length} demande(s) devis seront rattachées à l’opportunité créée, avec une action « mail reçu » chacune.`);
  }
  if (tool === "creer_opportunite") {
    if (Boolean(args.client_id) === Boolean(args.client_nom)) throw new ToolError("Indiquer soit client_id, soit client_nom");
    const client = args.client_id ? await context.db.from("clients").select("id,nom").eq("id", args.client_id).eq("actif", true).maybeSingle() : await context.db.from("clients").select("id,nom").ilike("nom", String(args.client_nom).replace(/[%_]/g, " ")).eq("actif", true).limit(2);
    if (client.error) throw new ToolError("Vérification client indisponible");
    const clients = Array.isArray(client.data) ? client.data : client.data ? [client.data] : [];
    if (clients.length > 1) throw new ToolError("Plusieurs clients correspondent : utiliser client_id");
    const known = clients[0];
    if (!known) {
      if (args.client_id) throw new ToolError("Client introuvable");
      warnings.push(args.creer_client ? "Création du client incluse dans la confirmation." : "Client inconnu : refaire l’aperçu avec creer_client=true pour inclure sa création.");
    }
    let query = context.db.from("affaires").select("id,numero,nom,date_montage,date_demontage,date_evenement_debut").is("archived_at", null).limit(1000);
    if (known) query = query.eq("client_id", known.id); else query = query.eq("client", args.client_nom);
    const { data, error } = await query;
    if (error || (data?.length ?? 0) >= 1000) throw new ToolError("Vérification doublons indisponible");
    const words = String(args.intitule).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").split(/\W+/).filter(w => w.length > 2);
    duplicates.push(...(data ?? []).filter(a => words.some(w => a.nom.toLowerCase().includes(w)) && (!args.date_evenement || !a.date_evenement_debut || a.date_evenement_debut === args.date_evenement)));
    after = { ...content, numero: "Prochain 9XXX attribué atomiquement à la confirmation", client_existant: known ?? null };
  } else {
    if (args.etape_id) {
      const { data, error } = await context.db.from("affaire_etapes_logistiques").select("id,affaire_id,type,sens,date_debut,date_fin,heure_debut,heure_fin,horaire_libre,lieu_libre,nb_personnes,responsable,vehicule_id,immatriculation_libre,acces,note,commentaire_equipe,statut,updated_at").eq("id", args.etape_id).maybeSingle();
      if (error || !data) throw new ToolError("Étape introuvable ou inaccessible");
      before = data; affaireId = data.affaire_id; etapeId = data.id; snapshot = data.updated_at;
    } else {
      const code = args.code ?? args.numero;
      if (!args.affaire_id && !code) throw new ToolError("Indiquer affaire_id ou numéro/code");
      let query = context.db.from("affaires").select(AFFAIRE_FIELDS).is("archived_at", null);
      query = args.affaire_id ? query.eq("id", args.affaire_id) : query.eq("numero", code);
      const { data, error } = await query.maybeSingle();
      if (error || !data) throw new ToolError("Affaire introuvable ou inaccessible");
      before = data; affaireId = data.id; snapshot = data.updated_at;
      if (["ajouter_action_opportunite", "mettre_a_jour_opportunite"].includes(tool) && data.phase !== "opportunite") throw new ToolError("Opportunité déjà signée : modification commerciale refusée");
    }
    // Read-only rights check: app_assert_affaire_write refuses OAuth callers outside confirmed dispatch.
    const rights = await context.db.rpc("mcp_preview_assert_affaire", { _id: affaireId, _cap: WRITE_CAPS[tool] });
    if (rights.error) throw new ToolError("Accès affaire refusé");
    if (tool === "modifier_chantier" || tool === "mettre_a_jour_opportunite") {
      const patch = { ...(args.champs as Record<string, unknown>) };
      const extra: Record<string, unknown> = {};
      for (const key of ["prochaine_action", "echeance", "jalon", "motif"]) if (key in patch) { extra[key] = patch[key]; delete patch[key]; }
      for (const [source, target] of [["intitule", "nom"], ["description", "notes"], ["date_evenement", "date_evenement_debut"]]) if (source in patch) { patch[target] = patch[source]; delete patch[source]; }
      if (tool === "mettre_a_jour_opportunite" && "statut" in patch) { const statutMap = { en_attente: "a_faire", a_l_etude: "a_l_etude", presque_gagne: "presque_gagne" } as const; patch.statut_opportunite = statutMap[patch.statut as keyof typeof statutMap]; delete patch.statut; if (args.champs && (args.champs as Record<string, unknown>).statut === "en_attente") warnings.push("En attente correspond au statut À faire existant ; le motif est ajouté au journal."); }
      payload = { patch, ...extra }; after = { ...before, ...patch, ...extra };
      if ("date_montage" in patch || "date_demontage" in patch) {
        const [stages, assignments] = await Promise.all([
          context.db.from("affaire_etapes_logistiques").select("id", { count: "exact", head: true }).eq("affaire_id", affaireId).neq("statut", "annule"),
          context.db.from("assignations").select("id", { count: "exact", head: true }).eq("affaire_id", affaireId),
        ]);
        if (stages.error || assignments.error) throw new ToolError("Vérification des impacts indisponible");
        if (stages.count || assignments.count) warnings.push(`Dates modifiées : ${stages.count ?? 0} étape(s) logistique(s), ${assignments.count ?? 0} affectation(s) existantes, aucune ne sera déplacée.`);
      }
      if (extra.jalon) {
        const { data, error } = await context.db.from("opportunite_jalons").select("id").eq("affaire_id", affaireId).eq("etape", extra.jalon).maybeSingle();
        if (error || !data) throw new ToolError("Jalon absent : l’initialiser dans la fiche opportunité avant modification");
      }
    } else if (tool === "creer_etape_logistique") {
      payload = { affaire_id: affaireId, type: args.type, date_debut: args.debut, date_fin: args.fin ?? null, vehicule_id: args.vehicule_id ?? null, immatriculation_libre: args.location_transporteur ?? null, responsable: args.responsable ?? null, commentaire_equipe: args.commentaire ?? null, lieu_libre: args.lieu ?? null, ...(args.cle_externe ? { cle_externe: args.cle_externe } : {}) };
      const hours = args.horaires as Record<string, unknown> | undefined;
      if (hours) Object.assign(payload, { heure_debut: hours.debut ?? null, heure_fin: hours.fin ?? null, horaire_libre: hours.details ?? null });
      // Stable ID-to-name resolution is intentionally not persisted in arguments.
      if (args.responsable_id) throw new ToolError("Le planning stocke un responsable en texte : utiliser responsable, pas responsable_id");
      before = {}; after = payload;
    } else if (tool === "modifier_etape_logistique") { payload = { patch: args.champs }; after = { ...before, ...(args.champs as Record<string, unknown>) }; }
    else if (tool === "deplacer_etape_logistique") {
      payload = { nouveau_debut: args.nouveau_debut, ...(args.nouvelle_fin ? { nouvelle_fin: args.nouvelle_fin } : {}) };
      const duration = before.date_fin ? Date.parse(String(before.date_fin)) - Date.parse(String(before.date_debut)) : 0;
      after = { ...before, date_debut: args.nouveau_debut, date_fin: args.nouvelle_fin ?? (before.date_fin ? new Date(Date.parse(String(args.nouveau_debut)) + duration).toISOString().slice(0, 10) : null) };
    } else if (tool === "annuler_etape_logistique") { payload = { motif: args.motif }; after = { ...before, statut: "annule", commentaire_equipe: args.motif }; }
    else if (tool === "ajouter_action_opportunite") { payload = { type: args.type, note: args.note, ...(args.echeance ? { echeance: args.echeance } : {}) }; after = payload; }
    else if (tool === "ajouter_note_chantier") { payload = { texte: args.texte }; after = payload; }
    else if (tool === "affecter_role_projet") {
      const role = String(args.role);
      const current = await context.db.from("affaire_roles").select("employe_id,date_debut,date_fin,employes(nom,prenom)").eq("affaire_id", affaireId!).eq("role", role).maybeSingle();
      if (current.error) throw new ToolError("Équipe projet indisponible");
      let nouveau: Record<string, unknown> | null = null;
      if (args.employe_id) {
        const emp = await context.db.from("employes").select("id,nom,prenom,actif").eq("id", String(args.employe_id)).maybeSingle();
        if (emp.error || !emp.data || !emp.data.actif) throw new ToolError("Employé introuvable ou inactif");
        nouveau = emp.data;
      }
      const hasDates = "date_debut" in args || "date_fin" in args;
      payload = { role, employe_id: args.employe_id ?? null, date_debut: args.date_debut ?? null, date_fin: args.date_fin ?? null, remplacer_dates: hasDates, ...(args.cle_externe ? { cle_externe: args.cle_externe } : {}) };
      const nom = (e: any) => e ? [e.prenom, e.nom].filter(Boolean).join(" ") : null;
      before = { role, personne: nom(current.data?.employes), date_debut: current.data?.date_debut ?? null, date_fin: current.data?.date_fin ?? null };
      after = { role, personne: nom(nouveau), date_debut: hasDates ? payload.date_debut : before.date_debut, date_fin: hasDates ? payload.date_fin : before.date_fin };
      if (!args.employe_id) warnings.push("Le rôle sera retiré de l'équipe projet.");
    }
  }
  if (after.date_debut && after.date_fin && String(after.date_fin) < String(after.date_debut)) throw new ToolError("La fin précède le début");
  if (after.date_montage && after.date_demontage && String(after.date_demontage) < String(after.date_montage)) throw new ToolError("Le démontage précède le montage");
  if (["creer_etape_logistique", "modifier_etape_logistique", "deplacer_etape_logistique"].includes(tool) && after.vehicule_id) {
    if (!context.caps.has("logistique.planning.view")) throw new ToolError("Droit de lecture planning requis pour vérifier le véhicule");
    const stages = await logisticsRows(context, String(after.date_debut), String(after.date_fin ?? after.date_debut));
    const candidate = { ...after, id: etapeId ?? "__candidate__", affaire_id: after.affaire_id ?? affaireId, statut: after.statut ?? "prevu" } as any;
    const others = stages.filter(e => e.id !== etapeId && e.vehicule_id === after.vehicule_id);
    const flagged = conflitsVehicules([candidate, ...others]);
    const conflicts = flagged.has(candidate.id) ? others.filter(e => flagged.has(e.id)) : [];
    if (conflicts.length) warnings.push(`Conflit véhicule non bloquant avec ${conflicts.length} étape(s) : ${conflicts.map(e => e.id).join(", ")}`);
  }
  if (args.cle_externe) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${context.userId}:${context.clientId}:${String(args.cle_externe)}`));
    const key = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
    const { data, error } = await context.db.from("mcp_write_external_keys").select("result").eq("tool", tool).eq("key_hash", key).maybeSingle();
    if (error) throw new ToolError("Vérification clé externe indisponible");
    if (data) { duplicates.push(data.result); warnings.push("Clé externe déjà utilisée : la confirmation renverra l’enregistrement existant sans création."); }
  }
  return { payload, before, after, affaireId, etapeId, snapshot, warnings, duplicates };
}

type Demande = { id: string; source_boite: string | null; statut: string; subject: string | null; from_name: string | null; from_email: string | null; received_at: string | null; conversation_id: string | null };
async function lireDemandes(context: McpAppContext, ids: string[]): Promise<Demande[]> {
  const { data, error } = await context.db.from("emails_entrants").select("id,source_boite,statut,subject,from_name,from_email,received_at,conversation_id").in("id", ids);
  if (error) throw new ToolError("Lecture des demandes indisponible");
  return (data ?? []) as Demande[];
}
function verifierDemandes(mails: Demande[], demandes: string[]) {
  const ids = new Set(mails.map(m => m.id));
  const manquantes = [...new Set(demandes)].filter(id => !ids.has(id));
  if (manquantes.length) throw new ToolError(`Demande introuvable ou non accessible : ${manquantes.join(", ")}`);
  const horsDevis = mails.filter(m => m.source_boite !== "devis");
  if (horsDevis.length) throw new ToolError(`Refus : demande hors boîte devis (${horsDevis.map(m => m.id).join(", ")}). Rien n’a été écrit.`);
  const traitees = mails.filter(m => m.statut !== "pending_review");
  if (traitees.length) throw new ToolError(`Refus : demande déjà traitée, décision humaine conservée (${traitees.map(m => m.id).join(", ")}). Rien n’a été écrit.`);
}
async function prepareTraiterDemande(context: McpAppContext, content: Record<string, unknown>, confirming: boolean): Promise<WritePreview> {
  const action = content.action as "rattacher" | "ecarter";
  const demandes = content.email_ids as string[];
  if (action === "rattacher" && !content.opportunite_id) throw new ToolError("opportunite_id obligatoire pour rattacher");
  if (action === "rattacher" && content.motif) throw new ToolError("motif réservé à l’écart");
  if (action === "ecarter" && !content.motif) throw new ToolError("motif obligatoire pour écarter (1 à 500 caractères)");
  if (action === "ecarter" && content.opportunite_id) throw new ToolError("Pas d’opportunité pour un écart");
  const resolu = await context.db.rpc("app_demandes_resoudre", { _email_ids: demandes, _inclure_fil: content.inclure_fil === true });
  if (resolu.error || !Array.isArray(resolu.data)) throw new ToolError(resolu.error?.message?.includes("Fil trop long") ? "Fil trop long (plus de 50 demandes)" : "Résolution des demandes indisponible");
  const resolus = [...(resolu.data as string[])].sort();
  const payload = { ...content, email_ids_resolus: resolus };
  // At confirmation, state checks are done under lock by the database (snapshot comparison).
  if (confirming) return { payload, before: {}, after: {}, affaireId: action === "rattacher" ? String(content.opportunite_id) : undefined, warnings: [], duplicates: [] };
  const mails = await lireDemandes(context, resolus);
  verifierDemandes(mails.filter(m => demandes.includes(m.id)), demandes);
  let opportunite: Record<string, unknown> | null = null;
  if (action === "rattacher") {
    const { data, error } = await context.db.from("affaires").select("id,numero,nom,phase,archived_at").eq("id", content.opportunite_id).maybeSingle();
    if (error || !data) throw new ToolError("Opportunité introuvable ou inaccessible");
    if (data.archived_at) throw new ToolError("Opportunité archivée : rattachement refusé");
    if (data.phase !== "opportunite") throw new ToolError("Opportunité déjà signée : rattachement refusé");
    const rights = await context.db.rpc("mcp_preview_assert_affaire", { _id: data.id, _cap: "action.edit_opportunite" });
    if (rights.error) throw new ToolError("Accès affaire refusé");
    opportunite = { id: data.id, numero: data.numero, nom: data.nom };
  }
  const empreinte = await context.db.rpc("mcp_demandes_empreinte", { _ids: resolus, _verrou: false });
  if (empreinte.error || typeof empreinte.data !== "string") throw new ToolError("État des demandes indisponible");
  const liste = mails.sort((a, b) => String(a.received_at).localeCompare(String(b.received_at))).map(m => ({
    id: m.id, sujet: m.subject, expediteur: m.from_name ? `${m.from_name} <${m.from_email ?? ""}>` : m.from_email, recu_le: m.received_at,
    conversation_id: m.conversation_id, ajoute_par_le_fil: !demandes.includes(m.id),
  }));
  const ajoutes = liste.filter(m => m.ajoute_par_le_fil).length;
  const warnings = ajoutes ? [`${ajoutes} demande(s) en attente du même fil ajoutée(s).`] : [];
  const after = action === "rattacher"
    ? { action, opportunite, demandes: liste, actions_mail_recu_prevues: liste.length }
    : { action, motif: content.motif, demandes: liste };
  return { payload, before: {}, after, affaireId: action === "rattacher" ? String(opportunite!.id) : undefined, snapshot: empreinte.data, warnings, duplicates: [] };
}
