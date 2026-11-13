import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Download, RefreshCw, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useQualite } from "@/hooks/use-qualite";
import { listesQualite, EMPLOYES_PROTEGES } from "@/lib/qualite-listes";
import { normalizeName } from "@/lib/string-normalize";
import { PageHeader } from "@/components/PageHeader";
import { RepriseClassementPj } from "@/components/admin/RepriseClassementPj";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";

type Operation = { titre:string; description:string; executer:()=>Promise<unknown> };
const nom=(p:{prenom?:string | null;nom:string})=>`${p.prenom ?? ""} ${p.nom}`.trim();
const date=(s:string | null)=>s?new Date(s).toLocaleDateString("fr-FR"):"Non renseignée";
const euros=(n:number | null)=>n==null?"—":n.toLocaleString("fr-FR",{style:"currency",currency:"EUR"});
const labels={telephone:"Téléphone",permis:"Permis",caces:"CACES",poste:"Poste terrain",chef:"Chef d’équipe"};
function Choix({items,onChange,label}:{items:{id:string;nom:string}[];onChange:(id:string)=>void;label:string}) {
  const [open,setOpen]=useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline" size="sm">{label}</Button></PopoverTrigger><PopoverContent className="w-72 p-0"><Command><CommandInput placeholder="Rechercher…"/><CommandList><CommandEmpty>Aucun résultat.</CommandEmpty>{items.map(x=><CommandItem key={x.id} value={`${x.nom} ${x.id}`} onSelect={()=>{onChange(x.id);setOpen(false);}}>{x.nom}</CommandItem>)}</CommandList></Command></PopoverContent></Popover>;
}
function Groupe({titre,count,children}:{titre:string;count:number;children:ReactNode}) {
  return <section className="space-y-3 border-t pt-5"><h2 className="flex items-center gap-2 font-semibold">{titre}<Badge variant="secondary">{count}</Badge></h2>{count? <div className="divide-y">{children}</div>:<p className="py-3 text-sm text-muted-foreground">Aucun point à vérifier.</p>}</section>;
}
function Ligne({children,actions}:{children:ReactNode;actions?:ReactNode}) {
  return <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1 space-y-1 text-sm">{children}</div>{actions&&<div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}</div>;
}
function SaisieCa({proposition,onApply}:{proposition:number|null;onApply:(n:number)=>void}) {
  const [value,setValue]=useState(proposition?.toString() ?? "");
  return <div className="flex items-center gap-2"><Input aria-label="CA estimé HT" type="number" min="0" step="0.01" value={value} onChange={e=>setValue(e.target.value)} className="w-32"/><Button size="sm" variant="outline" disabled={!value || !Number.isFinite(Number(value)) || Number(value)<0} onClick={()=>onApply(Number(value))}>Appliquer</Button></div>;
}

export function QualiteDonneesPage() {
  const {roles}=useAuth();
  const query=useQualite();
  const [tab,setTab]=useState("personnes");
  const [search,setSearch]=useState("");
  const [operation,setOperation]=useState<Operation|null>(null);
  const [busy,setBusy]=useState(false);
  const [resultat,setResultat]=useState<string|null>(null);
  const [selection,setSelection]=useState<string[]>([]);
  const [champs,setChamps]=useState<Record<string,string[]>>({});
  const listes=useMemo(()=>query.data?listesQualite(query.data):null,[query.data]);
  if(!roles.includes("admin")) return <p className="p-6">Réservé aux administrateurs.</p>;
  const run=async()=>{
    if(!operation || busy) return;
    setBusy(true);
    try {const result=await operation.executer();setResultat(result && typeof result==="object"?JSON.stringify(result,null,2):null);setOperation(null);setSelection([]);await query.refetch();toast.success("Correction enregistrée");}
    catch(e){toast.error(e instanceof Error?e.message:"Correction impossible");}
    finally{setBusy(false);}
  };
  const propose=(titre:string,description:string,executer:Operation["executer"])=>setOperation({titre,description,executer});
  const appel=async<T,>(promise:PromiseLike<{data:T;error:{message:string}|null}>)=>{const r=await promise;if(r.error)throw new Error(r.error.message);return r.data;};
  const matches=(...texts:(string|null|undefined)[])=>normalizeName(texts.join(" ")).includes(normalizeName(search));
  const exportExcel=async()=>{
    if(!listes || !query.data) return;
    try {
      const XLSX=await import("xlsx-js-style");
      const rows:Record<string,string|number>[]=[];
      if(tab==="personnes"){
        listes.relier.forEach(x=>rows.push({Categorie:"À relier",Personne:nom(x.fiche),Detail:x.candidats.map(nom).join(" / ")}));
        listes.diffs.forEach(x=>x.champs.forEach(c=>rows.push({Categorie:"Infos Dispos",Personne:nom(x.employe),Champ:labels[c.champ],Employe:c.employe,Dispos:c.dispos})));
        listes.doublons.forEach(([a,b])=>rows.push({Categorie:"Doublon probable",Personne:nom(a),Detail:nom(b)}));
        listes.revoir.forEach(e=>rows.push({Categorie:"Jamais affecté sans Dispos",Personne:nom(e),Detail:e.statut_contrat??""}));
        listes.incomplets.forEach(e=>rows.push({Categorie:"Fiche incomplète",Personne:nom(e),Detail:[!e.telephone?"Téléphone":"",!e.poste_principal?"Poste":"",!e.statut_contrat?"Statut":""].filter(Boolean).join(", ")}));
      } else if(tab==="commercial"){
        listes.sansCa.forEach(x=>rows.push({Categorie:"Sans CA",Affaire:x.affaire.numero,Nom:x.affaire.nom,Proposition:x.proposition??"",Devis:x.devis?.numero??""}));
        listes.sansSuivi.forEach(a=>rows.push({Categorie:"Suivi incomplet",Affaire:a.numero,Nom:a.nom}));
        listes.demandes.forEach(e=>rows.push({Categorie:"Demande à rattacher",Nom:e.subject??"",Contact:e.from_email}));
        listes.clients.forEach(([a,b])=>rows.push({Categorie:"Clients doublons probables",Nom:a.nom,Detail:b.nom}));
      } else listes.devis.forEach(x=>rows.push({Devis:x.devis.numero,Affaire:x.affaire?.numero??"",Nom:x.affaire?.nom??"",Evenement:date(x.evenement),Demande:date(x.demande),NetHT:x.devis.net_ht??"",Statut:x.affaire?.statut_opportunite??"",Lien:x.affaire?`${window.location.origin}/affaires/${x.affaire.id}/devis-staffing/${x.devis.id}`:""}));
      const filtered=rows.filter(r=>matches(...Object.values(r).map(String)));
      const book=XLSX.utils.book_new();const sheet=XLSX.utils.json_to_sheet(filtered);sheet["!cols"]=Array.from({length:8},()=>({wch:30}));XLSX.utils.book_append_sheet(book,sheet,"Qualité");XLSX.writeFile(book,`qualite-${tab}.xlsx`);
    } catch {toast.error("Export impossible");}
  };
  return <div className="space-y-6 p-4 sm:p-6">
    <PageHeader title="Qualité des données" eyebrow="Administration" description="Personnes · Commercial · Devis"/>
    <div className="grid grid-cols-3 gap-3 border-y py-4">{[["Personnes",listes?.personnes],["Commercial",listes?.commercial],["À revoir par Gabin",listes?.devis.length]].map(([l,n])=><div key={String(l)}><p className="text-2xl font-semibold tabular-nums">{n??"—"}</p><p className="text-sm text-muted-foreground">{l}</p></div>)}</div>
    <div className="flex flex-wrap gap-2"><Input aria-label="Rechercher dans Qualité" placeholder="Rechercher un nom, chantier, client…" value={search} onChange={e=>setSearch(e.target.value)} className="min-w-0 flex-1 basis-60"/><Button variant="outline" onClick={()=>query.refetch()} disabled={query.isFetching} title="Actualiser"><RefreshCw className={`h-4 w-4 ${query.isFetching?"animate-spin":""}`}/></Button><Button variant="outline" onClick={exportExcel} disabled={!listes}><Download className="mr-2 h-4 w-4"/>Excel</Button></div>
    {query.isPending?<div className="flex items-center gap-2 py-12"><Loader2 className="h-5 w-5 animate-spin"/>Chargement des listes…</div>:query.isError?<p role="alert" className="text-destructive">{query.error.message}</p>:listes && query.data && <Tabs value={tab} onValueChange={v=>{setTab(v);setSearch("");}}>
      <TabsList className="w-full justify-start"><TabsTrigger value="personnes">Personnes</TabsTrigger><TabsTrigger value="commercial">Commercial</TabsTrigger><TabsTrigger value="devis">Devis</TabsTrigger></TabsList>
      <TabsContent value="personnes" className="space-y-6 pt-4">
        <p className="text-sm text-muted-foreground">Informations terrain de référence : Dispos. Corrections validées champ par champ ; contrats et rémunérations inchangés.</p>
        <Groupe titre="Fiches Dispos à relier" count={listes.relier.length}>{listes.relier.filter(x=>matches(nom(x.fiche))).map(x=><Ligne key={x.fiche.id} actions={<><Choix label="Relier à un employé" items={query.data.employes.map(e=>({id:e.id,nom:`${nom(e)}${e.actif?"":" · inactif"}`}))} onChange={id=>propose("Relier la fiche",`${nom(x.fiche)} → ${nom(query.data?.employes.find(e=>e.id===id)??{nom:""})}. Aucun changement de statut.`,()=>appel(supabase.rpc("qualite_relier_dispos",{_dispos:x.fiche.id,_employe:id})))}/>{x.candidats.map(e=><Button key={e.id} size="sm" variant="ghost" onClick={()=>propose("Pas la même personne",`${nom(x.fiche)} ≠ ${nom(e)}. Cette suggestion ne sera plus proposée.`,()=>appel(supabase.rpc("qualite_refuser_homonyme",{_dispos:x.fiche.id,_employe:e.id})))}>Pas la même personne : {nom(e)}</Button>)}</>}><p className="font-medium">{nom(x.fiche)}</p><p className="text-muted-foreground">{x.candidats.length?`Correspondance probable : ${x.candidats.map(nom).join(", ")}`:"Aucune correspondance certaine"}</p></Ligne>)}</Groupe>
        <Groupe titre="Comparer Dispos → employé" count={listes.diffs.length}>{listes.diffs.filter(x=>matches(nom(x.employe))).map(x=><div key={x.fiche.id} className="space-y-3 py-4"><h3 className="font-medium">{nom(x.employe)}</h3><div className="space-y-2">{x.champs.map(c=><label key={c.champ} className="grid grid-cols-[20px_1fr] items-start gap-2 text-sm"><Checkbox checked={(champs[x.fiche.id]??[]).includes(c.champ)} onCheckedChange={checked=>setChamps(old=>({...old,[x.fiche.id]:checked?[...(old[x.fiche.id]??[]),c.champ]:(old[x.fiche.id]??[]).filter(k=>k!==c.champ)}))}/><span><strong>{labels[c.champ]}</strong><span className="mt-1 block text-muted-foreground">Employé : {c.employe||"Vide"} <ArrowRight className="inline h-3 w-3"/> Dispos : {c.dispos}</span></span></label>)}</div><Button size="sm" variant="outline" disabled={!(champs[x.fiche.id]?.length)} onClick={()=>propose("Appliquer les informations terrain",`${nom(x.employe)} : ${(champs[x.fiche.id]??[]).join(", ")}. Modification journalisée, contrat inchangé.`,()=>appel(supabase.rpc("qualite_appliquer_dispos",{_dispos:x.fiche.id,_champs:champs[x.fiche.id]??[]})))}>Appliquer les champs sélectionnés</Button></div>)}</Groupe>
        <Groupe titre="Doublons employés probables" count={listes.doublons.length}>{listes.doublons.filter(([a,b])=>matches(nom(a),nom(b))).map(([a,b])=><Ligne key={`${a.id}-${b.id}`} actions={<Choix label="Choisir la fiche à garder" items={[a,b].map(e=>({id:e.id,nom:`${nom(e)} · ${e.actif?"actif":"inactif"} · ${e.telephone??"sans téléphone"}`}))} onChange={id=>{const g=id===a.id?a:b,f=id===a.id?b:a;propose("Fusion assistée des employés",`Garder ${nom(g)} (${g.id}), désactiver ${nom(f)} (${f.id}). Aucune suppression ; fusion refusée si un contrat est lié à la fiche fusionnée.`,()=>appel(supabase.rpc("qualite_fusionner_employes",{_garder:g.id,_fusionner:f.id})));}}/>}><p>{nom(a)} / {nom(b)}</p><p className="text-xs text-muted-foreground">{a.telephone??"Sans téléphone"} / {b.telephone??"Sans téléphone"}</p></Ligne>)}</Groupe>
        <Groupe titre="Actifs jamais affectés et sans Dispos" count={listes.revoir.length}>{listes.revoir.filter(e=>matches(nom(e),e.statut_contrat)).map(e=><Ligne key={e.id} actions={<Checkbox aria-label={`Sélectionner ${nom(e)}`} checked={selection.includes(e.id)} onCheckedChange={c=>setSelection(old=>c?[...old,e.id]:old.filter(id=>id!==e.id))}/>}><p>{nom(e)}</p><p className="text-muted-foreground">{e.statut_contrat??"Statut non renseigné"}</p></Ligne>)}<Button variant="outline" disabled={!selection.length} onClick={()=>propose("Désactiver les fiches sélectionnées",`${selection.length} fiches seront désactivées, sans suppression. Action réversible.`,()=>appel(supabase.rpc("qualite_activer_employes",{_ids:selection,_actif:false})))}>Désactiver ({selection.length})</Button></Groupe>
        <Groupe titre="Fiches incomplètes" count={listes.incomplets.length}>{listes.incomplets.filter(e=>matches(nom(e))).map(e=><Ligne key={e.id} actions={<Button asChild size="sm" variant="outline"><Link to="/employes">Ouvrir les employés</Link></Button>}><p>{nom(e)}</p><p className="text-muted-foreground">{[!e.telephone?"Téléphone":"",!e.poste_principal?"Poste terrain":"",!e.statut_contrat?"Statut":""].filter(Boolean).join(" · ")}</p></Ligne>)}</Groupe>
        <details className="border-t pt-4"><summary className="cursor-pointer text-sm font-medium">Fiches inactives ({query.data.employes.filter(e=>!e.actif).length})</summary>{query.data.employes.filter(e=>!e.actif && matches(nom(e))).map(e=><Ligne key={e.id} actions={<Button size="sm" variant="outline" disabled={EMPLOYES_PROTEGES.has(e.id)} onClick={()=>propose("Réactiver la fiche",nom(e),()=>appel(supabase.rpc("qualite_activer_employes",{_ids:[e.id],_actif:true})))}>Réactiver</Button>}><p>{nom(e)} {EMPLOYES_PROTEGES.has(e.id)&&<Badge variant="secondary">Maintenue inactive</Badge>}</p></Ligne>)}</details>
        <details className="border-t pt-4"><summary className="cursor-pointer text-sm font-medium">Journal des corrections terrain</summary>{query.data.employes.filter(e=>Array.isArray(e.historique_qualite)&&e.historique_qualite.length>0&&matches(nom(e))).map(e=><div key={e.id} className="py-3"><p className="font-medium">{nom(e)}</p><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">{JSON.stringify(e.historique_qualite,null,2)}</pre></div>)}</details>
      </TabsContent>
      <TabsContent value="commercial" className="space-y-6 pt-4">
        <RepriseClassementPj />
        <Groupe titre="Opportunités sans CA estimé" count={listes.sansCa.length}>{listes.sansCa.filter(x=>matches(x.affaire.numero,x.affaire.nom)).map(x=><Ligne key={x.affaire.id} actions={<SaisieCa proposition={x.proposition} onApply={n=>propose("Enregistrer le CA estimé",`${x.affaire.numero} · ${x.affaire.nom} : ${euros(n)} HT`,()=>appel(supabase.rpc("qualite_definir_ca",{_affaire:x.affaire.id,_ca:n})))}/>}><p>{x.affaire.numero} · {x.affaire.nom}</p><p className="text-muted-foreground">{x.devis?`Dernier devis ${x.devis.numero} · net HT ${euros(x.proposition)}`:"Aucun devis : montant à saisir"}</p></Ligne>)}</Groupe>
        <Groupe titre="Chargé d’affaires ou prochaine action à compléter" count={listes.sansSuivi.length}>{listes.sansSuivi.filter(a=>matches(a.numero,a.nom)).map(a=><Ligne key={a.id} actions={<Button asChild size="sm" variant="outline"><Link to="/affaires/$affaireId/opportunite" params={{affaireId:a.id}}>Ouvrir la fiche</Link></Button>}><p>{a.numero} · {a.nom}</p><p className="text-muted-foreground">{!a.charge_affaires_id?"Chargé d’affaires manquant":"Chargé d’affaires renseigné"} · {!query.data.actions.some(x=>x.affaire_id===a.id&&x.prochaine_action_due_le)?"Prochaine action non datée":"Action datée"}</p></Ligne>)}</Groupe>
        <Groupe titre="Demandes clients à rattacher" count={listes.demandes.length}>{listes.demandes.filter(e=>matches(e.subject,e.from_email,e.from_name)).map(e=><Ligne key={e.id} actions={<Choix label="Choisir le client" items={query.data.clients.filter(c=>c.actif)} onChange={id=>propose("Rattacher la demande",`${e.subject??"Demande"} → ${query.data?.clients.find(c=>c.id===id)?.nom}. Statut conservé.`,()=>appel(supabase.rpc("qualite_rattacher_demande",{_email:e.id,_client:id})))}/>}><p>{e.subject??"Sans objet"}</p><p className="text-muted-foreground">{e.from_name??e.from_email} · {date(e.received_at)} · {e.statut}</p></Ligne>)}</Groupe>
        <Groupe titre="Clients en doublon probable" count={listes.clients.length}>{listes.clients.filter(([a,b])=>matches(a.nom,b.nom)).map(([a,b])=><Ligne key={`${a.id}-${b.id}`} actions={<Choix label="Choisir le client à garder" items={[a,b]} onChange={id=>{const g=id===a.id?a:b,f=id===a.id?b:a;propose("Fusion assistée des clients",`Garder ${g.nom} (${g.id}), désactiver ${f.nom} (${f.id}). Références déplacées sans suppression.`,()=>appel(supabase.rpc("qualite_fusionner_clients",{_garder:g.id,_fusionner:f.id})));}}/>}><p>{a.nom} / {b.nom}</p><p className="text-muted-foreground">{a.siret??"SIRET absent"} / {b.siret??"SIRET absent"}</p></Ligne>)}</Groupe>
      </TabsContent>
      <TabsContent value="devis" className="space-y-6 pt-4"><Groupe titre="À revoir par Gabin" count={listes.devis.length}>{listes.devis.filter(x=>matches(x.devis.numero,x.affaire?.numero,x.affaire?.nom)).map(x=><Ligne key={x.devis.id} actions={x.affaire?<Button asChild size="sm" variant="outline"><Link to="/affaires/$affaireId/devis-staffing/$devisId" params={{affaireId:x.affaire.id,devisId:x.devis.id}}>Reprendre<ArrowRight className="ml-2 h-4 w-4"/></Link></Button>:<Button asChild size="sm" variant="outline"><Link to="/devis-staffing">Voir les devis</Link></Button>}><p className="font-medium">{x.devis.numero} · {x.affaire?.numero} {x.affaire?.nom}</p><p className="text-muted-foreground">Événement : {date(x.evenement)} · Demande : {date(x.demande)} · {euros(x.devis.net_ht)} HT · {x.affaire?.statut_opportunite??"Sans opportunité"} · {x.devis.statut_redaction}</p></Ligne>)}</Groupe></TabsContent>
    </Tabs>}
    <Dialog open={!!operation} onOpenChange={open=>{if(!open&&!busy)setOperation(null);}}><DialogContent><DialogHeader><DialogTitle>{operation?.titre}</DialogTitle><DialogDescription className="break-words">{operation?.description}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={()=>setOperation(null)} disabled={busy}>Annuler</Button><Button onClick={run} disabled={busy}>{busy&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Confirmer</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!resultat} onOpenChange={()=>setResultat(null)}><DialogContent><DialogHeader><DialogTitle>Bilan de la correction</DialogTitle><DialogDescription>Les références restées sont conservées et doivent être revues.</DialogDescription></DialogHeader><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{resultat}</pre><Button onClick={()=>setResultat(null)}>Fermer</Button></DialogContent></Dialog>
  </div>;
}