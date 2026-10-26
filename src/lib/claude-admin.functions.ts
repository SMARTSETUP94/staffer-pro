import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listClaudeClients = createServerFn({method:"GET"}).middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({page:z.number().int().min(1).max(100).default(1)}).parse(input))
  .handler(async ({data,context})=>{
    const cap = await context.supabase.rpc("user_has_cap",{_cap:"api.mcp"});
    const admin = await context.supabase.rpc("is_admin");
    if(cap.error||admin.error||cap.data!==true||admin.data!==true) throw new Error("Accès refusé");
    const {supabaseAdmin} = await import("@/integrations/supabase/client.server");
    const result=await supabaseAdmin.auth.admin.oauth.listClients({page:data.page,perPage:25});
    if(result.error) throw new Error("Liste des clients indisponible");
    return {clients:result.data.clients.map(c=>({client_id:c.client_id,client_name:c.client_name,redirect_uris:c.redirect_uris,created_at:c.created_at})),nextPage:result.data.clients.length===25?data.page+1:null};
  });
export const revokeClaudeConnection = createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator((input:unknown)=>z.object({userId:z.string().uuid(),clientId:z.string().uuid()}).strict().parse(input))
 .handler(async({data,context})=>{
   const [cap,admin]=await Promise.all([context.supabase.rpc("user_has_cap",{_cap:"api.mcp"}),context.supabase.rpc("is_admin")]);
   if(cap.error||admin.error||cap.data!==true||admin.data!==true) throw new Error("Accès refusé");
   const result=await context.supabase.from("mcp_connections").update({revoked_at:new Date().toISOString()}).eq("user_id",data.userId).eq("client_id",data.clientId).select("client_id");
   if(result.error||!result.data?.length) throw new Error("Connexion introuvable ou révocation impossible");
   // App revocation blocks all issued access/refresh-derived JWTs immediately on each MCP request.
   // For own grants, also invalidate provider sessions and refresh tokens using the SDK.
   if(data.userId===context.userId){const revoked=await context.supabase.auth.oauth.revokeGrant({clientId:data.clientId});return {revoked:true,providerRevoked:!revoked.error};}
   return {revoked:true,providerRevoked:false};
 });