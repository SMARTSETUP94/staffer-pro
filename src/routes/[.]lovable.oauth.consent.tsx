import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { CLAUDE_REDIRECT_URIS } from "@/lib/mcp/config";

function allowedCallback(url: string) {
  const target = new URL(url);
  return CLAUDE_REDIRECT_URIS.some(v => new URL(v).origin === target.origin && new URL(v).pathname === target.pathname);
}
export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "" }),
  head: () => ({ meta: [
    { title: "Autoriser Claude — Staffing Setup Paris" }, { name: "description", content: "Autoriser Claude à consulter vos données Staffing en lecture seule." },
    { property: "og:title", content: "Autoriser Claude — Staffing Setup Paris" }, { property: "og:description", content: "Connexion Claude en lecture seule avec vos droits Staffing." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id || search.authorization_id.length > 200) throw new Error("Demande de connexion manquante ou invalide.");
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error("Connexion indisponible. Réessayez.");
    if (!data.session) throw redirect({ to: "/login", search: { next: location.pathname + location.searchStr } });
    const [cap, flag] = await Promise.all([supabase.rpc("user_has_cap", { _cap: "api.mcp" }),supabase.rpc("is_feature_flag_enabled", { _flag_key: "mcp_v1" })]);
    if (cap.error || flag.error || cap.data !== true || flag.data !== true) throw new Error("Votre compte n'est pas autorisé à connecter Claude.");
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.searchStr).get("authorization_id");
    if (!id) throw new Error("Demande manquante.");
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
    if (error || !data) throw new Error("Demande expirée ou indisponible. Recommencez depuis Claude.");
    if ("redirect_url" in data) {
      if (!allowedCallback(data.redirect_url)) throw new Error("Adresse de retour non autorisée.");
      const { data: user } = await supabase.auth.getUser();
      const connections = await supabase.from("mcp_connections").select("client_id").eq("user_id",user.user?.id ?? "").is("revoked_at",null);
      if (connections.error || !connections.data?.length) throw new Error("Autorisation locale absente ; révoquez puis reconnectez Claude.");
      throw redirect({ href: data.redirect_url });
    }
    if (!CLAUDE_REDIRECT_URIS.some(v => v === data.redirect_uri)) throw new Error("Ce client n'utilise pas une adresse Claude autorisée.");
    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError || !user.user) throw new Error("Reconnectez-vous.");
    return { details: data, user: { id:user.user.id,email:user.user.email } };
  },
  pendingComponent: () => <main className="p-8 text-center text-muted-foreground">Vérification de la connexion…</main>,
  errorComponent: ({ error }) => <main className="mx-auto max-w-lg p-8"><h1 className="text-xl font-semibold">Connexion Claude impossible</h1><p role="alert" className="mt-4 text-destructive">{error instanceof Error ? error.message : "Connexion indisponible"}</p><a href="/" className="mt-6 inline-block underline">Retour à Staffing</a></main>,
  component: Consent,
});
function Consent() {
  const { details, user } = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  async function decide(approve: boolean) {
    setBusy(true); setError("");
    try {
      if (approve) {
        const [cap, flag] = await Promise.all([supabase.rpc("user_has_cap",{_cap:"api.mcp"}),supabase.rpc("is_feature_flag_enabled",{_flag_key:"mcp_v1"})]);
        if (cap.error || flag.error || cap.data !== true || flag.data !== true) throw new Error("Accès refusé.");
        const saved = await supabase.from("mcp_connections").upsert({user_id:user.id,client_id:details.client.id,client_name:details.client.name,redirect_uri:details.redirect_uri,authorized_at:new Date().toISOString(),revoked_at:null});
        if (saved.error) throw new Error("Autorisation non enregistrée.");
      }
      const response = approve ? await supabase.auth.oauth.approveAuthorization(authorization_id,{skipBrowserRedirect:true}) : await supabase.auth.oauth.denyAuthorization(authorization_id,{skipBrowserRedirect:true});
      if (response.error || !response.data?.redirect_url) throw new Error(approve ? "Autorisation échouée ; réessayez." : "Annulation échouée ; réessayez.");
      if (!allowedCallback(response.data.redirect_url)) throw new Error("Adresse de retour refusée.");
      window.location.assign(response.data.redirect_url);
    } catch (e) { setError(e instanceof Error ? e.message : "Connexion indisponible."); setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="w-full max-w-xl space-y-6"><BrandLogo/><h1 className="text-2xl font-semibold">Autoriser {details.client.name} à consulter vos données Staffing en lecture</h1><p className="text-muted-foreground">Compte : {user.email}</p><p>Vos droits Staffing continuent de s'appliquer. Aucune modification de chantier, d'heures ou d'email n'est autorisée.</p><div className="border-y border-border py-4"><p className="text-sm font-semibold">Identité partagée</p><p className="mt-1 text-sm text-muted-foreground">{details.scope.split(" ").map(scope => ({openid:"Profil",email:"Adresse email",profile:"Nom"}[scope] ?? `Permission supplémentaire : ${scope}`)).join(" · ")}</p><p className="mt-3 break-all text-xs text-muted-foreground">Retour : {details.redirect_uri}</p></div>{error && <p role="alert" className="text-destructive">{error}</p>}<div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={()=>void decide(true)}>Autoriser la consultation</Button><Button variant="outline" disabled={busy} onClick={()=>void decide(false)}>Refuser</Button></div></div></main>;
}