import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useDevisClaude, BadgeClaude } from "@/components/devis/RedactionClaude";
import { supabase } from "@/integrations/supabase/client";
import { requireCapability } from "@/lib/capability-guard";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { useCapability } from "@/hooks/use-capability";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { STATUT_LABEL, eur, type DevisStatut } from "@/components/devis/editeur/api";
import { libelleStatutDevis } from "@/lib/devis/progbat-export";
import { SupprimerDevisDialog, SUPPRESSION_REFUSEE, devisSupprimable } from "@/components/devis/SupprimerDevis";
import { useModelesDevis } from "@/components/devis/useModelesDevis";
import { ExportPdfDialog } from "@/components/devis/DevisPdfEnvoi";

export const Route = createFileRoute("/_app/devis-staffing/")({
  beforeLoad: () => requireCapability("devis.view"),
  head: () => ({
    meta: [
      { title: "Devis — Staffing Setup Paris" },
      { name: "description", content: "Tous les devis rédigés dans Staffing : statut, montant net, chargé d'affaires." },
      { property: "og:title", content: "Devis — Staffing Setup Paris" },
      { property: "og:description", content: "Liste des devis Staffing avec recherche et filtres." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DevisGlobal,
});

type Row = {
  id: string; numero: string; version: number; statut_redaction: DevisStatut; affaire_id: string; affaire_numero: string | null;
  affaire_nom: string | null; client_nom: string | null; net_ht: number | null; date_devis: string | null;
  charge_affaires_id: string | null; charge_affaires_nom: string | null; numero_progbat: string | null; date_envoi: string | null;
};

const STATUTS: DevisStatut[] = ["brouillon", "a_valider", "valide", "transfere", "signe", "refuse"];

function DevisGlobal() {
  const on = useFeatureFlag("devis_staffing_v1");
  const canWrite = useCapability("devis.rediger");
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [statuts, setStatuts] = useState<DevisStatut[]>([]);
  const [ca, setCa] = useState("");
  const [open, setOpen] = useState(false);
  const [aSupprimer, setASupprimer] = useState<{ id: string; numero: string } | null>(null);
  const [pdfId, setPdfId] = useState<string | null>(null);

  const liste = useQuery({
    queryKey: ["devis-staffing-global"],
    enabled: on,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("devis_lister_global", { _limit: 500 });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (liste.data ?? []).filter((r) =>
      (!statuts.length || statuts.includes(r.statut_redaction)) &&
      (!ca || r.charge_affaires_id === ca) &&
      (!t || [r.numero, r.affaire_numero, r.affaire_nom, r.client_nom].some((x) => x?.toLowerCase().includes(t))));
  }, [liste.data, q, statuts, ca]);
  const claude = useDevisClaude((liste.data ?? []).map((r) => r.id));
  const cas = useMemo(() => [...new Map((liste.data ?? []).filter((r) => r.charge_affaires_id).map((r) => [r.charge_affaires_id!, r.charge_affaires_nom ?? "—"])).entries()], [liste.data]);

  if (!on) return <p className="p-6 text-sm text-muted-foreground">Le module Devis n'est pas activé pour votre compte.</p>;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Devis</h1>
        {canWrite && <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Nouveau devis</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Numéro, affaire, client…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Chargé d'affaires" className="h-9 rounded-md border bg-background px-2 text-sm" value={ca} onChange={(e) => setCa(e.target.value)}>
          <option value="">Tous les chargés d'affaires</option>
          {cas.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
        </select>
        <div className="flex flex-wrap gap-1">
          {STATUTS.map((s) => (
            <button key={s} type="button" onClick={() => setStatuts((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${statuts.includes(s) ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
              {STATUT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      {liste.isLoading ? <p className="text-sm text-muted-foreground">Chargement…</p>
        : liste.error ? <p className="text-sm text-destructive">{(liste.error as Error).message}</p>
        : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Numéro</TableHead><TableHead>Affaire</TableHead><TableHead>Client</TableHead><TableHead>Statut</TableHead>
              <TableHead className="text-right">Total net HT</TableHead><TableHead>Date</TableHead><TableHead>Chargé d'affaires</TableHead><TableHead className="w-10" />
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate({ to: "/affaires/$affaireId/devis-staffing/$devisId", params: { affaireId: r.affaire_id, devisId: r.id } })}>
                  <TableCell className="font-medium">{r.numero} <span className="text-xs text-muted-foreground">R{r.version}</span>{claude.data?.has(r.id) && <BadgeClaude />}{r.numero_progbat && <span className="block text-xs text-muted-foreground">ProGBat {r.numero_progbat}</span>}</TableCell>
                  <TableCell>{[r.affaire_numero, r.affaire_nom].filter(Boolean).join(" · ")}</TableCell>
                  <TableCell>{r.client_nom ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{libelleStatutDevis(r.statut_redaction, r.numero_progbat, r.date_envoi, STATUT_LABEL)}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{r.net_ht == null ? "—" : eur(Number(r.net_ht))}</TableCell>
                  <TableCell>{r.date_devis ? new Date(r.date_devis).toLocaleDateString("fr-FR") : "—"}</TableCell>
                  <TableCell>{r.charge_affaires_nom || "—"}</TableCell>
                  {(
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Actions ${r.numero}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setPdfId(r.id)}>Exporter en PDF</DropdownMenuItem>
                          {canWrite && <>
                          <DropdownMenuItem disabled={!devisSupprimable(r.statut_redaction)} className="text-destructive"
                            onSelect={() => setASupprimer({ id: r.id, numero: r.numero })}>Supprimer le devis</DropdownMenuItem>
                          {!devisSupprimable(r.statut_redaction) && <p className="max-w-64 px-2 pb-1.5 text-xs text-muted-foreground">{SUPPRESSION_REFUSEE}</p>}
                          </>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Aucun devis.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      <p className="text-xs text-muted-foreground">Anciens devis importés de ProGBat : <Link to="/devis" className="underline">historique des imports</Link>.</p>
      <NouveauDevisDialog open={open} onOpenChange={setOpen} />
      {pdfId && <ExportPdfDialog devisId={pdfId} open onOpenChange={(o) => { if (!o) setPdfId(null); }} />}
      <SupprimerDevisDialog devis={aSupprimer} open={!!aSupprimer} onOpenChange={(o) => { if (!o) setASupprimer(null); }} onDone={() => void liste.refetch()} />
    </div>
  );
}

function NouveauDevisDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [aff, setAff] = useState<{ id: string; label: string } | null>(null);
  const [modeleChoisi, setModele] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const opps = useQuery({
    queryKey: ["devis-nouveau-opps", q],
    enabled: open && q.trim().length >= 2,
    queryFn: async () => {
      const t = q.trim().replace(/[%,()]/g, " ");
      const { data, error } = await supabase.from("affaires").select("id,numero,code_opportunite,nom")
        .eq("phase", "opportunite").or(`nom.ilike.%${t}%,numero.ilike.%${t}%,code_opportunite.ilike.%${t}%`).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  const modeles = useModelesDevis(open);
  // Présélection : modèle par défaut tant que l'utilisateur n'a rien choisi ("" = devis vierge)
  const modele = modeleChoisi ?? modeles.data?.defautId ?? "";
  const creer = async () => {
    if (!aff || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("devis_creer_depuis_pipeline", { _affaire_id: aff.id, _modele_id: (modele || null) as string });
    setBusy(false);
    if (error) return toast.error(error.message);
    const res = (typeof data === "string" ? { devis_id: data, existant: false } : data) as { devis_id?: string; existant?: boolean } | null;
    const id = res?.devis_id;
    if (id && res?.existant) {
      const { data: ex } = await supabase.from("devis").select("numero,version").eq("id", id).maybeSingle();
      toast.info(`Cette opportunité a déjà le devis ${ex?.numero ?? ""} (R${ex?.version ?? 1}) : ouvert. Pour une nouvelle version, utilisez « Nouvelle version ».`, { duration: 10000 });
    }
    onOpenChange(false);
    if (id) navigate({ to: "/affaires/$affaireId/devis-staffing/$devisId", params: { affaireId: aff.id, devisId: id } });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau devis</DialogTitle>
          <DialogDescription>Choisissez l'opportunité, puis un devis vierge ou un modèle.</DialogDescription>
        </DialogHeader>
        {aff ? (
          <div className="flex items-center justify-between rounded border p-2 text-sm"><span>{aff.label}</span>
            <button type="button" className="text-xs underline" onClick={() => setAff(null)}>Changer</button></div>
        ) : (
          <div className="space-y-1">
            <Input autoFocus placeholder="Rechercher une opportunité (numéro ou nom)…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-56 overflow-auto">
              {(opps.data ?? []).map((o) => {
                const label = [o.code_opportunite ?? o.numero, o.nom].filter(Boolean).join(" · ");
                return <button key={o.id} type="button" className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => setAff({ id: o.id, label })}>{label}</button>;
              })}
            </div>
          </div>
        )}
        <select aria-label="Modèle" className="h-9 rounded-md border bg-background px-2 text-sm" value={modele} onChange={(e) => setModele(e.target.value)}>
          <option value="">Devis vierge</option>
          {(modeles.data?.modeles ?? []).map((m) => <option key={m.id} value={m.id}>Modèle : {m.modele_nom}{m.id === modeles.data?.defautId ? " (par défaut)" : ""}</option>)}
        </select>
        <DialogFooter><Button disabled={!aff || busy} onClick={() => void creer()}>Créer le devis</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
