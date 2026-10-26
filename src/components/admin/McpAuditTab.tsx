import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
export function McpAuditTab({enabled}:{enabled:boolean}) {
 const [page,setPage]=useState(0);
 const [writesOnly,setWritesOnly]=useState(false);
 const query=useQuery({queryKey:["mcp-audit",page,writesOnly],enabled,queryFn:async()=>{
 let q=supabase.from("mcp_audit_log").select("id,user_id,client_id,tool,nb_lignes,duree_ms,statut,created_at,affaire_id,etape_id,confirmation_id,diff").order("created_at",{ascending:false}).order("id").range(page*25,page*25+24);
 if(writesOnly)q=q.in("statut",["preview","executed","refused"]);
 const {data,error}=await q;
 if(error)throw new Error("Journal indisponible");return data;}});
 return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Connecteur Claude</h2><Button variant={writesOnly?"default":"outline"} aria-pressed={writesOnly} onClick={()=>{setWritesOnly(v=>!v);setPage(0);}}>Écritures uniquement</Button></div>{query.isPending?<p>Chargement…</p>:query.error?<p role="alert" className="text-destructive">{query.error.message}</p>:<div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="p-3">Date</th><th>Utilisateur / client</th><th>Outil / cible</th><th>Lignes</th><th>Durée</th><th>Résultat / différences</th></tr></thead><tbody>{query.data?.map(r=><tr key={r.id} className="border-b border-border"><td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString("fr-FR")}</td><td className="font-mono text-xs">{r.user_id}<br/>{r.client_id}</td><td>{r.tool}<div className="text-xs text-muted-foreground">{r.affaire_id}{r.etape_id&&<><br/>{r.etape_id}</>}</div></td><td>{r.nb_lignes}</td><td>{r.duree_ms} ms</td><td>{r.statut}{r.confirmation_id&&<details><summary className="cursor-pointer text-xs">Différences</summary><p className="font-mono text-xs">{r.confirmation_id}</p><pre className="max-w-sm whitespace-pre-wrap break-all text-xs">{JSON.stringify(r.diff,null,2)}</pre></details>}</td></tr>)}</tbody></table>{!query.data?.length&&<p className="py-8 text-muted-foreground">Aucun appel enregistré.</p>}</div>}<div className="flex gap-2"><Button variant="outline" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Précédent</Button><Button variant="outline" disabled={query.data?.length!==25} onClick={()=>setPage(p=>p+1)}>Suivant</Button></div></section>;
}