import {useEffect,useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Link} from "@tanstack/react-router";
import {Plus,AlertTriangle,Loader2,Monitor} from "lucide-react";
import {toast} from "sonner";
import {supabase} from "@/integrations/supabase/client";
import {lirePlanningSimple} from "@/lib/planning-simple.functions";
import {addDays,dayOfWeek} from "@/lib/staffing/date-utils";
import {chargeHebdomadaire,niveauCharge,proposerPeriodeAtelier} from "@/lib/planning-barres";
import {PlanningBarres,type Barre,type LigneBarres} from "./PlanningBarres";
import {DevisHeuresChantier} from "./DevisHeuresChantier";
import {useSelectionDevis,r1,lireSelection,heuresPrincipales,useDevisParAffaire} from "./useSelectionDevis";
import {NavigationSemaine} from "@/components/logistique/NavigationSemaine";
import {PageHeader} from "@/components/PageHeader";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Dialog,DialogContent,DialogTitle,DialogHeader,DialogFooter,DialogDescription} from "@/components/ui/dialog";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "@/components/ui/select";
import {Command,CommandInput,CommandList,CommandItem,CommandEmpty} from "@/components/ui/command";
import {Popover,PopoverTrigger,PopoverContent} from "@/components/ui/popover";
import {useCapability} from "@/hooks/use-capability";
import {cn} from "@/lib/utils";
import {lirePersonnesAtelier} from "@/lib/atelier-personnes.functions";
import {nomsBarre,nomAtelier,identiteAtelier,plagesAtelier} from "@/lib/atelier-personnes";
import {PersonnesAtelier} from "./PersonnesAtelier";
const today=()=>new Date().toISOString().slice(0,10);
const lundi=()=>addDays(today(),-((dayOfWeek(today())+6)%7));
type Edition={barre:Barre;metier:number|null;employe:string|null;heures:string};
export function PlanningSimplePage({mode}:{mode:"atelier"|"be"}){
  const lire=useServerFn(lirePlanningSimple);
  const q=useQuery({queryKey:["planning-simple"],queryFn:()=>lire(),staleTime:30_000});
  const canBe=useCapability("affaires.edit"),canAdmin=useCapability("section.admin");
  const [debut,setDebut]=useState(lundi),[semaines,setSemaines]=useState(8);
  const lirePers=useServerFn(lirePersonnesAtelier);
  const pq=useQuery({queryKey:["atelier-personnes",debut,semaines],queryFn:()=>lirePers({data:{debut,fin:addDays(debut,semaines*7-1)}}),enabled:mode==="atelier"});
  const [vue,setVue]=useState("chantiers");
  const [expanded,setExpanded]=useState<string[]>([]),[edit,setEdit]=useState<Edition|null>(null),[saving,setSaving]=useState(false),[picker,setPicker]=useState(false),[chargeDetail,setChargeDetail]=useState<{titre:string;lignes:string[]}|null>(null);
  const [mobile,setMobile]=useState(false);
  const [showZero,setShowZero]=useState(()=>{try{return localStorage.getItem("atelier-show-zero")==="1";}catch{return false;}});
  const [showBe,setShowBe]=useState(()=>{try{return localStorage.getItem("atelier-show-be")==="1";}catch{return false;}});
  const toggleBe=()=>setShowBe(v=>{const n=!v;try{localStorage.setItem("atelier-show-be",n?"1":"0");}catch{/* ignore */}return n;});
  const toggleZero=()=>setShowZero(v=>{const n=!v;try{localStorage.setItem("atelier-show-zero",n?"1":"0");}catch{/* ignore */}return n;});
  useEffect(()=>{const m=window.matchMedia("(max-width: 767px)");const update=()=>setMobile(m.matches);update();m.addEventListener("change",update);return()=>m.removeEventListener("change",update);},[]);
  const d=q.data,editable=!mobile && (mode==="atelier"?!!d?.atelierEdit:canBe);
  const affaires=d?.affaires??[];
  const eligibles=affaires.filter(a=>a.numero.startsWith("6") || (a.numero.startsWith("9")&&a.statut_opportunite==="presque_gagne"));
  const atelierAff=eligibles.filter(a=>a.atelier_date_debut||d?.periodes.some(p=>p.affaire_id===a.id));
  const depart=(id:string)=>d?.etapes.find(e=>e.affaire_id===id)?.date_debut??null;
  const globale=(a:typeof affaires[number]):Barre|null=>{
    const charge=d?.charges[a.id];const total=charge?Object.values(charge.heures).reduce((s,n)=>s+n,0):null;
    const prop=proposerPeriodeAtelier({depart:depart(a.id),montage:a.date_montage,heures:total,capacite:charge?Math.max(1,...Object.entries(charge.heures).map(([k,h])=>h>0?(d?.metiers.find(m=>String(m.id)===k)?.capacite_jour??1):1)):null});
    const s=a.atelier_date_debut??prop?.debut,f=a.atelier_date_fin??prop?.fin;if(!s||!f)return null;
    return {id:`global:${a.id}`,affaireId:a.id,libelle:`${a.numero} · ${a.nom}`,debut:s,fin:f,previsionnel:a.phase!=="signe",proposee:!a.atelier_date_debut,depart:depart(a.id)};
  };
  const devisMap=useDevisParAffaire(mode==="atelier"?atelierAff.map(a=>a.id):[...new Set((d?.roles??[]).map(r=>r.affaire_id))]);
  // Heures BE : même sélection objets que le planning atelier (devis principal), sinon charge brute.
  const beH=(aid:string)=>{const e=heuresPrincipales(devisMap.get(aid),lireSelection(aid));return e?r1(e["8"]??0):Number(d?.charges[aid]?.be)||0;};
  const [selTick,setSelTick]=useState(0);
  useEffect(()=>{const f=()=>setSelTick(t=>t+1);window.addEventListener("atelier-selection-change",f);return()=>window.removeEventListener("atelier-selection-change",f);},[]);
  const devisSig=useMemo(()=>[...devisMap.keys()].sort().map(id=>`${id}:${devisMap.get(id)?.[0]?.total??0}`).join("|"),[devisMap]);
  const {lignes,zero:zeroCount}=useMemo<{lignes:LigneBarres[];zero:number}>(()=>{
    if(!d)return {lignes:[],zero:0};
    if(mode==="be")return {lignes:d.referents.map(r=>({id:r.employe_id,libelle:`${r.employes?.prenom??""} ${r.employes?.nom??""}`.trim(),detail:(()=>{const hs=d.roles.filter(x=>x.employe_id===r.employe_id).map(x=>beH(x.affaire_id));const h=r1(hs.reduce((a,b)=>a+b,0));return <div><p>Capacité {r.capacite_be_pct} %</p><p className="text-foreground"><strong>{h} h</strong> · {r1(h/8)} j/h BE</p></div>;})(),barres:d.roles.filter(x=>x.employe_id===r.employe_id).flatMap(x=>{const a=affaires.find(a=>a.id===x.affaire_id);if(!a||!x.date_debut||!x.date_fin)return [];return [{id:x.id,affaireId:a.id,libelle:`${a.numero} · ${a.nom} · ${beH(a.id)} h · ${r1(beH(a.id)/8)} j/h`,debut:x.date_debut,fin:x.date_fin,previsionnel:a.phase!=="signe"}];})})),zero:0};
    let zero=0;
    const lignesOut=[...atelierAff].sort((a,b)=>(depart(a.id)??"9999").localeCompare(depart(b.id)??"9999")).flatMap(a=>{
      const g=globale(a);const rows:LigneBarres[]=[{id:a.id,libelle:`${a.numero} · ${a.nom}`,detail:<ResumeChantier affaireId={a.id} statut={a.atelier_date_debut?"Période validée":"Période à confirmer"}/>,barres:g?[g]:[]}];
      if(expanded.includes(a.id)){
        const eff=heuresPrincipales(devisMap.get(a.id),lireSelection(a.id));
        for(const m of d.metiers.filter(m=>[1,2,3,4,5,6,9].includes(m.id))){
          const p=d.periodes.find(p=>p.affaire_id===a.id&&p.metier_id===m.id);
          const fixe=p?.heures_prevues!=null;
          // Même valeur que sous la ligne : heures enregistrées, sinon devis hors objets exclus.
          const h=fixe?Number(p?.heures_prevues??0):eff?r1(eff[String(m.id)]??0):(Number(d.charges[a.id]?.heures[String(m.id)])||0);
          if(!(h>0)){zero++;if(!showZero&&!pq.data?.presences.some(p=>p.affaire_id===a.id&&p.metier_id===m.id))continue;}
          const b=p?{id:p.id,affaireId:a.id,libelle:`${a.numero} · ${m.libelle}`,debut:p.date_debut,fin:p.date_fin,previsionnel:a.phase!=="signe"}:g?{...g,id:`metier:${a.id}:${m.id}`,libelle:`${a.numero} · ${m.libelle}`,proposee:true}:null;
          if(b){const ps=(pq.data?.presences??[]).filter(p=>p.affaire_id===a.id&&p.metier_id===m.id&&p.date>=b.debut&&p.date<=b.fin);const names=nomsBarre(ps,pq.data?.personnes??[]);b.libelle+=names?` · ${names}`:"";}
          rows.push({id:`${a.id}:${m.id}`,libelle:`↳ ${m.libelle}`,detail:<ConfigPersonnes cle={`${a.id}:${m.id}`} affaireId={a.id} metierId={m.id} heures={h} fixe={fixe} sansLimite={m.capacite_jour==null}/>,barres:b?[b]:[]});
        }
        if(showBe){const hb=beH(a.id);const rs=d.roles.filter(r=>r.affaire_id===a.id&&r.date_debut&&r.date_fin);
          const noms=rs.map(r=>{const ref=d.referents.find(f=>f.employe_id===r.employe_id);return ref?`${ref.employes?.prenom??""} ${ref.employes?.nom??""}`.trim():"";}).filter(Boolean).join(", ");
          rows.push({id:`${a.id}:be`,libelle:"↳ Bureau d’étude",detail:<div><p className="text-foreground">{hb} h · {r1(hb/8)} j/h{d.charges[a.id]?.estimation?" · estimation":""}</p><p>{noms||"Aucun concepteur daté"} · lecture seule (planning BE)</p></div>,barres:rs.map(r=>({id:`be:${r.id}`,affaireId:a.id,libelle:`${a.numero} · BE`,debut:r.date_debut as string,fin:r.date_fin as string,previsionnel:true}))});}
      }
      return rows;
    });
    return {lignes:lignesOut,zero};
  },[d,mode,expanded,showZero,showBe,devisSig,selTick,pq.data]);
  const personnesLignes:LigneBarres[]=mode==="atelier"?[...new Set((pq.data?.presences??[]).map(identiteAtelier))].map(id=>{const p=pq.data?.personnes.find(p=>p.id===id),ps=(pq.data?.presences??[]).filter(p=>identiteAtelier(p)===id);return {id,libelle:p?nomAtelier(p):"Personne",detail:`${ps.length} j/h de présence`,barres:plagesAtelier(ps).map(x=>{const a=affaires.find(a=>a.id===x.presence.affaire_id),m=d?.metiers.find(m=>m.id===x.presence.metier_id);return {id:`personne:${x.presence.id}`,affaireId:x.presence.affaire_id,libelle:`${a?.numero??""} · ${m?.libelle??""} · ${x.jours} j/h${x.presence.badge_atelier?` · ${x.presence.badge_atelier==="interim"?"Intérim":"Renfort"}`:""}`,debut:x.debut,fin:x.fin,previsionnel:a?.phase!=="signe"};})};}):[];
  const open=(b:Barre)=>{if(b.id.startsWith("be:")){toast.info("Période BE : à modifier dans le planning bureau d’étude");return;}if(b.id.startsWith("personne:")){const pr=pq.data?.presences.find(p=>`personne:${p.id}`===b.id);if(!pr)return;setEdit({barre:b,metier:pr.metier_id,employe:null,heures:""});return;}const p=d?.periodes.find(p=>p.id===b.id);const m=p?.metier_id??(b.id.startsWith("metier:")?Number(b.id.split(":").at(-1)):null);const role=d?.roles.find(r=>r.id===b.id);const a=affaires.find(a=>a.id===b.affaireId);setEdit({barre:b,metier:m,employe:role?.employe_id??null,heures:String(p?.heures_prevues??(m?d?.charges[b.affaireId]?.heures[String(m)]:a?.atelier_heures_prevues)??"")});};
  const retirer=async(e:Edition)=>{if(!window.confirm(e.metier==null?"Retirer ce chantier du planning atelier (toutes ses périodes métier) ?":"Retirer cette période métier du planning ?"))return;setSaving(true);try{const r=await supabase.rpc("planning_atelier_retirer",{_affaire:e.barre.affaireId,_metier:e.metier??undefined});if(r.error)throw r.error;await q.refetch();setEdit(null);toast.success("Retiré du planning");}catch(err){toast.error((err as {message?:string})?.message??"Suppression impossible");}finally{setSaving(false);}};
  const save=async(e:Edition)=>{
    if(e.heures && (!Number.isFinite(Number(e.heures)) || Number(e.heures)<0)){toast.error("Heures invalides");return;}
    setSaving(true);try{
      if(mode==="atelier"){const r=await supabase.rpc("planning_atelier_enregistrer",{_affaire:e.barre.affaireId,_metier:e.metier as number,_debut:e.barre.debut,_fin:e.barre.fin,_heures:e.heures?Number(e.heures):undefined});if(r.error)throw r.error;}
      else {if(!e.employe)throw new Error("Choisir un concepteur");const r=await supabase.rpc("app_affecter_role_projet",{_affaire_id:e.barre.affaireId,_role:"concepteur",_employe_id:e.employe,_date_debut:e.barre.debut,_date_fin:e.barre.fin,_remplacer_dates:true});if(r.error)throw r.error;}
      await q.refetch();setEdit(null);toast.success("Période enregistrée");
    }catch(err){toast.error(err instanceof Error?err.message:(err as {message?:string})?.message??"Enregistrement impossible");}finally{setSaving(false);}
  };
  const alerts:string[]=[];
  if(d){for(const a of mode==="atelier"?eligibles:affaires){const g=globale(a);if(mode==="atelier"){if(a.phase==="signe"&&!a.atelier_date_debut)alerts.push(`${a.numero} : période atelier non confirmée`);if(g&&depart(a.id)&&g.fin>=(depart(a.id)??""))alerts.push(`${a.numero} : fin atelier après le départ`);}else if(a.phase==="signe"&&a.numero.startsWith("6")&&!d.roles.some(r=>r.affaire_id===a.id))alerts.push(`${a.numero} : concepteur manquant`);else for(const r of d.roles.filter(r=>r.affaire_id===a.id)){if(r.date_fin&&a.atelier_date_debut&&r.date_fin>a.atelier_date_debut)alerts.push(`${a.numero} : BE après le début atelier`);}}}
  const charges=(d?mode==="atelier"?d.metiers.filter(m=>[1,2,3,4,5,6,9].includes(m.id)).map(m=>({id:String(m.id),nom:m.libelle,cap:m.capacite_jour,pct:100,barres:d.periodes.filter(p=>p.metier_id===m.id).map(p=>({id:p.affaire_id,debut:p.date_debut,fin:p.date_fin,heures:p.heures_prevues??(!d.charges[p.affaire_id]?.estimation?d.charges[p.affaire_id]?.heures[String(m.id)]??0:0)}))})):d.referents.map(r=>({id:r.id,nom:`${r.employes?.prenom} ${r.employes?.nom}`,cap:1,pct:r.capacite_be_pct,barres:d.roles.filter(x=>x.employe_id===r.employe_id&&x.date_debut&&x.date_fin).map(x=>({id:x.affaire_id,debut:x.date_debut??"",fin:x.date_fin??"",heures:beH(x.affaire_id)}))})):[]);
  return <div className="space-y-5 p-4 sm:p-6"><PageHeader title={mode==="atelier"?"Planning atelier":"Planning bureau d’étude"} eyebrow="Production"/><div className="flex flex-wrap items-center gap-2"><Button asChild variant={mode==="atelier"?"default":"outline"}><Link to="/planning-atelier">Atelier</Link></Button><Button asChild variant={mode==="be"?"default":"outline"}><Link to="/planning-be">Bureau d’étude</Link></Button>{mode==="atelier"&&<Button asChild variant="outline"><Link to="/ecran-atelier-production"><Monitor className="mr-1 h-4 w-4"/>Écran atelier</Link></Button>}<NavigationSemaine debut={debut} onChange={setDebut} choisir><span className="text-sm">Du {new Date(`${debut}T12:00:00`).toLocaleDateString("fr-FR")}</span></NavigationSemaine><Select value={String(semaines)} onValueChange={v=>setSemaines(Number(v))}><SelectTrigger className="w-32"><SelectValue/></SelectTrigger><SelectContent>{[8,10,12].map(n=><SelectItem key={n} value={String(n)}>{n} semaines</SelectItem>)}</SelectContent></Select></div>
    {q.isPending?<Loader2 className="h-6 w-6 animate-spin"/>:q.isError?<p role="alert" className="text-destructive">{q.error.message}</p>:<>
      <div className="flex flex-wrap items-center gap-2">{editable&&<Popover open={picker} onOpenChange={setPicker}><PopoverTrigger asChild><Button variant="outline"><Plus className="mr-2 h-4 w-4"/>Planifier</Button></PopoverTrigger><PopoverContent className="w-80 p-0"><Command><CommandInput placeholder="Numéro ou nom du chantier…"/><CommandList><CommandEmpty>Aucun chantier.</CommandEmpty>{(mode==="atelier"?eligibles:affaires).map(a=><CommandItem key={a.id} value={`${a.numero} ${a.nom}`} onSelect={()=>{const fb=mode==="atelier"?d?.roles.filter(r=>r.affaire_id===a.id&&r.date_fin).map(r=>r.date_fin as string).sort().at(-1):undefined;let s0=fb?addDays(fb,1):debut;while([0,6].includes(new Date(`${s0}T12:00:00`).getDay()))s0=addDays(s0,1);const b=(a.atelier_date_debut||!fb?globale(a):null)??{id:`global:${a.id}`,affaireId:a.id,libelle:`${a.numero} · ${a.nom}`,debut:s0,fin:addDays(s0,4),previsionnel:a.phase!=="signe",beFin:fb};setEdit({barre:b,metier:null,employe:d?.roles.find(r=>r.affaire_id===a.id)?.employe_id??d?.referents[0]?.employe_id??null,heures:""});setPicker(false);}}>{a.numero} · {a.nom}</CommandItem>)}</CommandList></Command></PopoverContent></Popover>}</div>
      {mode==="atelier"&&<div className="flex flex-wrap items-center gap-2"><Button size="sm" variant={vue==="chantiers"?"default":"outline"} onClick={()=>setVue("chantiers")}>Chantiers</Button><Button size="sm" variant={vue==="personnes"?"default":"outline"} onClick={()=>setVue("personnes")}>Personnes</Button>{!!atelierAff.length&&<Button size="sm" variant={showZero?"default":"outline"} onClick={toggleZero}>{showZero?"Masquer":"Afficher"} les métiers à 0 h{!showZero&&zeroCount?` (${zeroCount})`:""}</Button>}{!!atelierAff.length&&<Button size="sm" variant={showBe?"default":"outline"} onClick={toggleBe}>{showBe?"Masquer":"Afficher"} le bureau d’étude</Button>}{atelierAff.map(a=><Button key={a.id} size="sm" variant="outline" onClick={()=>setExpanded(old=>old.includes(a.id)?old.filter(id=>id!==a.id):[...old,a.id])}>{expanded.includes(a.id)?"−":"+"} {a.numero} métiers</Button>)}</div>}
      {mode==="be"&&d&&<div className="flex flex-wrap gap-4 border-y py-3">{d.referents.map(r=><div key={r.id} className="flex items-center gap-2 text-sm"><span>{r.employes?.prenom} {r.employes?.nom}</span><Input type="number" aria-label={`Capacité ${r.employes?.prenom}`} min="0" max="100" className="w-20" defaultValue={r.capacite_be_pct} disabled={!canAdmin||mobile} onBlur={async e=>{const n=Number(e.target.value);if(n===r.capacite_be_pct)return;if(!Number.isFinite(n)||n<0||n>100){toast.error("Capacité entre 0 et 100 %");return;}const v=await supabase.from("role_referents").update({capacite_be_pct:n}).eq("id",r.id);if(v.error)toast.error(v.error.message);else await q.refetch();}}/><span>%</span></div>)}</div>}
      {mode==="atelier"&&!atelierAff.length&&<p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Aucun chantier planifié pour le moment. Utilisez « Planifier » pour définir la période atelier d’un chantier ; il apparaîtra ensuite ici.</p>}
      {mode==="atelier"&&pq.isError&&<p role="alert" className="text-destructive">{pq.error.message}</p>}
      <PlanningBarres lignes={vue==="personnes"&&mode==="atelier"?personnesLignes:lignes} debut={debut} semaines={semaines} editable={editable&&vue!=="personnes"} onOpen={open} onMove={(b,s,f)=>{open(b);setEdit(old=>old?{...old,barre:{...old.barre,debut:s,fin:f}}:null);}}/>
      <section className="space-y-3 border-t pt-4"><h2 className="font-semibold">Charge hebdomadaire</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="min-w-40 py-2 text-left">{mode==="atelier"?"Métier":"Concepteur"}</th>{Array.from({length:semaines},(_,i)=><th key={i} className="min-w-24 px-2 text-center text-xs">{addDays(debut,i*7).slice(5)}</th>)}</tr></thead><tbody>{charges.map(c=><tr key={c.id} className="border-t"><td className="py-3">{c.nom}</td>{Array.from({length:semaines},(_,i)=>{const week=addDays(debut,i*7);const hs=c.barres.filter(b=>affaires.some(a=>a.id===b.id)).map(b=>({...b,h:chargeHebdomadaire(b,week,c.cap,c.pct)}));const total=hs.reduce((s,b)=>s+b.h.heures,0);const cap=hs[0]?.h.capacite??chargeHebdomadaire({debut:week,fin:addDays(week,6),heures:0},week,c.cap,c.pct).capacite;const ratio=cap?total/cap:null;const niveau=niveauCharge(ratio);return <td key={week} className="px-1"><Button variant="ghost" className={cn("h-auto w-full flex-col py-2 text-xs",niveau==="surcharge"?"bg-destructive/10 text-destructive":niveau==="vigilance"?"bg-warning/15 text-foreground":niveau==="normal"?"bg-success/10 text-foreground":"bg-muted/30")} onClick={()=>setChargeDetail({titre:`${c.nom} · ${week}`,lignes:hs.filter(b=>b.h.heures>0).map(b=>`${affaires.find(a=>a.id===b.id)?.numero??""} · ${b.h.heures.toFixed(1)} h${d?.charges[b.id]?.estimation?" · estimation":""}`)})}><span>{total.toFixed(1)} h</span>{ratio!==null&&<span>{ratio>1?"⚠ ":""}{Math.round(ratio*100)} %</span>}</Button></td>;})}</tr>)}</tbody></table></div></section>
      {!!alerts.length&&<section className="space-y-2 border-t pt-4"><h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-warning"/>À vérifier ({alerts.length})</h2>{alerts.map((a,i)=><p key={i} className="text-sm text-muted-foreground">{a}</p>)}</section>}
    </>}
    <Dialog open={!!edit} onOpenChange={o=>{if(!o&&!saving)setEdit(null);}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{edit?.barre.libelle}</DialogTitle><DialogDescription>{edit?.barre.previsionnel?"Prévisionnel":"Chantier signé"}{mode==="be"&&edit?` · ${beH(edit.barre.affaireId)} h BE · ${r1(beH(edit.barre.affaireId)/8)} j/h${d?.charges[edit.barre.affaireId]?.estimation?" · estimation":""}`:""}</DialogDescription></DialogHeader>{edit&&<div className="space-y-3">{mode==="be"&&<Select value={edit.employe??""} onValueChange={v=>setEdit({...edit,employe:v})} disabled={!editable}><SelectTrigger><SelectValue placeholder="Concepteur"/></SelectTrigger><SelectContent>{d?.referents.map(r=><SelectItem key={r.id} value={r.employe_id}>{r.employes?.prenom} {r.employes?.nom}</SelectItem>)}</SelectContent></Select>}<Label>Début<Input type="date" aria-label="Début période" value={edit.barre.debut} disabled={!editable} onChange={e=>setEdit({...edit,barre:{...edit.barre,debut:e.target.value}})}/></Label><Label>Fin<Input type="date" aria-label="Fin période" value={edit.barre.fin} disabled={!editable} onChange={e=>setEdit({...edit,barre:{...edit.barre,fin:e.target.value}})}/></Label>{mode==="atelier"&&edit.barre.beFin&&<p className="text-xs text-muted-foreground">Début proposé après la fin du BE ({new Date(`${edit.barre.beFin}T12:00:00`).toLocaleDateString("fr-FR")}).</p>}{mode==="atelier"&&<Label>Heures prévues<Input type="number" min="0" aria-label="Heures prévues" value={edit.heures} disabled={!editable} onChange={e=>setEdit({...edit,heures:e.target.value})}/>{Number(edit.heures)>0&&<span className="text-xs text-muted-foreground">≈ {Math.round(Number(edit.heures)/8*10)/10} jour/homme (base 8 h)</span>}</Label>}{mode==="atelier"&&<DevisHeuresChantier affaireId={edit.barre.affaireId} metierId={edit.metier} metiers={d?.metiers??[]} disabled={!editable} current={edit.heures} onUse={h=>setEdit(e=>e?{...e,heures:String(h)}:e)}/>}{mode==="be"&&<DevisHeuresChantier affaireId={edit.barre.affaireId} metierId={8} metiers={d?.metiers??[]} disabled current="x" onUse={()=>{}}/>}{mode==="atelier"&&edit.metier!=null&&<PersonnesAtelier key={edit.barre.id} affaire={edit.barre.affaireId} metier={edit.metier} debut={edit.barre.debut} fin={edit.barre.fin} personnes={pq.data?.personnes??[]} presences={pq.data?.presences??[]} editable={editable} onSaved={()=>pq.refetch()}/>}<Button asChild variant="outline"><Link to="/affaires/$affaireId" params={{affaireId:edit.barre.affaireId}}>Fiche chantier</Link></Button><Button asChild variant="outline"><Link to={mode==="atelier"?"/planning-be":"/planning-atelier"}>Voir {mode==="atelier"?"le BE":"l’atelier"}</Link></Button></div>}<DialogFooter>{editable&&mode==="atelier"&&edit&&!edit.barre.id.startsWith("personne:")&&!edit.barre.proposee&&<Button variant="destructive" disabled={saving} onClick={()=>edit&&retirer(edit)}>Retirer du planning</Button>}<Button variant="outline" onClick={()=>setEdit(null)} disabled={saving}>Fermer</Button>{editable&&!edit?.barre.id.startsWith("personne:")&&<Button disabled={saving||!edit||edit.barre.fin<edit.barre.debut} onClick={()=>edit&&save(edit)}>Enregistrer</Button>}</DialogFooter></DialogContent></Dialog>
    <Dialog open={!!chargeDetail} onOpenChange={()=>setChargeDetail(null)}><DialogContent><DialogHeader><DialogTitle>{chargeDetail?.titre}</DialogTitle></DialogHeader>{chargeDetail?.lignes.length?chargeDetail.lignes.map((l,i)=><p key={i} className="text-sm">{l}</p>):<p>Aucune charge.</p>}</DialogContent></Dialog>
  </div>;
}
/** Configurateur local : j/h ÷ nombre de personnes = durée en jours ouvrés (base 8 h). */
function ResumeChantier({affaireId,statut}:{affaireId:string;statut:string}){
  const {principal,effectif,somme,objExclus}=useSelectionDevis(affaireId);
  if(!principal)return <p>{statut}</p>;
  const n=principal.objets.filter(o=>o.id!=="_autres").length;const ex=(objExclus[principal.id]??[]).filter(id=>id!=="_autres").length;const h=somme(effectif(principal));
  return <div><p>{statut}</p><p className="text-foreground"><strong>{h} h</strong> · {r1(h/8)} j/h · {n-ex}/{n} objets ({principal.numero})</p></div>;
}
function ConfigPersonnes({cle,affaireId,metierId,heures:hBase,fixe,sansLimite}:{cle:string;affaireId:string;metierId:number;heures:number;fixe:boolean;sansLimite:boolean}){
  const {principal,effectif}=useSelectionDevis(affaireId);
  // Sans période saisie, les heures suivent la sélection d'objets du devis principal.
  const heures=!fixe&&principal?r1(effectif(principal)[String(metierId)]??0):hBase;
  const [n,setN]=useState(()=>{try{return Number(localStorage.getItem(`atelier-pers:${cle}`))||1;}catch{return 1;}});
  const jh=Math.round(heures/8*10)/10;const duree=Math.ceil(heures/8/Math.max(1,n)*2)/2;
  return <div className="space-y-1"><p>{heures} h · {jh} j/h{sansLimite?" · sans limite":""}</p>
    <label className="flex items-center gap-1" onPointerDown={e=>e.stopPropagation()}>
      <input type="number" min={1} max={50} aria-label="Nombre de personnes" value={n} onChange={e=>{const v=Math.max(1,Math.min(50,Number(e.target.value)||1));setN(v);try{localStorage.setItem(`atelier-pers:${cle}`,String(v));}catch{/* ignore */}}} className="h-6 w-12 rounded border border-input bg-background px-1 text-foreground"/>
      pers. → <strong className="text-foreground">{duree} j</strong></label></div>;
}
