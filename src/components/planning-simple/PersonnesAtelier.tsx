import {useState} from "react";
import {useServerFn} from "@tanstack/react-start";
import {toast} from "sonner";
import {Plus} from "lucide-react";
import {modifierPersonneAtelier} from "@/lib/atelier-personnes.functions";
import {joursAtelier,nomAtelier,identiteAtelier,type PersonneAtelier,type PresenceAtelier} from "@/lib/atelier-personnes";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Badge} from "@/components/ui/badge";
import {Checkbox} from "@/components/ui/checkbox";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "@/components/ui/select";
export function PersonnesAtelier({affaire,metier,debut,fin,personnes,presences,editable,onSaved}:{affaire:string;metier:number;debut:string;fin:string;personnes:PersonneAtelier[];presences:PresenceAtelier[];editable:boolean;onSaved:()=>Promise<unknown>}){
 const modifier=useServerFn(modifierPersonneAtelier);
 const [action,setAction]=useState<{retirer:boolean;personne:string}|null>(null),[search,setSearch]=useState(""),[mode,setMode]=useState("barre"),[start,setStart]=useState(debut),[end,setEnd]=useState(fin),[jours,setJours]=useState<string[]>([]),[badge,setBadge]=useState<"interim"|"renfort">("renfort"),[saving,setSaving]=useState(false);
 const ps=presences.filter(p=>p.affaire_id===affaire&&p.metier_id===metier&&p.date>=debut&&p.date<=fin);
 const ids=[...new Set(ps.map(identiteAtelier))];
 const begin=(retirer:boolean,personne="")=>{setAction({retirer,personne});setMode("barre");setStart(debut);setEnd(fin);setJours([]);setSearch("");};
 const selected=personnes.find(p=>p.id===action?.personne);
 const dates=joursAtelier(start,end,mode==="jours"?jours:undefined);
 const submit=async()=>{if(!action||!selected)return;setSaving(true);try{const n=await modifier({data:{affaire,metier,personne:selected.id,origine:selected.origine,badge:selected.origine==="dispos"?badge:undefined,debut:start,fin:end,jours:mode==="jours"?jours:undefined,retirer:action.retirer}});await onSaved();setAction(null);toast.success(`${n} jour(s) ${action.retirer?"retiré(s)":"ajouté(s)"}`);}catch(e){toast.error(e instanceof Error?e.message:"Enregistrement impossible");}finally{setSaving(false);}};
 return <section className="space-y-3 border-t pt-3"><h3 className="font-semibold">Personnes · {ps.length} j/h de présence</h3>{ids.map(id=>{const p=personnes.find(p=>p.id===id),rows=ps.filter(p=>identiteAtelier(p)===id);return <div key={id} className="flex flex-wrap items-center gap-2 text-sm"><span>{p?nomAtelier(p):"Personne"} · {rows.length} j/h</span>{rows.some(p=>p.badge_atelier)&&<Badge variant="secondary">{rows[0]?.badge_atelier==="interim"?"Intérim":"Renfort"}</Badge>}{editable&&<Button size="sm" variant="outline" onClick={()=>begin(true,id)}>Retirer</Button>}</div>;})}{!ids.length&&<p className="text-sm text-muted-foreground">Aucune personne affectée.</p>}{editable&&!action&&<Button size="sm" variant="outline" onClick={()=>begin(false)}><Plus className="mr-1 h-4 w-4"/>Personne</Button>}
 {editable&&action&&<div className="space-y-3 border-t pt-3"><h4 className="text-sm font-semibold">{action.retirer?"Retirer":"Ajouter une personne"}</h4>{!action.retirer&&<><Input aria-label="Rechercher une personne" placeholder="Rechercher une personne…" value={search} onChange={e=>setSearch(e.target.value)}/><div className="max-h-40 overflow-y-auto">{personnes.filter(p=>p.actif&&`${p.prenom} ${p.nom}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(p=><Button key={p.id} className="mb-1 h-auto w-full justify-start whitespace-normal text-left" variant={action.personne===p.id?"secondary":"ghost"} onClick={()=>setAction({...action,personne:p.id})}>{p.prenom} {p.nom}{p.origine==="dispos"&&<Badge className="ml-2" variant="outline">Dispos</Badge>}</Button>)}</div></>}
 <Select value={mode} onValueChange={v=>{setMode(v);if(v==="barre"){setStart(debut);setEnd(fin);}}}><SelectTrigger aria-label="Période de présence"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="barre">Toute la barre</SelectItem><SelectItem value="periode">Période</SelectItem><SelectItem value="jours">Jours précis</SelectItem></SelectContent></Select>
 {mode!=="barre"&&<div className="grid grid-cols-2 gap-2"><Label>Début<Input aria-label="Début présence" type="date" value={start} min={debut} max={fin} onChange={e=>setStart(e.target.value)}/></Label><Label>Fin<Input aria-label="Fin présence" type="date" value={end} min={debut} max={fin} onChange={e=>setEnd(e.target.value)}/></Label></div>}
 {mode==="jours"&&<div className="flex max-h-32 flex-wrap gap-3 overflow-y-auto">{joursAtelier(start,end).map(j=><Label key={j} className="flex items-center gap-2 text-xs"><Checkbox checked={jours.includes(j)} onCheckedChange={v=>setJours(old=>v?[...old,j]:old.filter(x=>x!==j))}/>{j.slice(5)}</Label>)}</div>}
 {!action.retirer&&selected?.origine==="dispos"&&<Select value={badge} onValueChange={v=>setBadge(v as "interim"|"renfort")}><SelectTrigger aria-label="Badge intervenant"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="interim">Intérim</SelectItem><SelectItem value="renfort">Renfort</SelectItem></SelectContent></Select>}
 <p className="text-xs text-muted-foreground">{dates.length} j/h · week-ends et fériés exclus</p><div className="flex gap-2"><Button disabled={saving||!selected||!dates.length} onClick={submit}>{action.retirer?"Confirmer le retrait":"Ajouter"}</Button><Button variant="outline" disabled={saving} onClick={()=>setAction(null)}>Annuler</Button></div></div>}</section>;
}