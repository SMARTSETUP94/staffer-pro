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

    // 1. Générer un lien d'invitation (sans envoyer l'email Supabase par défaut)
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: data.email,
      options: {
        data: data.fullName ? { full_name: data.fullName } : undefined,
      },
    });
    if (linkErr || !linkData?.user) {
      throw new Error(linkErr?.message ?? "Échec de la génération du lien d'invitation");
    }

    const newUserId = linkData.user.id;
    const inviteLink = linkData.properties?.action_link;
    if (!inviteLink) {
      throw new Error("Lien d'invitation manquant");
    }

    // 2. Nettoyer les rôles par défaut + insérer les rôles demandés
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
    const rows = data.roles.map((role) => ({ user_id: newUserId, role }));
    const { error: insErr } = await supabaseAdmin.from("user_roles").insert(rows);
    if (insErr) throw new Error("Utilisateur créé, mais erreur sur les rôles : " + insErr.message);

    // 3. Envoyer l'email d'invitation custom via Resend (gateway Lovable)
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY non configuré");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY non configuré");

    const greeting = data.fullName ? `Bonjour ${data.fullName},` : "Bonjour,";
    const rolesLabel = data.roles
      .map((r) => (r === "admin" ? "Admin" : r === "chef_chantier" ? "Chef d'équipe" : "Employé"))
      .join(", ");

    const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">Bienvenue sur Setup Paris — Planning chantiers</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">${greeting}</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">
      Vous avez été invité(e) à rejoindre l'application de planning chantiers avec le(s) rôle(s) suivant(s) :
      <strong>${rolesLabel}</strong>.
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.55;">
      Cliquez sur le bouton ci-dessous pour définir votre mot de passe et accéder à l'application :
    </p>
    <p style="text-align:center;margin:0 0 28px;">
      <a href="${inviteLink}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">
        Activer mon compte
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.5;">
      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
    </p>
    <p style="margin:0 0 24px;font-size:12px;color:#6b7280;word-break:break-all;">${inviteLink}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      Ce lien est valable une seule fois. Si vous n'attendiez pas cette invitation, ignorez cet email.
    </p>
  </div>
</body></html>`;

    const resendRes = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: "Setup Paris <onboarding@resend.dev>",
        to: [data.email],
        subject: "Invitation — Planning chantiers Setup Paris",
        html,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      throw new Error(
        `Utilisateur créé, mais échec de l'envoi de l'email Resend [${resendRes.status}]: ${errBody}`,
      );
    }

    return { success: true, userId: newUserId, email: data.email };
  });
