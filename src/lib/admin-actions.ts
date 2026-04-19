import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AppRoleName = "admin" | "chef_chantier" | "employe";

interface InviteInput {
  email: string;
  fullName?: string;
  roles: AppRoleName[];
}

function validateInput(input: unknown): InviteInput {
  if (!input || typeof input !== "object") throw new Error("Payload invalide");
  const i = input as Record<string, unknown>;
  const email = String(i.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email invalide");
  if (email.length > 255) throw new Error("Email trop long");
  const fullName = i.fullName ? String(i.fullName).trim().slice(0, 255) : undefined;
  const roles = Array.isArray(i.roles) ? i.roles : [];
  const allowed: AppRoleName[] = ["admin", "chef_chantier", "employe"];
  const cleanRoles = roles
    .map((r) => String(r))
    .filter((r): r is AppRoleName => (allowed as string[]).includes(r));
  if (cleanRoles.length === 0) throw new Error("Au moins un rôle est requis");
  return { email, fullName, roles: Array.from(new Set(cleanRoles)) };
}

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Vérifier que le caller est admin
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    if (roleErr) throw new Error("Erreur vérification rôle : " + roleErr.message);
    if (!roleRows || roleRows.length === 0) {
      throw new Error("Action réservée aux administrateurs");
    }

    // Inviter via admin API
    const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      {
        data: data.fullName ? { full_name: data.fullName } : undefined,
      },
    );
    if (inviteErr || !invited?.user) {
      throw new Error(inviteErr?.message ?? "Échec de l'invitation");
    }

    const newUserId = invited.user.id;

    // Le trigger handle_new_user crée le profil + rôle 'employe' par défaut.
    // On nettoie pour ne garder que les rôles demandés.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);

    const rows = data.roles.map((role) => ({ user_id: newUserId, role }));
    const { error: insErr } = await supabaseAdmin.from("user_roles").insert(rows);
    if (insErr) throw new Error("Utilisateur invité, mais erreur sur les rôles : " + insErr.message);

    return { success: true, userId: newUserId, email: data.email };
  });
