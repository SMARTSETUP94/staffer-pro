import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { lienDocument } from "@/lib/server-fns/documents-fournisseurs.functions";
import { ecartPct, TYPE_DOCUMENT_LABEL, type TypeDocument } from "@/lib/devis/documents-fournisseurs";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { erreurValidation, estChoixRequis, payloadValidation, type PropositionStatut, type ValidationForm } from "@/lib/devis/materiaux-propositions";

type Prop = {
  id: string; statut: PropositionStatut; fournisseur_id: string | null; fournisseur: string | null; fournisseur_libre: string | null;
  produit: string; ref: string | null; unite: string; format_texte: string | null; prix_achat: number | null; date_tarif: string | null;
  propose_par: string | null; propose_le: string; devis_id: string | null; devis_numero: string | null; affaire_id: string | null;
  decision_par: string | null; decision_le: string | null; motif_refus: string | null; remplace_materiau_id: string | null; meme_ref: string | null;
  document_id?: string | null; document_numero?: string | null; document_type?: string | null; document_date?: string | null;
  document_valide_jusquau?: string | null; type_prix?: "reference" | "ponctuel"; valide_jusquau?: string | null; prix_actuel?: number | null;
};
type Proche = { id: string; fournisseur: string | null; produit: string; ref: string | null; unite: string; prix_achat: number | null; date_tarif: string | null; meme_ref: boolean };

const FILTRES: { k: PropositionStatut; l: string }[] = [{ k: "propose", l: "À traiter" }, { k: "valide", l: "Validés" }, { k: "refuse", l: "Refusés" }];
const eur = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" }));
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR") : "—");

export function PrixProposes({ couts }: { couts: boolean }) {
  const qc = useQueryClient();
  const [statut, setStatut] = useState<PropositionStatut>("propose");
  const [ouverte, setOuverte] = useState<Prop | null>(null);
  const [aRefuser, setARefuser] = useState<Prop | null>(null);
  const [reprise, setReprise] = useState(false);
  const liste = useQuery({
    queryKey: ["materiaux-propositions", statut],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("materiaux_propositions_lister", { _statut: statut, _limit: 200, _offset: 0 });
      if (error) throw error;
      return data as unknown as { total: number; lignes: Prop[] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["materiaux-propositions"] });

  const desactiver = async (p: Prop) => {
    const { error } = await supabase.rpc("materiau_saisie_desactiver", { _id: p.id });
    if (error) return toast.error(error.message);
    toast.success("Saisie manuelle désactivée (conservée, non supprimée).");
    refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {FILTRES.map((f) => <Button key={f.k} size="sm" variant={statut === f.k ? "default" : "outline"} onClick={() => setStatut(f.k)}>{f.l}</Button>)}
        </div>
        <Button size="sm" variant="outline" onClick={() => setReprise(true)}>Reprendre les matériaux hors catalogue des devis</Button>
      </div>
      {liste.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Chargement…</p>}
      {liste.error && <p className="text-sm text-destructive">{(liste.error as Error).message}</p>}
      {liste.data && <p className="text-xs text-muted-foreground">{liste.data.total} proposition(s)</p>}
      {liste.data?.lignes.length === 0 && <p className="text-sm text-muted-foreground">Aucune proposition.</p>}
      <div className="space-y-2">
        {liste.data?.lignes.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{p.produit}</p>
                <p className="text-xs text-muted-foreground">
                  {[p.fournisseur ?? "Fournisseur à identifier", p.ref, p.unite, p.format_texte].filter(Boolean).join(" · ")}
                  {p.fournisseur_libre && !p.fournisseur_id && <Badge variant="outline" className="ml-1 text-[10px]">nom libre</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  Proposé par {p.propose_par ?? "—"} le {dt(p.propose_le)}
                  {p.devis_id && p.affaire_id && <> · devis <Link to="/affaires/$affaireId/devis-staffing/$devisId" params={{ affaireId: p.affaire_id, devisId: p.devis_id }} className="underline">{p.devis_numero ?? "ouvrir"}</Link></>}
                  {p.devis_id && !p.affaire_id && <> · devis {p.devis_numero ?? ""}</>}
                  {p.document_id && <> · {TYPE_DOCUMENT_LABEL[(p.document_type ?? "facture") as TypeDocument]} {p.document_numero ?? ""} <VoirDocument id={p.document_id} /></>}
                </p>
                {couts && p.statut === "propose" && p.prix_actuel != null && (
                  <p className="text-xs">Prix actuel au catalogue {eur(p.prix_actuel)} → {eur(p.prix_achat)}
                    {ecartPct(p.prix_actuel, p.prix_achat) != null && <Badge variant="outline" className="ml-1">{(ecartPct(p.prix_actuel, p.prix_achat)! > 0 ? "+" : "") + ecartPct(p.prix_actuel, p.prix_achat)!.toLocaleString("fr-FR")} %</Badge>}</p>
                )}
                {p.statut === "valide" && p.type_prix === "ponctuel" && <p className="text-xs">Prix ponctuel jusqu'au {dt(p.valide_jusquau ?? null)}</p>}
                {p.statut !== "propose" && <p className="text-xs">{p.statut === "valide" ? "Validé" : "Refusé"} par {p.decision_par ?? "—"} le {dt(p.decision_le)}{p.motif_refus && <> — motif : {p.motif_refus}</>}{p.remplace_materiau_id && " · a remplacé une ligne existante"}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {couts && <span className="text-sm font-semibold tabular-nums">{eur(p.prix_achat)}</span>}
                <span className="text-xs text-muted-foreground">tarif {dt(p.date_tarif)}</span>
                {p.meme_ref && p.statut === "propose" && <Badge variant="outline">même référence au catalogue</Badge>}
                {p.statut === "propose" && <>
                  <Button size="sm" onClick={() => setOuverte(p)}>Examiner</Button>
                  <Button size="sm" variant="outline" onClick={() => setARefuser(p)}>Refuser</Button>
                </>}
                {p.statut === "valide" && <Button size="sm" variant="ghost" onClick={() => void desactiver(p)}>Désactiver</Button>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {ouverte && <ValiderDialog p={ouverte} couts={couts} onClose={() => setOuverte(null)} onDone={refresh} />}
      {aRefuser && <RefuserDialog p={aRefuser} onClose={() => setARefuser(null)} onDone={refresh} />}
      {reprise && <RepriseDialog onClose={() => setReprise(false)} onDone={() => { setStatut("propose"); refresh(); }} />}
    </div>
  );
}

function ValiderDialog({ p, couts, onClose, onDone }: { p: Prop; couts: boolean; onClose: () => void; onDone: () => void }) {
  const fourn = useQuery({
    queryKey: ["materiaux-fournisseurs"],
    queryFn: async () => { const { data, error } = await supabase.rpc("materiaux_fournisseurs_stats"); if (error) throw error; return data ?? []; },
  });
  const proches = useQuery({
    queryKey: ["materiau-proches", p.id],
    queryFn: async () => { const { data, error } = await supabase.rpc("materiau_proposition_proches", { _id: p.id }); if (error) throw error; return (data ?? []) as unknown as Proche[]; },
  });
  const [f, setF] = useState<ValidationForm>({
    fournisseur_id: p.fournisseur_id ?? "", nouveau_fournisseur: "", produit: p.produit, ref: p.ref ?? "", unite: p.unite,
    prix_achat: p.prix_achat == null ? "" : String(p.prix_achat), date_tarif: p.date_tarif ?? "", mode: "",
    type_prix: "reference", valide_jusquau: p.document_valide_jusquau ?? "",
  });
  const [creer, setCreer] = useState(false);
  const [choixRequis, setChoixRequis] = useState(!!p.meme_ref);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ValidationForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const valider = async () => {
    const err = erreurValidation(creer ? f : { ...f, nouveau_fournisseur: "" }, couts, p.prix_achat);
    if (err) return toast.error(err);
    if (choixRequis && f.type_prix !== "ponctuel" && !f.mode) return toast.error("Choisissez « Remplacer » ou « Ajouter ».");
    setBusy(true);
    const { error } = await supabase.rpc("materiau_proposition_valider", { _id: p.id, _p: payloadValidation(creer ? f : { ...f, nouveau_fournisseur: "" }, couts) as never });
    setBusy(false);
    if (error) {
      if (estChoixRequis(error.message)) { setChoixRequis(true); return toast.error("Une ligne active a déjà ce fournisseur et cette référence : choisissez Remplacer ou Ajouter."); }
      return toast.error(error.message);
    }
    toast.success("Prix validé : il est maintenant disponible pour les devis suivants.");
    onDone(); onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Valider la proposition</DialogTitle>
          <DialogDescription>Corrigez si besoin, choisissez le fournisseur, puis validez. Aucun devis n'est modifié.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <p className="font-medium">Fournisseur</p>
            {!creer ? (
              <select aria-label="Fournisseur" className="h-9 w-full rounded-md border bg-background px-2" value={f.fournisseur_id} onChange={set("fournisseur_id")}>
                <option value="">— Choisir —</option>
                {(fourn.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
              </select>
            ) : <Input aria-label="Nouveau fournisseur" placeholder="Nom du nouveau fournisseur" value={f.nouveau_fournisseur} onChange={set("nouveau_fournisseur")} />}
            {p.fournisseur_libre && <p className="text-xs text-muted-foreground">Saisi par le chiffreur : « {p.fournisseur_libre} »</p>}
            <button type="button" className="text-xs text-primary underline" onClick={() => setCreer(!creer)}>{creer ? "Choisir dans la liste" : "Créer un nouveau fournisseur"}</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="Désignation" className="col-span-2" value={f.produit} onChange={set("produit")} />
            <Input aria-label="Référence" placeholder="Référence" value={f.ref} onChange={set("ref")} />
            <Input aria-label="Unité" placeholder="Unité" value={f.unite} onChange={set("unite")} />
            {couts && <Input aria-label="Prix d'achat" placeholder="Prix d'achat €" inputMode="decimal" value={f.prix_achat} onChange={set("prix_achat")} />}
            <Input aria-label="Date du tarif" type="date" value={f.date_tarif} onChange={set("date_tarif")} />
          </div>
          <div className="space-y-1 rounded-md border p-2">
            <p className="font-medium">Type de prix</p>
            <label className="flex items-center gap-2"><input type="radio" name="type_prix" checked={f.type_prix !== "ponctuel"} onChange={() => setF({ ...f, type_prix: "reference" })} />Prix de référence (sert à tous les devis suivants)</label>
            <label className="flex items-center gap-2"><input type="radio" name="type_prix" checked={f.type_prix === "ponctuel"} onChange={() => setF({ ...f, type_prix: "ponctuel", mode: "" })} />Prix ponctuel (offre limitée dans le temps, ne remplace jamais le prix de référence)</label>
            {f.type_prix === "ponctuel" && <Input aria-label="Valable jusqu'au" type="date" value={f.valide_jusquau ?? ""} onChange={(e) => setF({ ...f, valide_jusquau: e.target.value })} />}
          </div>
          {choixRequis && f.type_prix !== "ponctuel" && (
            <div className="space-y-1 rounded-md border p-2">
              <p className="font-medium">Une ligne active existe déjà avec ce fournisseur et cette référence</p>
              <label className="flex items-center gap-2"><input type="radio" name="mode" checked={f.mode === "remplacer"} onChange={() => setF({ ...f, mode: "remplacer" })} />Remplacer le prix de la ligne existante (l'ancienne est désactivée, jamais supprimée)</label>
              <label className="flex items-center gap-2"><input type="radio" name="mode" checked={f.mode === "ajouter"} onChange={() => setF({ ...f, mode: "ajouter" })} />Ajouter comme nouvelle ligne</label>
            </div>
          )}
          <div>
            <p className="mb-1 font-medium">Lignes proches du catalogue</p>
            {proches.isLoading ? <p className="text-xs text-muted-foreground">Recherche…</p> : (proches.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Aucune</p> : (
              <ul className="space-y-1 text-xs">
                {proches.data!.map((x) => <li key={x.id} className="flex justify-between gap-2"><span>{x.produit} <span className="text-muted-foreground">{[x.fournisseur, x.ref, x.unite].filter(Boolean).join(" · ")}</span>{x.meme_ref && <Badge variant="outline" className="ml-1 text-[10px]">même réf.</Badge>}</span>{couts && <span className="tabular-nums">{eur(x.prix_achat)}</span>}</li>)}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={valider} disabled={busy}>Valider</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoirDocument({ id }: { id: string }) {
  const lien = useServerFn(lienDocument);
  return <button type="button" className="underline" onClick={async () => {
    try { const { url } = await lien({ data: { id } }); window.open(url, "_blank", "noopener"); } catch (e) { toast.error((e as Error).message); }
  }}>voir</button>;
}

function RefuserDialog({ p, onClose, onDone }: { p: Prop; onClose: () => void; onDone: () => void }) {
  const [motif, setMotif] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Refuser « {p.produit} »</DialogTitle><DialogDescription>Le motif est obligatoire. La proposition reste consultable dans « Refusés ».</DialogDescription></DialogHeader>
        <Textarea aria-label="Motif du refus" placeholder="Motif du refus" value={motif} onChange={(e) => setMotif(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="destructive" disabled={!motif.trim()} onClick={async () => {
            const { error } = await supabase.rpc("materiau_proposition_refuser", { _id: p.id, _motif: motif.trim() });
            if (error) return toast.error(error.message);
            toast.success("Proposition refusée."); onDone(); onClose();
          }}>Refuser</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepriseDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reprendre les matériaux hors catalogue</DialogTitle>
          <DialogDescription>Les matériaux saisis à la main dans les devis deviennent des propositions « À traiter », regroupées par fournisseur et désignation (prix le plus récent). Rien n'entre au catalogue sans validation, aucun devis n'est modifié.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            const { data, error } = await supabase.rpc("materiaux_reprendre_hors_catalogue");
            setBusy(false);
            if (error) return toast.error(error.message);
            toast.success(`${(data as { propositions_creees: number }).propositions_creees} proposition(s) créée(s).`);
            onDone(); onClose();
          }}>Lancer la reprise</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
