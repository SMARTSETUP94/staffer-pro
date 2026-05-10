// Tour 2 — Edge function notify-contrat-email
// Envoie 3 templates via Resend : nouveau contrat / signé employé / signé final + PJ PDF
// Nécessite secret RESEND_API_KEY (à configurer si non présent — sinon log no-op)
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  kind: "new_contract" | "employee_signed" | "fully_signed";
  contrat_id: string;
}

const SUBJECTS: Record<Body["kind"], string> = {
  new_contract: "Nouveau contrat à signer — Setup Paris",
  employee_signed: "Contrat signé par l'employé — à contre-signer",
  fully_signed: "Votre contrat signé par les deux parties",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { kind, contrat_id } = (await req.json()) as Body;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: c, error } = await supabase
      .from("contrats_intermittents")
      .select(`
        id, date_debut, date_fin, pdf_v1_url, pdf_v2_url, pdf_v3_url,
        employes:employee_id ( nom, prenom, email ),
        affaires:chantier_id ( numero, nom )
      `)
      .eq("id", contrat_id)
      .single();
    if (error || !c) throw new Error(error?.message ?? "Contrat introuvable");

    // Détermine destinataire(s) selon le kind
    let to: string[] = [];
    let pdfUrl: string | null = null;

    if (kind === "new_contract") {
      to = c.employes?.email ? [c.employes.email] : [];
      pdfUrl = c.pdf_v1_url;
    } else if (kind === "employee_signed") {
      // Récup admins
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id, profiles:user_id ( email )")
        .eq("role", "admin");
      to = (admins ?? [])
        .map((a: { profiles: { email?: string } | null }) => a.profiles?.email)
        .filter((e): e is string => !!e);
      pdfUrl = c.pdf_v2_url;
    } else {
      to = c.employes?.email ? [c.employes.email] : [];
      pdfUrl = c.pdf_v3_url;
    }

    if (to.length === 0) {
      return new Response(JSON.stringify({ ok: false, reason: "no_recipient" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!RESEND_API_KEY) {
      console.log("[notify-contrat-email] RESEND_API_KEY absent, skip", { kind, to });
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = `
      <h2>${SUBJECTS[kind]}</h2>
      <p>Bonjour ${c.employes?.prenom ?? ""},</p>
      <p>Concernant le contrat <strong>${c.affaires?.numero} — ${c.affaires?.nom}</strong>
      du ${c.date_debut} au ${c.date_fin}.</p>
      ${kind === "new_contract" ? "<p>Merci de signer votre contrat dans l'application Staffer-Pro.</p>" : ""}
      ${kind === "employee_signed" ? "<p>Le contrat est en attente de votre contre-signature.</p>" : ""}
      ${kind === "fully_signed" ? "<p>Votre contrat est signé. Le PDF final est joint.</p>" : ""}
      ${pdfUrl ? `<p><a href="${pdfUrl}">Consulter le PDF</a></p>` : ""}
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Setup Paris <onboarding@resend.dev>",
        to,
        subject: SUBJECTS[kind],
        html,
      }),
    });
    const result = await res.json();

    return new Response(JSON.stringify({ ok: res.ok, result }), {
      status: res.ok ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-contrat-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
