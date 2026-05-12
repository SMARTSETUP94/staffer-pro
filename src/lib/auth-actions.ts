import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildPasswordResetEmailHtml } from "@/lib/email-templates/password-reset";

// ============================================================================
// markPasswordSet : flag profile après création/skip de password
// ============================================================================
export const markPasswordSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") return { skipped: false };
    const i = input as Record<string, unknown>;
    return { skipped: Boolean(i.skipped) };
  })
  .handler(async ({ data, context }) => {
    try {
      const { userId } = context;
      const nowIso = new Date().toISOString();
      const { error: profileErr } = await supabaseAdmin
        .from("profiles")
        .update({
          password_set_done: true,
          password_set_at: data.skipped ? null : nowIso,
          updated_at: nowIso,
        })
        .eq("id", userId);
      if (profileErr) {
        console.error("[markPasswordSet] profiles update failed", profileErr);
        return { ok: false as const, error: profileErr.message };
      }

      // Marque le rôle comme actif si encore en "invite"
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .update({ status: "actif", activated_at: nowIso })
        .eq("user_id", userId)
        .eq("status", "invite");
      if (roleErr) {
        console.warn("[markPasswordSet] user_roles status update failed (non-blocking)", roleErr);
      }

      return { ok: true as const, skipped: data.skipped };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[markPasswordSet] uncaught", msg);
      return { ok: false as const, error: msg };
    }
  });

// ============================================================================
// sendPasswordReset : génère un recovery link + envoie un email Resend custom
// (PAS de middleware : cette server fn est appelée par un user non connecté)
// ============================================================================
export const sendPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Payload invalide");
    const i = input as Record<string, unknown>;
    const email = String(i.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email invalide");
    const redirectOrigin = String(i.redirectOrigin ?? "").trim();
    if (!/^https?:\/\//.test(redirectOrigin)) throw new Error("Origin invalide");
    return { email, redirectOrigin };
  })
  .handler(async ({ data }) => {
    try {
      const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
        return { ok: false as const, error: "Service email non configuré" };
      }

      // 1. Génère directement le recovery link (source de vérité = auth.users,
      //    pas profiles : évite les faux négatifs quand profiles est désynchro).
      const redirectTo = `${data.redirectOrigin.replace(/\/$/, "")}/auth/reset-password`;
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: data.email,
        options: { redirectTo },
      });
      if (linkErr || !linkData?.properties?.action_link || !linkData?.user) {
        const code = (linkErr as { code?: string } | null)?.code ?? "";
        const msg = (linkErr?.message ?? "").toLowerCase();
        // user_not_found / "User not found" → réponse générique anti-énumération
        if (code === "user_not_found" || msg.includes("user not found") || msg.includes("not found")) {
          return { ok: true as const, sent: false };
        }
        return {
          ok: false as const,
          error: linkErr?.message ?? "Impossible de générer le lien de réinitialisation",
        };
      }

      const targetEmail = linkData.user.email ?? data.email;
      // Best-effort : récupère full_name depuis profiles (sans bloquer si absent)
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", linkData.user.id)
        .maybeSingle();
      const fullName =
        (linkData.user.user_metadata?.full_name as string | undefined) ??
        profile?.full_name ??
        undefined;


      // 3. Envoie l'email via Resend gateway (from onboarding@setup.paris)
      const html = buildPasswordResetEmailHtml({
        fullName,
        resetLink: linkData.properties.action_link,
        expiresInMinutes: 60,
      });

      const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": RESEND_API_KEY,
        },
        body: JSON.stringify({
          from: "Setup Paris <onboarding@setup.paris>",
          to: [targetEmail],
          reply_to: "smart@setup.paris",
          subject: "Réinitialisation de ton mot de passe — Setup Paris",
          html,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        return {
          ok: false as const,
          error: `Échec envoi email Resend [${res.status}]: ${errBody.slice(0, 300)}`,
        };
      }

      let messageId: string | null = null;
      try {
        const body = (await res.json()) as { id?: string };
        messageId = body.id ?? null;
      } catch {
        // ignore
      }

      return { ok: true as const, sent: true, messageId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[sendPasswordReset] uncaught:", msg);
      return { ok: false as const, error: msg };
    }
  });
