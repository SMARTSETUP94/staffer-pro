/**
 * v0.36 — Seed idempotent comptes E2E.
 *
 * Crée/réactive 3 comptes test + 1 affaire chef + 1 assignation employé semaine en cours.
 *
 * Variables d'env requises (ne JAMAIS pointer vers la prod) :
 *   E2E_SUPABASE_URL                 # ex https://znwffztmdgsshuvvzsvq.supabase.co
 *   E2E_SUPABASE_SERVICE_ROLE_KEY    # service_role pour bypass RLS + auth admin
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *   E2E_CHEF_EMAIL  / E2E_CHEF_PASSWORD
 *   E2E_EMPLOYE_EMAIL / E2E_EMPLOYE_PASSWORD
 *
 * Usage : `bun run e2e/seed.ts`
 */
import { createClient } from "@supabase/supabase-js";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[seed] env manquant : ${name}`);
  return v;
}

const url = req("E2E_SUPABASE_URL");
const serviceKey = req("E2E_SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type RoleName =
  | "admin"
  | "chef_chantier"
  | "employe"
  | "chef_metier_scoped"
  | "commercial"
  | "bureau_etude"
  | "atelier_chef"
  | "rh"
  | "atelier_metier"
  | "logistique"
  | "poseur";

interface Seed {
  email: string;
  password: string;
  role: RoleName;
  fullName: string;
  prenom: string;
  nom: string;
  /** v0.44.4 — pour chef_metier_scoped : id du métier auquel le chef est rattaché.
   *  Si non fourni, on prend le premier métier disponible. */
  metierOrdre?: number;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const seeds: Seed[] = [
  {
    email: req("E2E_ADMIN_EMAIL"),
    password: req("E2E_ADMIN_PASSWORD"),
    role: "admin",
    fullName: "E2E Admin",
    prenom: "E2E",
    nom: "Admin",
  },
  {
    email: req("E2E_CHEF_EMAIL"),
    password: req("E2E_CHEF_PASSWORD"),
    role: "chef_chantier",
    fullName: "E2E Chef",
    prenom: "E2E",
    nom: "Chef",
  },
  {
    email: req("E2E_EMPLOYE_EMAIL"),
    password: req("E2E_EMPLOYE_PASSWORD"),
    role: "employe",
    fullName: "E2E Employé",
    prenom: "E2E",
    nom: "Employé",
  },
  // v0.44.4 — Chef scopé par métier (peinture par défaut).
  // Si les vars E2E_CHEF_SCOPED_* ne sont pas définies, on dérive du chef global.
  {
    email: optional("E2E_CHEF_SCOPED_EMAIL", "e2e-chef-scoped@staffer.test"),
    password: optional("E2E_CHEF_SCOPED_PASSWORD", "Chef-Scoped-E2E-2026!"),
    role: "chef_metier_scoped",
    fullName: "E2E Chef Scopé",
    prenom: "E2E",
    nom: "ChefScoped",
    metierOrdre: 3, // peinture
  },
  // Lot 8.2b — 3 comptes test pour matrice Fiche Objet (commercial / BE / atelier_chef).
  {
    email: optional("E2E_COMMERCIAL_EMAIL", "test_commercial@setupparis.test"),
    password: optional("E2E_COMMERCIAL_PASSWORD", "Commercial-E2E-2026!"),
    role: "commercial",
    fullName: "E2E Commercial",
    prenom: "E2E",
    nom: "Commercial",
  },
  {
    email: optional("E2E_BUREAU_ETUDE_EMAIL", "test_bureau_etude@setupparis.test"),
    password: optional("E2E_BUREAU_ETUDE_PASSWORD", "BureauEtude-E2E-2026!"),
    role: "bureau_etude",
    fullName: "E2E Bureau d'étude",
    prenom: "E2E",
    nom: "BureauEtude",
  },
  {
    email: optional("E2E_ATELIER_CHEF_EMAIL", "test_atelier_chef@setupparis.test"),
    password: optional("E2E_ATELIER_CHEF_PASSWORD", "AtelierChef-E2E-2026!"),
    role: "atelier_chef",
    fullName: "E2E Atelier Chef",
    prenom: "E2E",
    nom: "AtelierChef",
  },
  // L5-B clôture — 4 rôles manquants pour matrice complète.
  {
    email: optional("E2E_RH_EMAIL", "rh.test@setup-paris.fr"),
    password: optional("E2E_RH_PASSWORD", "Rh-E2E-2026!"),
    role: "rh",
    fullName: "E2E RH",
    prenom: "E2E",
    nom: "Rh",
  },
  {
    email: optional("E2E_ATELIER_METIER_EMAIL", "atelier_metier.test@setup-paris.fr"),
    password: optional("E2E_ATELIER_METIER_PASSWORD", "AtelierMetier-E2E-2026!"),
    role: "atelier_metier",
    fullName: "E2E Atelier Métier",
    prenom: "E2E",
    nom: "AtelierMetier",
  },
  {
    email: optional("E2E_LOGISTIQUE_EMAIL", "logistique.test@setup-paris.fr"),
    password: optional("E2E_LOGISTIQUE_PASSWORD", "Logistique-E2E-2026!"),
    role: "logistique",
    fullName: "E2E Logistique",
    prenom: "E2E",
    nom: "Logistique",
  },
  {
    email: optional("E2E_POSEUR_EMAIL", "poseur.test@setup-paris.fr"),
    password: optional("E2E_POSEUR_PASSWORD", "Poseur-E2E-2026!"),
    role: "poseur",
    fullName: "E2E Poseur",
    prenom: "E2E",
    nom: "Poseur",
  },
];

async function ensureUser(s: Seed): Promise<string> {
  // listUsers paginé jusqu'à trouver l'email
  let page = 1;
  let foundId: string | null = null;
  while (page < 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === s.email.toLowerCase());
    if (u) {
      foundId = u.id;
      break;
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  if (foundId) {
    // Reset password + email_confirm pour idempotence
    const { error } = await admin.auth.admin.updateUserById(foundId, {
      password: s.password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`[seed] ${s.email} : user existant, password reset`);
    return foundId;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: s.email,
    password: s.password,
    email_confirm: true,
    user_metadata: { full_name: s.fullName },
  });
  if (error) throw error;
  console.log(`[seed] ${s.email} : user créé ${data.user.id}`);
  return data.user.id;
}

async function ensureProfile(userId: string, s: Seed) {
  const { error } = await admin
    .from("profiles")
    .upsert(
      { id: userId, email: s.email, full_name: s.fullName },
      { onConflict: "id" },
    );
  if (error) throw error;
}

async function ensureRole(userId: string, role: RoleName) {
  // Idempotent : delete + insert sur (user_id, role) UNIQUE
  const { error: delErr } = await admin
    .from("user_roles")
    .delete()
    .eq("user_id", userId);
  if (delErr) throw delErr;
  const { error } = await admin.from("user_roles").insert({ user_id: userId, role });
  if (error) throw error;
}

async function ensureEmploye(userId: string, s: Seed): Promise<string> {
  const { data: existing } = await admin
    .from("employes")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  if (existing) return existing.id;
  // Récupérer un metier_principal_id valide.
  // Si le seed précise metierOrdre, on le respecte ; sinon premier dispo.
  let metierQuery = admin.from("metiers").select("id").order("ordre").limit(1);
  if (s.metierOrdre !== undefined) {
    metierQuery = admin
      .from("metiers")
      .select("id")
      .eq("ordre", s.metierOrdre)
      .limit(1);
  }
  const { data: metiers, error: mErr } = await metierQuery;
  if (mErr) throw mErr;
  const metierId = metiers?.[0]?.id ?? 1;
  const { data, error } = await admin
    .from("employes")
    .insert({
      profile_id: userId,
      prenom: s.prenom,
      nom: s.nom,
      email: s.email,
      type_contrat: "CDI",
      metier_principal_id: metierId,
      actif: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function ensureChefAffaire(
  chefUserId: string,
  numero = "5E2E1",
  nom = "E2E Affaire Chef",
): Promise<string> {
  const { data: existing } = await admin
    .from("affaires")
    .select("id")
    .eq("numero", numero)
    .maybeSingle();
  if (existing) {
    await admin
      .from("affaires")
      .update({ chef_chantier_id: chefUserId })
      .eq("id", existing.id);
    return existing.id;
  }
  const { data, error } = await admin
    .from("affaires")
    .insert({
      numero,
      nom,
      client: "E2E Test",
      statut: "en_cours",
      phase: "signe",
      chef_chantier_id: chefUserId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function ensureAssignationSemaine(employeId: string, affaireId: string) {
  // Lundi de la semaine en cours
  const today = new Date();
  const dow = today.getUTCDay();
  const diffToMon = ((dow + 6) % 7);
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - diffToMon);
  const dateISO = monday.toISOString().slice(0, 10);

  const { data: existing } = await admin
    .from("assignations")
    .select("id")
    .eq("employe_id", employeId)
    .eq("affaire_id", affaireId)
    .eq("date", dateISO)
    .maybeSingle();
  if (existing) {
    console.log(`[seed] assignation E2E déjà présente ${dateISO}`);
    return;
  }
  const { error } = await admin.from("assignations").insert({
    employe_id: employeId,
    affaire_id: affaireId,
    date: dateISO,
    demi_journee: "journee",
    heures: 8,
  });
  if (error) throw error;
  console.log(`[seed] assignation employé E2E créée ${dateISO}`);
}

async function main() {
  const userIds: Record<RoleName, string> = {} as never;
  for (const s of seeds) {
    const id = await ensureUser(s);
    await ensureProfile(id, s);
    await ensureRole(id, s.role);
    userIds[s.role] = id;
  }
  // Employés (chef global + employe + chef scopé)
  const chefEmpId = await ensureEmploye(userIds.chef_chantier, seeds[1]);
  const empId = await ensureEmploye(userIds.employe, seeds[2]);
  const chefScopedEmpId = await ensureEmploye(userIds.chef_metier_scoped, seeds[3]);
  // Affaire chef global (5E2E1)
  const affaireId = await ensureChefAffaire(userIds.chef_chantier);
  console.log(`[seed] chef global employe=${chefEmpId} affaire=${affaireId}`);
  // Affaire chef scopé (5E2E2) — distincte pour vérifier le filtre app-side
  const affaireScopedId = await ensureChefAffaire(
    userIds.chef_metier_scoped,
    "5E2E2",
    "E2E Affaire Chef Scopé",
  );
  console.log(
    `[seed] chef scopé employe=${chefScopedEmpId} affaire=${affaireScopedId}`,
  );
  // Assignation employé sur cette semaine (sur l'affaire chef global)
  await ensureAssignationSemaine(empId, affaireId);

  // Lot 8.2b — Activer le flag fiche_objet_v1 pour tous les comptes test.
  // L'admin & le chef ont besoin du flag pour voir le lien "Voir fiche" sur la page Fab.
  // Commercial / BE / atelier_chef en ont besoin pour ouvrir la fiche elle-même.
  await enableFeatureFlagForUsers("fiche_objet_v1", [
    userIds.admin,
    userIds.chef_chantier,
    userIds.commercial,
    userIds.bureau_etude,
    userIds.atelier_chef,
  ]);
  console.log("[seed] OK");
}

async function enableFeatureFlagForUsers(flagKey: string, userIds: string[]) {
  const { data: existing, error: selErr } = await admin
    .from("feature_flags")
    .select("flag_key, enabled_for_user_ids")
    .eq("flag_key", flagKey)
    .maybeSingle();
  if (selErr) throw selErr;
  const current = new Set<string>(
    (existing?.enabled_for_user_ids as string[] | null) ?? [],
  );
  for (const id of userIds) current.add(id);
  const next = Array.from(current);
  const { error } = await admin
    .from("feature_flags")
    .update({ enabled_for_user_ids: next })
    .eq("flag_key", flagKey);
  if (error) throw error;
  console.log(`[seed] flag ${flagKey} → ${userIds.length} test users autorisés`);
}

main().catch((e) => {
  console.error("[seed] FAIL", e);
  process.exit(1);
});
