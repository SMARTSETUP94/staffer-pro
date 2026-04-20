import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AppRoleName = "admin" | "chef_chantier" | "employe";
export type UserStatusName = "invite" | "actif" | "desactive";

interface InviteInput {
  email: string;
  fullName?: string;
  roles: AppRoleName[];
}

const ALLOWED_ROLES: AppRoleName[] = ["admin", "chef_chantier", "employe"];

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
  return { email, fullName, roles: Array.from(new Set(cleanRoles)) };
}

async function assertCallerIsAdmin(supabase: ReturnType<typeof getCtxSupabase>, userId: string) {
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
type SupabaseFromCtx = Parameters<typeof requireSupabaseAuth.server>[0] extends never
  ? never
  : never;
function getCtxSupabase(): never {
  // type helper only — never called
  throw new Error("type-helper");
}
void getCtxSupabase;

function inviteEmailHtml(opts: {
  greeting: string;
  rolesLabel: string;
  inviteLink: string;
}) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">Bienvenue sur Setup Paris — Planning chantiers</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">${opts.greeting}</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">
      Vous avez été invité(e) à rejoindre l'application de planning chantiers avec le(s) rôle(s) suivant(s) :
      <strong>${opts.rolesLabel}</strong>.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.55;">
      Cliquez sur le bouton ci-dessous pour définir votre mot de passe et accéder à l'application :
    </p>
    <p style="text-align:center;margin:0 0 28px;">
      <a href="${opts.inviteLink}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">
        Activer mon compte
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.5;">
      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
    </p>
    <p style="margin:0 0 24px;font-size:12px;color:#6b7280;word-break:break-all;">${opts.inviteLink}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      Ce lien est valable une seule fois. Si vous n'attendiez pas cette invitation, ignorez cet email.
    </p>
  </div>
</body></html>`;
}

function rolesLabel(roles: AppRoleName[]) {
  return roles
    .map((r) => (r === "admin" ? "Admin" : r === "chef_chantier" ? "Chef d'équipe" : "Employé"))
    .join(", ");
}

async function sendInvitationEmail(args: {
  email: string;
  fullName?: string;
  roles: AppRoleName[];
  inviteLink: string;
}) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY non configuré");
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY non configuré");

  const greeting = args.fullName ? `Bonjour ${args.fullName},` : "Bonjour,";
  const html = inviteEmailHtml({
    greeting,
    rolesLabel: rolesLabel(args.roles),
    inviteLink: args.inviteLink,
  });

  const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": RESEND_API_KEY,
    },
    body: JSON.stringify({
      from: "Setup Paris <onboarding@resend.dev>",
      to: [args.email],
      subject: "Invitation — Planning chantiers Setup Paris",
      html,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Échec envoi email Resend [${res.status}]: ${errBody}`);
  }
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
    const { supabase, userId } = context;
    await assertCallerIsAdmin(supabase, userId);

    // 1. Générer le lien d'invitation (crée l'utilisateur s'il n'existe pas)
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: data.email,
      options: {
        data: {
          full_name: data.fullName,
          invited: true,
          role: data.roles[0],
        },
      },
    });
    if (linkErr || !linkData?.user) {
      throw new Error(linkErr?.message ?? "Échec de la génération du lien d'invitation");
    }
    const newUserId = linkData.user.id;
    const inviteLink = linkData.properties?.action_link;
    if (!inviteLink) throw new Error("Lien d'invitation manquant");

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
    if (insErr) throw new Error("Compte créé, mais erreur sur les rôles : " + insErr.message);

    // 3. Auto-lier l'employé matchant (case-insensitive)
    const linkedEmployeId = await tryAutoLinkEmploye(newUserId, data.email);

    // 4. Envoyer l'email Resend
    try {
      await sendInvitationEmail({
        email: data.email,
        fullName: data.fullName,
        roles: data.roles,
        inviteLink,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur envoi email";
      throw new Error(`Compte créé et rôles attribués, mais ${msg}`);
    }

    return { success: true, userId: newUserId, email: data.email, linkedEmployeId };
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
    return { targetUserId };
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

    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: profile.email,
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
