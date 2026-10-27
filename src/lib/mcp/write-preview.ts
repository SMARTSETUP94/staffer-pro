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
      if (tool === "mettre_a_jour_opportunite" && "statut" in patch) { patch.statut_opportunite = patch.statut === "en_attente" ? "a_faire" : patch.statut === "presque_gagne" ? "presque_gagne" : "perdu"; delete patch.statut; if (args.champs && (args.champs as Record<string, unknown>).statut === "en_attente") warnings.push("En attente correspond au statut À faire existant ; le motif est ajouté au journal."); }
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