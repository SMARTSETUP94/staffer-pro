import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
export function McpAuditTab({enabled}:{enabled:boolean}) {
 const [page,setPage]=useState(0);
 const query=useQuery({queryKey:["mcp-audit",page],enabled,queryFn:async()=>{
 const {data,error}=await supabase.from("mcp_audit_log").select("id,user_id,client_id,tool,nb_lignes,duree_ms,statut,created_at").order("created_at",{ascending:false}).range(page*25,page*25+24);
 if(error)throw new Error("Journal indisponible");return data;}});
 return <section className="space-y-4"><h2 className="text-lg font-semibold">Consultations Claude</h2>{query.isPending?<p>Chargement…</p>:query.error?<p role="alert" className="text-destructive">{query.error.message}</p>:<div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="p-3">Date</th><th>Utilisateur / client</th><th>Outil</th><th>Lignes</th><th>Durée</th><th>Résultat</th></tr></thead><tbody>{query.data?.map(r=><tr key={r.id} className="border-b border-border"><td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString("fr-FR")}</td><td className="font-mono text-xs">{r.user_id}<br/>{r.client_id}</td><td>{r.tool}</td><td>{r.nb_lignes}</td><td>{r.duree_ms} ms</td><td>{r.statut}</td></tr>)}</tbody></table>{!query.data?.length&&<p className="py-8 text-muted-foreground">Aucune consultation enregistrée.</p>}</div>}<div className="flex gap-2"><Button variant="outline" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Précédent</Button><Button variant="outline" disabled={query.data?.length!==25} onClick={()=>setPage(p=>p+1)}>Suivant</Button></div></section>;
}