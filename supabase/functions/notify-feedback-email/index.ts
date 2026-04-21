// Edge function : envoi email Resend aux admins à chaque nouveau signalement
// Déclenché côté client après insert réussi dans la table feedbacks.
// CORS : autorisé pour l'app (pas besoin d'auth — appel public mais payload vérifié contre la DB).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TYPE_LABEL: Record<string, string> = {
  bug: "🐛 Bug",
  idee: "💡 Idée",
  amelioration: "🎯 Amélioration",
  question: "❓ Question",
};

const PRIO_LABEL: Record<string, string> = {
  basse: "🟢 Basse",
  moyenne: "🟡 Moyenne",
  haute: "🟠 Haute",
  critique: "🔴 Critique",
};

const PRIO_COLOR: Record<string, string> = {
  basse: "#6b7280",
  moyenne: "#d97706",
  haute: "#ea580c",
  critique: "#dc2626",
};

interface Payload {
  feedback_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!RESEND_API_KEY) {
      console.error("[notify-feedback-email] RESEND_API_KEY manquant");
      return new Response(JSON.stringify({ error: "RESEND_API_KEY manquant" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { feedback_id } = (await req.json()) as Payload;
    if (!feedback_id) {
      return new Response(JSON.stringify({ error: "feedback_id requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role : on récupère le feedback + son auteur + la liste des admins
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: fb, error: fbErr } = await admin
      .from("feedbacks")
      .select("id, type, priorite, titre, description, page_url, created_at, author_id")
      .eq("id", feedback_id)
      .maybeSingle();

    if (fbErr || !fb) {
      console.error("[notify-feedback-email] feedback introuvable", fbErr);
      return new Response(JSON.stringify({ error: "Signalement introuvable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: author } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", fb.author_id)
      .maybeSingle();

    // Récupérer les emails des admins
    const { data: adminRoles, error: rolesErr } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .eq("status", "actif");

    if (rolesErr || !adminRoles?.length) {
      console.warn("[notify-feedback-email] aucun admin actif");
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminIds = adminRoles.map((r) => r.user_id);
    const { data: adminProfiles } = await admin
      .from("profiles")
      .select("email")
      .in("id", adminIds);

    const recipients = (adminProfiles ?? [])
      .map((p) => p.email)
      .filter((e): e is string => !!e && e.includes("@"));

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const typeLabel = TYPE_LABEL[fb.type] ?? fb.type;
    const prioLabel = PRIO_LABEL[fb.priorite] ?? fb.priorite;
    const prioColor = PRIO_COLOR[fb.priorite] ?? "#6b7280";
    const authorLabel = author?.full_name || author?.email || "Quelqu'un";
    const adminUrl = "https://staffing.setup.paris/admin/feedback";

    const subject = `[Setup Staffing] ${typeLabel} — ${fb.titre}`;
    const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f7f4ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0a0a0b;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#2A2A8C;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0;">
      <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.8;">Setup Paris · Staffing</div>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:600;">Nouveau signalement</h1>
    </div>
    <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e5e8;border-top:none;">
      <div style="display:inline-block;padding:4px 10px;background:${prioColor};color:#fff;border-radius:6px;font-size:12px;font-weight:600;margin-bottom:12px;">
        ${prioLabel}
      </div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:4px;">${typeLabel}</div>
      <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;">${escapeHtml(fb.titre)}</h2>
      <div style="background:#f7f4ef;padding:14px;border-radius:8px;font-size:14px;line-height:1.5;white-space:pre-wrap;margin-bottom:20px;">${escapeHtml(fb.description)}</div>
      <table style="width:100%;font-size:13px;color:#374151;">
        <tr><td style="padding:4px 0;color:#6b7280;width:120px;">Signalé par</td><td>${escapeHtml(authorLabel)}</td></tr>
        ${fb.page_url ? `<tr><td style="padding:4px 0;color:#6b7280;">Page</td><td style="font-family:monospace;font-size:12px;">${escapeHtml(fb.page_url)}</td></tr>` : ""}
        <tr><td style="padding:4px 0;color:#6b7280;">Date</td><td>${new Date(fb.created_at).toLocaleString("fr-FR")}</td></tr>
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="${adminUrl}" style="display:inline-block;background:#2A2A8C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          Voir dans l'admin →
        </a>
      </div>
    </div>
    <div style="text-align:center;margin-top:16px;font-size:11px;color:#9ca3af;">
      Email automatique · Setup Paris Staffing
    </div>
  </div>
</body>
</html>`.trim();

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Setup Staffing <signalement@notify.setup.paris>",
        to: recipients,
        subject,
        html,
        reply_to: author?.email ?? undefined,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("[notify-feedback-email] Resend error", resp.status, txt);
      // Fallback : essayer avec l'expéditeur Resend par défaut
      const fallback = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Setup Staffing <onboarding@resend.dev>",
          to: recipients,
          subject,
          html,
        }),
      });
      if (!fallback.ok) {
        const fbTxt = await fallback.text();
        return new Response(
          JSON.stringify({ error: "Resend failed", details: fbTxt }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[notify-feedback-email] exception", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
