import {useRef,useState,type PointerEvent} from "react";
import {Button} from "@/components/ui/button";
import {addDays,diffDays} from "@/lib/staffing/date-utils";
import {cn} from "@/lib/utils";
export type Barre={id:string;affaireId:string;libelle:string;debut:string;fin:string;previsionnel:boolean;proposee?:boolean;depart?:string|null};
export type LigneBarres={id:string;libelle:string;detail?:string;barres:Barre[]};
const palettes=["bg-info/20 text-foreground border-info","bg-success/20 text-foreground border-success","bg-warning/20 text-foreground border-warning","bg-primary/15 text-foreground border-primary","bg-destructive/15 text-foreground border-destructive"];
function couleur(id:string){return palettes[[...id].reduce((n,c)=>n+c.charCodeAt(0),0)%palettes.length];}
export function PlanningBarres({lignes,debut,semaines,editable,onOpen,onMove}:{lignes:LigneBarres[];debut:string;semaines:number;editable:boolean;onOpen:(b:Barre)=>void;onMove:(b:Barre,debut:string,fin:string)=>void}){
  const [drag,setDrag]=useState<{barre:Barre;x:number;mode:"move"|"start"|"end";debut:string;fin:string}|null>(null);
  const moved=useRef(false);
  const jours=semaines*7,COL=20;
  const start=(e:PointerEvent<HTMLButtonElement>,b:Barre,mode:"move"|"start"|"end")=>{moved.current=false;if(!editable)return;e.currentTarget.setPointerCapture(e.pointerId);setDrag({barre:b,x:e.clientX,mode,debut:b.debut,fin:b.fin});};
  const move=(e:PointerEvent<HTMLButtonElement>)=>{if(!drag)return;const n=Math.round((e.clientX-drag.x)/COL);setDrag({...drag,debut:drag.mode==="end"?drag.barre.debut:addDays(drag.barre.debut,n),fin:drag.mode==="start"?drag.barre.fin:addDays(drag.barre.fin,n)});};
  const end=()=>{if(!drag)return;const changed=drag.debut!==drag.barre.debut||drag.fin!==drag.barre.fin;moved.current=changed;if(changed&&drag.fin>=drag.debut)onMove(drag.barre,drag.debut,drag.fin);setDrag(null);};
  return <>
    <div className="hidden overflow-x-auto border-y md:block"><div style={{width:240+jours*COL}}>
      <div className="flex border-b bg-muted/40"><div className="sticky left-0 z-20 w-60 shrink-0 bg-background p-3 text-sm font-medium">Chantier / concepteur</div>{Array.from({length:semaines},(_,i)=><div key={i} style={{width:COL*7}} className="shrink-0 border-l py-3 text-center text-xs">{new Date(`${addDays(debut,i*7)}T12:00:00`).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}</div>)}</div>
      {lignes.map(l=>{
        const lanes:Barre[][]=[];for(const b of [...l.barres].sort((a,b)=>a.debut.localeCompare(b.debut))){const lane=lanes.find(x=>(x.at(-1)?.fin??"")<b.debut);if(lane)lane.push(b);else lanes.push([b]);}
        return <div key={l.id} className="flex border-b"><div className="sticky left-0 z-20 w-60 shrink-0 bg-background px-3 py-3"><p className="truncate text-sm font-medium" title={l.libelle}>{l.libelle}</p><p className="text-xs text-muted-foreground">{l.detail}</p></div><div className="relative" style={{width:jours*COL,height:Math.max(1,lanes.length)*38+12}}>
          {Array.from({length:jours},(_,i)=><div key={i} className={cn("absolute inset-y-0 border-l border-border/50",[5,6].includes(i%7)&&"bg-muted/50",addDays(debut,i)===new Date().toISOString().slice(0,10)&&"border-l-2 border-primary")} style={{left:i*COL,width:COL}}/>)}
          {!l.barres.length&&<p className="px-3 py-4 text-xs text-muted-foreground">Non planifié</p>}
          {lanes.flatMap((lane,n)=>lane.map(b=>{const active=drag?.barre.id===b.id;const s=active?drag.debut:b.debut,f=active?drag.fin:b.fin;const left=Math.max(0,diffDays(debut,s)),right=Math.min(jours-1,diffDays(debut,f));if(right<0||left>=jours||right<left)return null;return <div key={b.id}>
            <Button variant="ghost" title={`${b.libelle} · ${s} → ${f}`} aria-label={b.libelle} className={cn("absolute h-7 touch-none justify-start overflow-hidden rounded border px-2 text-xs",couleur(b.affaireId),b.previsionnel&&"border-dashed",b.proposee&&"opacity-60")} style={{left:left*COL+1,width:Math.max(18,(right-left+1)*COL-2),top:n*38+6}} onPointerDown={e=>start(e,b,"move")} onPointerMove={move} onPointerUp={end} onClick={()=>{if(!moved.current)onOpen(b);}}><span className="truncate">{b.libelle}{b.proposee?" · proposition":""}</span></Button>
            {editable&&<>{(["start","end"] as const).map(mode=><Button key={mode} variant="ghost" size="icon" aria-label={`${mode==="start"?"Début":"Fin"} ${b.libelle}`} title={mode==="start"?"Ajuster début":"Ajuster fin"} className="absolute h-7 w-2 touch-none rounded-none p-0" style={{left:(mode==="start"?left*COL:(right+1)*COL-8),top:n*38+6}} onPointerDown={e=>start(e,b,mode)} onPointerMove={move} onPointerUp={end}/> )}</>}
            {b.depart&&diffDays(debut,b.depart)>=0&&diffDays(debut,b.depart)<jours&&<div title={`Départ ${b.depart}`} className="pointer-events-none absolute bottom-0 top-0 border-l-2 border-destructive" style={{left:diffDays(debut,b.depart)*COL}}/>}
          </div>;}))}
        </div></div>;
      })}
    </div></div>
    <div className="space-y-5 md:hidden">{Array.from({length:semaines},(_,i)=>{const s=addDays(debut,i*7),f=addDays(s,6);const rows=lignes.flatMap(l=>l.barres.filter(b=>b.debut<=f&&b.fin>=s).map(b=>({b,l})));return <section key={s} className="border-t pt-4"><h3 className="mb-2 text-sm font-semibold">Semaine du {new Date(`${s}T12:00:00`).toLocaleDateString("fr-FR")}</h3>{rows.length?rows.map(({b,l})=><Button key={`${l.id}-${b.id}`} variant="ghost" onClick={()=>onOpen(b)} className={cn("mb-2 h-auto w-full justify-start whitespace-normal border p-3 text-left",couleur(b.affaireId),b.previsionnel&&"border-dashed")}><span><strong className="block">{b.libelle}</strong><span className="text-xs">{l.libelle} · {b.debut} → {b.fin}{b.proposee?" · proposition":""}</span></span></Button>):<p className="text-xs text-muted-foreground">Aucune période.</p>}</section>;})}</div>
  </>;
}