// Edge function : proxy PDF contrat-intermittent
// Contourne les adblockers qui ciblent les URL signées Supabase Storage longues (ERR_BLOCKED_BY_CLIENT).
// Auth : admin OU employé concerné (contrat.employee_id == user.employes.id).
// Query : ?id=<contrat_id>&v=1|2|3 (default = dernière dispo) &download=0|1
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "content-disposition",
};

const BUCKET = "contrats-intermittents";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const contratId = url.searchParams.get("id");
    const versionRaw = url.searchParams.get("v");
    const download = url.searchParams.get("download") === "1";
    if (!contratId) return new Response("missing id", { status: 400, headers: corsHeaders });

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response("unauthorized", { status: 401, headers: corsHeaders });

    const SB_URL = Deno.env.get("SUPABASE_URL")!;
    const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Identifier user
    const userClient = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return new Response("unauthorized", { status: 401, headers: corsHeaders });
    const userId = userData.user.id;

    // 2. Service client pour lookup + storage download (RLS bypass après check manuel)
    const admin = createClient(SB_URL, SB_SERVICE);

    // 3. Fetch contrat
    const { data: contrat, error: cErr } = await admin
      .from("contrats_intermittents")
      .select("id, employee_id, pdf_v1_url, pdf_v2_url, pdf_v3_url")
      .eq("id", contratId)
      .single();
    if (cErr || !contrat) return new Response("not found", { status: 404, headers: corsHeaders });

    // 4. Auth check : admin OR employé concerné
    let allowed = false;
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    if (roles?.some((r) => r.role === "admin" || r.role === "chef_chantier")) {
      allowed = true;
    } else {
      // employé : son employees.user_id doit matcher
      const { data: emp } = await admin
        .from("employes")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (emp?.id && emp.id === contrat.employee_id) allowed = true;
    }
    if (!allowed) return new Response("forbidden", { status: 403, headers: corsHeaders });

    // 5. Determine version
    let version: 1 | 2 | 3 = 1;
    if (versionRaw === "1" || versionRaw === "2" || versionRaw === "3") {
      version = Number(versionRaw) as 1 | 2 | 3;
    } else {
      if (contrat.pdf_v3_url) version = 3;
      else if (contrat.pdf_v2_url) version = 2;
    }

    // 6. Download from storage via admin
    const path = `${contrat.employee_id}/${contrat.id}/v${version}.pdf`;
    const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(path);
    if (dlErr || !blob) return new Response(`pdf indisponible: ${dlErr?.message ?? "not found"}`, { status: 404, headers: corsHeaders });

    const buf = await blob.arrayBuffer();
    const filename = `contrat-${contratId.slice(0, 8)}-v${version}.pdf`;
    return new Response(buf, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    console.error("contrat-pdf error", e);
    return new Response(`error: ${(e as Error).message}`, { status: 500, headers: corsHeaders });
  }
});
