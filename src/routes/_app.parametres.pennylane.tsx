import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { etatPennylane, rapprochementClients } from "@/lib/devis/pennylane.functions";
import type { Rapprochement } from "@/lib/devis/pennylane";

export const Route = createFileRoute("/_app/parametres/pennylane")({
  beforeLoad: () => requireCapability("devis.pennylane"),
  head: () => ({ meta: [
    { title: "Rapprochement clients Pennylane — Staffing SET UP" },
    { name: "description", content: "Rapprocher les clients Staffing des clients Pennylane avant le transfert des devis signés." },
    { property: "og:title", content: "Rapprochement clients Pennylane" },
    { property: "og:description", content: "Appariement par SIRET, TVA intracommunautaire puis nom, validé par un humain." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: PagePennylane,
});

type Filtre = "douteux" | "sur" | "aucun" | "rapproche";
const LIBELLES: Record<Filtre, string> = { douteux: "À valider", sur: "Sûrs", aucun: "Sans correspondance", rapproche: "Rapprochés" };

function PagePennylane() {
  const qc = useQueryClient();
  const etatFn = useServerFn(etatPennylane);
  const rappFn = useServerFn(rapprochementClients);
  const etat = useQuery({ queryKey: ["pennylane-etat"], queryFn: () => etatFn() });
  const [lancer, setLancer] = useState(false);
  const r = useQuery({ queryKey: ["pennylane-rapprochement"], enabled: lancer && !!etat.data?.jeton, queryFn: () => rappFn(), staleTime: 5 * 60_000 });
  const [filtre, setFiltre] = useState<Filtre>("douteux");
  const [lot, setLot] = useState(false);
  const lignes = r.data?.lignes ?? [];
  const compte = useMemo(() => Object.fromEntries((Object.keys(LIBELLES) as Filtre[]).map((f) => [f, lignes.filter((l) => l.statut === f).length])), [lignes]);
  const visibles = lignes.filter((l) => l.statut === filtre);

  const valider = async (l: Rapprochement, plId: string, motif: string) => {
    const { error } = await supabase.rpc("client_pennylane_rapprocher", { _client_id: l.client.id, _pennylane_id: plId, _motif: motif });
    if (error) { toast.error(error.message); return false; }
    return true;
  };
  const recharger = () => qc.invalidateQueries({ queryKey: ["pennylane-rapprochement"] });

  return (
    <div className="space-y-4 p-3 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Rapprochement clients Pennylane</h1>
        <p className="text-sm text-muted-foreground">Associez chaque client Staffing à son client Pennylane avant de transférer un devis. Rien n'est enregistré sans votre clic ; aucun client n'est créé dans Pennylane depuis cet écran.</p>
      </div>
      {etat.data && !etat.data.jeton && (
        <Card className="border-destructive/50"><CardContent className="p-4 text-sm">Le jeton Pennylane n'est pas encore configuré. Gabin doit l'ajouter dans les paramètres du projet, rubrique Secrets, sous le nom <strong>PENNYLANE_API_TOKEN</strong>.</CardContent></Card>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!etat.data?.jeton || r.isFetching} onClick={() => { setLancer(true); void recharger(); }}><RefreshCw className={`mr-1 h-4 w-4 ${r.isFetching ? "animate-spin" : ""}`} />Relire les clients Pennylane</Button>
        {r.data && <span className="text-xs text-muted-foreground">{r.data.nbPennylane} clients Pennylane lus</span>}
        {r.data?.erreur && <span className="text-sm text-destructive">{r.data.erreur}</span>}
      </div>
      {lignes.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(LIBELLES) as Filtre[]).map((f) => (
              <Button key={f} size="sm" variant={filtre === f ? "default" : "outline"} onClick={() => setFiltre(f)}>{LIBELLES[f]} ({compte[f]})</Button>
            ))}
            {filtre === "sur" && compte["sur"] ? <Button size="sm" variant="secondary" onClick={() => setLot(true)}>Valider les {compte["sur"]} sûrs…</Button> : null}
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{LIBELLES[filtre]}</CardTitle>
              <CardDescription>Appariement par SIRET, puis TVA intracommunautaire, puis nom. Un nom seul n'est jamais considéré comme sûr.</CardDescription></CardHeader>
            <CardContent className="p-0 md:p-2">
              <div className="divide-y">
                {visibles.map((l) => <LigneRapp key={l.client.id} l={l} onValider={async (id, motif) => { if (await valider(l, id, motif)) { toast.success(`${l.client.nom} rapproché`); void recharger(); } }} />)}
                {!visibles.length && <p className="p-4 text-sm text-muted-foreground">Aucun client.</p>}
              </div>
            </CardContent>
          </Card>
        </>
      )}
      <Dialog open={lot} onOpenChange={setLot}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Valider {compte["sur"]} rapprochements sûrs</DialogTitle><DialogDescription>Un seul client Pennylane a le même SIRET, SIREN ou numéro de TVA.</DialogDescription></DialogHeader>
          <ul className="space-y-1 text-sm">{lignes.filter((l) => l.statut === "sur").map((l) => <li key={l.client.id}>{l.client.nom} → <strong>{l.candidats[0]?.name}</strong> <span className="text-xs text-muted-foreground">({l.motif})</span></li>)}</ul>
          <DialogFooter><Button variant="outline" onClick={() => setLot(false)}>Annuler</Button>
            <Button onClick={async () => {
              let n = 0;
              for (const l of lignes.filter((x) => x.statut === "sur")) if (l.candidats[0] && await valider(l, l.candidats[0].id, l.motif ?? "sûr")) n++;
              toast.success(`${n} client(s) rapproché(s)`); setLot(false); void recharger();
            }}>Valider</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LigneRapp({ l, onValider }: { l: Rapprochement; onValider: (pennylaneId: string, motif: string) => void }) {
  const [sel, setSel] = useState(l.candidats[0]?.id ?? "");
  return (
    <div className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{l.client.nom}</p>
        <p className="text-xs text-muted-foreground">SIRET {l.client.siret || "—"} · TVA {l.client.tva_intracom || "—"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {l.statut === "rapproche" ? <span>→ {l.candidats[0]?.name ?? `n° ${l.client.pennylane_id}`}</span>
          : l.candidats.length === 0 ? <span className="text-muted-foreground">Aucune correspondance — créez le client dans Pennylane puis relisez.</span>
          : <>
              <select aria-label={`Client Pennylane pour ${l.client.nom}`} className="h-8 max-w-64 rounded-md border bg-background px-2" value={sel} onChange={(e) => setSel(e.target.value)}>
                {l.candidats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.reg_no ? ` · ${c.reg_no}` : ""}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">{l.motif}</span>
              <Button size="sm" disabled={!sel} onClick={() => onValider(sel, l.motif ?? "manuel")}>Valider</Button>
            </>}
      </div>
    </div>
  );
}
