import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { buildInvitationEmailHtml } from "@/lib/email-templates/invitation";

export type AppRoleName = "admin" | "chef_chantier" | "employe";
export type UserStatusName = "invite" | "actif" | "desactive";

type AuthedSupabase = SupabaseClient<Database>;

interface InviteInput {
  email: string;
  fullName?: string;
  roles: AppRoleName[];
  siteUrl?: string;
}

const ALLOWED_ROLES: AppRoleName[] = ["admin", "chef_chantier", "employe"];

const FALLBACK_SITE_URL = "https://staffing.setup.paris";

/** Domaines de prod autorisés à propager leur origin dans le lien d'invitation. */
const ALLOWED_PROD_HOSTS = new Set<string>([
  "staffing.setup.paris",
  "staffer-pro.lovable.app",
]);

function isAllowedProdOrigin(siteUrl: string): boolean {
  try {
    const u = new URL(siteUrl);
    return ALLOWED_PROD_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Retourne l'URL de set-password.
 * HOTFIX : on ignore tout siteUrl qui ne fait PAS partie des domaines prod
 * autorisés (preview Lovable, sandbox, localhost…) pour éviter d'envoyer
 * un lien d'invitation pointant vers un environnement éphémère.
 */
export function resolveSetPasswordRedirect(siteUrl?: string): string {
  const fromEnv = process.env.PUBLIC_SITE_URL?.trim();
  const candidate = siteUrl?.trim();

  let base = FALLBACK_SITE_URL;
  if (candidate && /^https?:\/\//.test(candidate) && isAllowedProdOrigin(candidate)) {
    base = candidate;
  } else if (fromEnv && /^https?:\/\//.test(fromEnv) && isAllowedProdOrigin(fromEnv)) {
    base = fromEnv;
  }
  return `${base.replace(/\/$/, "")}/auth/set-password`;
}

function validateInviteInput(input: unknown): InviteInput {
  if (!input || typeof input !== "object") throw new Error("Payload invalide");
  const i = input as Record<string, unknown>;
  const email = String(i.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email invalide");
  if (email.length > 255) throw new Error("Email trop long");
  const fullName = i.fullName ? String(i.fullName).trim().slice(0, 255) : undefined;
  const roles = Array.isArray(i.roles) ? i.roles : [];
  const cleanRoles = roles
    .map((r) => String(r))
    .filter((r): r is AppRoleName => (ALLOWED_ROLES as string[]).includes(r));
  if (cleanRoles.length === 0) throw new Error("Au moins un rôle est requis");
  const siteUrl = typeof i.siteUrl === "string" ? i.siteUrl : undefined;
  return { email, fullName, roles: Array.from(new Set(cleanRoles)), siteUrl };
}

async function assertCallerIsAdmin(supabase: AuthedSupabase, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  if (error) throw new Error("Erreur vérification rôle : " + error.message);
  if (!data || data.length === 0) {
    throw new Error("Action réservée aux administrateurs");
  }
}

async function sendInvitationEmail(args: {
  email: string;
  fullName?: string;
  roles: AppRoleName[];
  inviteLink: string;
}): Promise<{ messageId: string | null }> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY non configuré");
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY non configuré");

  const html = buildInvitationEmailHtml({
    fullName: args.fullName,
    roles: args.roles,
    inviteLink: args.inviteLink,
  });

  console.info("[sendInvitationEmail] →", { to: args.email, roles: args.roles });
  let res: Response;
  try {
    res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: "Setup Paris <onboarding@setup.paris>",
        to: [args.email],
        reply_to: "smart@setup.paris",
        subject: "Invitation — Staffing by Setup.Paris",
        html,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sendInvitationEmail] fetch threw:", msg);
    throw new Error(`Erreur réseau gateway Resend : ${msg}`);
  }
  const rawBody = await res.text();
  if (!res.ok) {
    console.error("[sendInvitationEmail] Resend KO", { status: res.status, body: rawBody });
    throw new Error(`Échec envoi email Resend [${res.status}]: ${rawBody}`);
  }
  let messageId: string | null = null;
  try {
    const parsed = JSON.parse(rawBody) as { id?: string };
    messageId = parsed.id ?? null;
  } catch {
    // ignore parse errors
  }
  console.info("[sendInvitationEmail] OK", { to: args.email, messageId });
  return { messageId };
}

async function tryAutoLinkEmploye(userId: string, email: string) {
  const { data: emp } = await supabaseAdmin
    .from("employes")
    .select("id")
    .ilike("email", email)
    .is("profile_id", null)
    .limit(1)
    .maybeSingle();
  if (emp?.id) {
    await supabaseAdmin
      .from("employes")
      .update({ profile_id: userId, updated_at: new Date().toISOString() })
      .eq("id", emp.id);
    return emp.id;
  }
  return null;
}

// ============================================================================
// inviteUser
// ============================================================================
export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateInviteInput)
  .handler(async ({ data, context }) => {
    try {
      const { supabase, userId } = context;
      await assertCallerIsAdmin(supabase, userId);

      // 1. Génère le lien d'invitation (crée l'utilisateur s'il n'existe pas)
      // CRITIQUE : redirectTo force l'arrivée sur /auth/set-password (et non /)
      const redirectTo = resolveSetPasswordRedirect(data.siteUrl);
      let { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email: data.email,
        options: {
          redirectTo,
          data: {
            full_name: data.fullName,
            invited: true,
            role: data.roles[0],
          },
        },
      });

      // FALLBACK : si l'email existe déjà dans auth.users, generateLink type=invite
      // échoue ("User already registered" / email_exists). On bascule sur un
      // recovery link (équivalent UX : "définis ton mot de passe / réactive ton compte").
      if (linkErr) {
        const code = (linkErr as { code?: string }).code ?? "";
        const msg = (linkErr.message ?? "").toLowerCase();
        const alreadyExists =
          code === "email_exists" ||
          code === "user_already_exists" ||
          msg.includes("already registered") ||
          msg.includes("already been registered") ||
          msg.includes("already exists");
        if (alreadyExists) {
          console.info("[inviteUser] email already registered, falling back to recovery link");
          const fb = await supabaseAdmin.auth.admin.generateLink({
            type: "recovery",
            email: data.email,
            options: { redirectTo },
          });
          linkData = fb.data;
          linkErr = fb.error;
        }
      }

      if (linkErr || !linkData?.user) {
        return {
          ok: false as const,
          error: linkErr?.message ?? "Échec de la génération du lien d'invitation",
          stage: "generate_link",
        };
      }
      const newUserId = linkData.user.id;
      const inviteLink = linkData.properties?.action_link;
      if (!inviteLink) {
        return { ok: false as const, error: "Lien d'invitation manquant", stage: "generate_link" };
      }

      // 2. Reset les rôles auto-créés + insère les rôles demandés en statut 'invite'
      await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
      const nowIso = new Date().toISOString();
      const rows = data.roles.map((role) => ({
        user_id: newUserId,
        role,
        status: "invite" as const,
        invited_by: userId,
        invited_at: nowIso,
      }));
      const { error: insErr } = await supabaseAdmin.from("user_roles").insert(rows);
      if (insErr) {
        return {
          ok: false as const,
          error: "Compte créé, mais erreur sur les rôles : " + insErr.message,
          stage: "roles",
          userId: newUserId,
        };
      }


      // 3. Auto-lier l'employé matchant (case-insensitive)
      const linkedEmployeId = await tryAutoLinkEmploye(newUserId, data.email);

      // 4. Envoyer l'email Resend
      let messageId: string | null = null;
      try {
        const r = await sendInvitationEmail({
          email: data.email,
          fullName: data.fullName,
          roles: data.roles,
          inviteLink,
        });
        messageId = r.messageId;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur envoi email";
        return {
          ok: false as const,
          error: `Compte créé et rôles attribués, mais ${msg}`,
          stage: "email",
          userId: newUserId,
          linkedEmployeId,
        };
      }

      return {
        ok: true as const,
        success: true,
        userId: newUserId,
        email: data.email,
        linkedEmployeId,
        messageId,
      };
    } catch (e) {
      // Filet de sécurité : ne JAMAIS throw — sinon le client reçoit "[object Response]"
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[inviteUser] uncaught:", msg);
      return { ok: false as const, error: msg, stage: "unexpected" };
    }
  });

// ============================================================================
// resendInvitation : régénère un lien et le renvoie par email
// ============================================================================
export const resendInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Payload invalide");
    const i = input as Record<string, unknown>;
    const targetUserId = String(i.targetUserId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) throw new Error("targetUserId invalide");
    const siteUrl = typeof i.siteUrl === "string" ? i.siteUrl : undefined;
    return { targetUserId, siteUrl };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCallerIsAdmin(supabase, userId);

    // Récupérer l'email + rôles
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", data.targetUserId)
      .single();
    if (pErr || !profile) throw new Error("Utilisateur introuvable");

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.targetUserId);
    const roles = (roleRows ?? []).map((r) => r.role as AppRoleName);
    if (roles.length === 0) throw new Error("L'utilisateur n'a aucun rôle");

    const redirectTo = resolveSetPasswordRedirect(data.siteUrl);
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: profile.email,
      options: { redirectTo },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      throw new Error(linkErr?.message ?? "Impossible de regénérer le lien");
    }

    await sendInvitationEmail({
      email: profile.email,
      fullName: profile.full_name ?? undefined,
      roles,
      inviteLink: linkData.properties.action_link,
    });

    return { success: true, email: profile.email };
  });

// ============================================================================
// updateUserRole : remplace les rôles d'un utilisateur (1 rôle principal)
// ============================================================================
export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Payload invalide");
    const i = input as Record<string, unknown>;
    const targetUserId = String(i.targetUserId ?? "");
    const role = String(i.role ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) throw new Error("targetUserId invalide");
    if (!(ALLOWED_ROLES as string[]).includes(role)) throw new Error("Rôle invalide");
    return { targetUserId, role: role as AppRoleName };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCallerIsAdmin(supabase, userId);

    if (data.targetUserId === userId && data.role !== "admin") {
      throw new Error("Vous ne pouvez pas retirer votre propre rôle admin");
    }

    // Garder le statut courant (premier rôle trouvé) sinon 'actif'
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("status")
      .eq("user_id", data.targetUserId)
      .limit(1)
      .maybeSingle();
    const status = (existing?.status ?? "actif") as UserStatusName;

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.targetUserId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.targetUserId, role: data.role, status });
    if (error) throw new Error("Erreur mise à jour rôle : " + error.message);

    return { success: true };
  });

// ============================================================================
// setUserActive : désactiver / réactiver
// ============================================================================
export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Payload invalide");
    const i = input as Record<string, unknown>;
    const targetUserId = String(i.targetUserId ?? "");
    const active = Boolean(i.active);
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) throw new Error("targetUserId invalide");
    return { targetUserId, active };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCallerIsAdmin(supabase, userId);
    if (data.targetUserId === userId) {
      throw new Error("Vous ne pouvez pas vous désactiver vous-même");
    }

    const newStatus: UserStatusName = data.active ? "actif" : "desactive";
    const { error } = await supabaseAdmin
      .from("user_roles")
      .update({ status: newStatus })
      .eq("user_id", data.targetUserId);
    if (error) throw new Error("Erreur changement statut : " + error.message);

    // Bloquer la connexion via auth.users.banned_until
    const banUntil = data.active ? "none" : "876600h"; // ~100 ans
    await supabaseAdmin.auth.admin.updateUserById(data.targetUserId, {
      ban_duration: banUntil,
    });

    return { success: true };
  });

// ============================================================================
// linkExistingUsers : auto-lie les employés orphelins aux profiles via email
// ============================================================================
export const linkExistingUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertCallerIsAdmin(supabase, userId);

    // Compteurs avant
    const { count: orphelinsAvant } = await supabaseAdmin
      .from("employes")
      .select("id", { count: "exact", head: true })
      .is("profile_id", null)
      .not("email", "is", null);

    // Récupère tous les profiles
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email");
    if (pErr) throw new Error("Erreur lecture profiles : " + pErr.message);

    // Récupère tous les employés orphelins avec email
    const { data: employes, error: eErr } = await supabaseAdmin
      .from("employes")
      .select("id, email")
      .is("profile_id", null)
      .not("email", "is", null);
    if (eErr) throw new Error("Erreur lecture employés : " + eErr.message);

    // Index profiles par email (lower-case)
    const profileByEmail = new Map<string, string>();
    for (const p of profiles ?? []) {
      if (p.email) profileByEmail.set(p.email.trim().toLowerCase(), p.id);
    }

    // Set des profiles déjà liés (pour éviter doublons)
    const { data: linked } = await supabaseAdmin
      .from("employes")
      .select("profile_id")
      .not("profile_id", "is", null);
    const usedProfiles = new Set((linked ?? []).map((r) => r.profile_id as string));

    // Match + update
    let lies = 0;
    const errors: string[] = [];
    const nowIso = new Date().toISOString();
    for (const emp of employes ?? []) {
      if (!emp.email) continue;
      const profileId = profileByEmail.get(emp.email.trim().toLowerCase());
      if (!profileId || usedProfiles.has(profileId)) continue;
      const { error: upErr } = await supabaseAdmin
        .from("employes")
        .update({ profile_id: profileId, updated_at: nowIso })
        .eq("id", emp.id);
      if (upErr) {
        errors.push(`${emp.email}: ${upErr.message}`);
      } else {
        usedProfiles.add(profileId);
        lies++;
      }
    }

    return {
      success: true,
      lies,
      orphelinsAvant: orphelinsAvant ?? 0,
      orphelinsRestants: (orphelinsAvant ?? 0) - lies,
      errors: errors.slice(0, 10),
    };
  });

// ============================================================================
// deleteUser : suppression définitive
// ============================================================================
export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Payload invalide");
    const i = input as Record<string, unknown>;
    const targetUserId = String(i.targetUserId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) throw new Error("targetUserId invalide");
    return { targetUserId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCallerIsAdmin(supabase, userId);
    if (data.targetUserId === userId) {
      throw new Error("Vous ne pouvez pas vous supprimer vous-même");
    }

    // Délier l'employé éventuel
    await supabaseAdmin
      .from("employes")
      .update({ profile_id: null, updated_at: new Date().toISOString() })
      .eq("profile_id", data.targetUserId);

    // Supprimer user_roles + profile (cascade auth.users)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.targetUserId);
    const { error: delAuthErr } = await supabaseAdmin.auth.admin.deleteUser(data.targetUserId);
    if (delAuthErr) throw new Error("Erreur suppression utilisateur : " + delAuthErr.message);

    return { success: true };
  });

// ============================================================================
// updateUserFullName : édition inline du nom complet sur /parametres/utilisateurs
// ============================================================================
export const updateUserFullName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Payload invalide");
    const i = input as Record<string, unknown>;
    const targetUserId = String(i.targetUserId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) throw new Error("targetUserId invalide");
    const raw = typeof i.fullName === "string" ? i.fullName.trim() : "";
    const fullName = raw.length === 0 ? null : raw.slice(0, 120);
    return { targetUserId, fullName };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCallerIsAdmin(supabase, userId);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName, updated_at: new Date().toISOString() })
      .eq("id", data.targetUserId);
    if (error) throw new Error("Erreur mise à jour nom : " + error.message);

    // Sync user_metadata.full_name pour cohérence
    try {
      await supabaseAdmin.auth.admin.updateUserById(data.targetUserId, {
        user_metadata: { full_name: data.fullName ?? "" },
      });
    } catch (e) {
      console.warn("[updateUserFullName] sync user_metadata échec:", e);
    }

    return { success: true, fullName: data.fullName };
  });

