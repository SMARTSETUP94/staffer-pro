import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  TAILLE_MAX_DOCUMENT, TYPE_DOCUMENT_LABEL, ecartPct, messageDoublon, nombre, trouverFournisseur, type TypeDocument,
} from "@/lib/devis/documents-fournisseurs";
import {
  abandonnerDepot, deposerEtLireDocument, lienDocument, soumettreDocument, type ResultatLecture,
} from "@/lib/server-fns/documents-fournisseurs.functions";

type Doc = {
  id: string; nom_fichier: string; fournisseur: string | null; type_document: TypeDocument; numero: string | null; date_document: string | null;
  valide_jusquau: string | null; reference_projet: string | null; nb_lignes: number; nb_ecartees: number; depose_par: string | null; depose_le: string;
  en_attente: number; valides: number; refuses: number;
};
type Rappro = {
  index: number;
  meme_ref: { id: string; produit: string; ref: string; prix_achat: number | null; date_tarif: string | null } | null;
  proches: { id: string; fournisseur: string | null; produit: string; ref: string | null; unite: string; prix_achat: number | null }[];
};
type Ligne = { garder: boolean; ref: string; produit: string; format_texte: string; unite: string; quantite: string; prix: string };

const eur = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" }));
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR") : "—");

async function fichierEnBase64(f: File): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function DocumentsFournisseurs() {
  const qc = useQueryClient();
  const deposer = useServerFn(deposerEtLireDocument);
  const lien = useServerFn(lienDocument);
  const [lecture, setLecture] = useState<{ r: ResultatLecture; fichier: File } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const docs = useQuery({
    queryKey: ["materiaux-documents"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("materiaux_documents_lister", { _limit: 50, _offset: 0 });
      if (error) throw error;
      return data as unknown as { total: number; lignes: Doc[] };
    },
  });

  const choisir = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > TAILLE_MAX_DOCUMENT) return toast.error("Fichier trop volumineux (10 Mo maximum).");
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) return toast.error("Formats acceptés : PDF, JPG ou PNG.");
    setBusy("Lecture du document…");
    try {
      const r = await deposer({ data: { nom: f.name, base64: await fichierEnBase64(f) } });
      setLecture({ r, fichier: f });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  };

  const ouvrir = async (id: string) => {
    try { const { url } = await lien({ data: { id } }); window.open(url, "_blank", "noopener"); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm">
            <p className="font-medium">Déposer une facture, une proposition de prix ou une confirmation de commande</p>
            <p className="text-muted-foreground">PDF, JPG ou PNG, 10 Mo maximum. Les lignes lues sont à relire avant envoi ; rien n'entre au catalogue sans validation.</p>
          </div>
          <label className="inline-flex shrink-0">
            <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" aria-label="Déposer un document fournisseur"
              disabled={!!busy} onChange={(e) => { void choisir(e.target.files?.[0]); e.target.value = ""; }} />
            <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}{busy ?? "Choisir un fichier"}
            </span>
          </label>
        </CardContent>
      </Card>

      {docs.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Chargement…</p>}
      {docs.error && <p className="text-sm text-destructive">{(docs.error as Error).message}</p>}
      {docs.data?.lignes.length === 0 && <p className="text-sm text-muted-foreground">Aucun document déposé.</p>}
      <div className="space-y-2">
        {docs.data?.lignes.map((d) => (
          <Card key={d.id}>
            <CardContent className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 text-sm">
                <p className="font-medium">{d.fournisseur} · {TYPE_DOCUMENT_LABEL[d.type_document]} {d.numero ? `n° ${d.numero}` : ""}</p>
                <p className="text-xs text-muted-foreground">
                  du {dt(d.date_document)}{d.valide_jusquau && ` · valable jusqu'au ${dt(d.valide_jusquau)}`}{d.reference_projet && ` · réf. ${d.reference_projet}`} · déposé par {d.depose_par ?? "—"} le {dt(d.depose_le)}
                </p>
                <p className="text-xs">{d.nb_lignes} ligne(s) : {d.en_attente} à traiter, {d.valides} validée(s), {d.refuses} refusée(s){d.nb_ecartees > 0 && ` · ${d.nb_ecartees} ligne(s) de frais écartée(s)`}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void ouvrir(d.id)}>Voir le document</Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {lecture && <DocumentApercu r={lecture.r} fichier={lecture.fichier} onClose={() => setLecture(null)}
        onDone={() => { void qc.invalidateQueries({ queryKey: ["materiaux-documents"] }); void qc.invalidateQueries({ queryKey: ["materiaux-propositions"] }); }} />}
    </div>
  );
}

function DocumentApercu({ r, fichier, onClose, onDone }: { r: ResultatLecture; fichier: File; onClose: () => void; onDone: () => void }) {
  const soumettre = useServerFn(soumettreDocument);
  const abandonner = useServerFn(abandonnerDepot);
  const fourn = useQuery({
    queryKey: ["materiaux-fournisseurs"],
    queryFn: async () => { const { data, error } = await supabase.rpc("materiaux_fournisseurs_stats"); if (error) throw error; return data ?? []; },
  });
  const [fournisseurId, setFournisseurId] = useState<string>("");
  const [libre, setLibre] = useState(r.lecture.fournisseur ?? "");
  const [entete, setEntete] = useState({
    type_document: r.lecture.type_document, numero: r.lecture.numero ?? "", date_document: r.lecture.date_document ?? "",
    valide_jusquau: r.lecture.valide_jusquau ?? "", reference_projet: r.lecture.reference_projet ?? "",
  });
  const [lignes, setLignes] = useState<Ligne[]>(() => r.materiaux.map((l) => ({
    garder: true, ref: l.ref ?? "", produit: l.produit, format_texte: l.format_texte ?? "", unite: l.unite ?? "",
    quantite: l.quantite == null ? "" : String(l.quantite), prix: l.prix_net_ht == null ? "" : String(l.prix_net_ht).replace(".", ","),
  })));
  const [busy, setBusy] = useState(false);
  const url = useMemo(() => URL.createObjectURL(fichier), [fichier]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    if (fourn.data && !fournisseurId) { const f = trouverFournisseur(r.lecture.fournisseur, fourn.data); if (f) setFournisseurId(f.id); }
  }, [fourn.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const cleRappro = JSON.stringify([fournisseurId, lignes.map((l) => [l.ref, l.produit])]);
  const rappro = useQuery({
    queryKey: ["materiaux-document-rappro", cleRappro],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("materiaux_document_rapprocher", {
        _fournisseur_id: (fournisseurId || null) as never, _lignes: lignes.map((l) => ({ ref: l.ref, produit: l.produit })) as never,
      });
      if (error) throw error;
      return data as unknown as Rappro[];
    },
  });

  const set = (i: number, k: keyof Ligne, v: string | boolean) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const fermer = async () => { if (!busy) { void abandonner({ data: { chemin: r.chemin } }).catch(() => undefined); onClose(); } };

  const envoyer = async () => {
    const choisies = lignes.filter((l) => l.garder);
    if (choisies.length === 0) return toast.error("Gardez au moins une ligne.");
    if (!fournisseurId && !libre.trim()) return toast.error("Indiquez le fournisseur.");
    const bad = choisies.findIndex((l) => !l.produit.trim() || !((nombre(l.prix) ?? 0) > 0));
    if (bad >= 0) return toast.error(`Ligne ${bad + 1} : désignation et prix supérieur à 0 obligatoires.`);
    setBusy(true);
    try {
      const res = await soumettre({ data: {
        chemin: r.chemin, nom_fichier: fichier.name, fournisseur_id: fournisseurId || null, fournisseur_libre: fournisseurId ? null : libre.trim(),
        type_document: entete.type_document, numero: entete.numero.trim() || null, date_document: entete.date_document || null,
        valide_jusquau: entete.valide_jusquau || null, reference_projet: entete.reference_projet.trim() || null,
        lignes_ecartees: r.ecartees,
        lignes: choisies.map((l) => ({
          ref: l.ref.trim() || null, produit: l.produit.trim(), format_texte: l.format_texte.trim() || null, unite: l.unite.trim() || null,
          prix: nombre(l.prix)!, remarque: l.quantite ? `Quantité du document : ${l.quantite}` : null,
        })),
      } });
      toast.success(`${res.propositions} prix envoyé(s) pour validation par un administrateur.`);
      onDone(); onClose();
    } catch (e) {
      toast.error(messageDoublon((e as Error).message) ?? (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && void fermer()}>
      <DialogContent className="max-h-[95vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Relire le document avant envoi</DialogTitle>
          <DialogDescription>Lu en {(r.duree_ms / 1000).toFixed(1)} s. Corrigez si besoin ; rien n'est créé avant « Envoyer pour validation ».</DialogDescription>
        </DialogHeader>
        {r.doublon && <p className="rounded-md border border-destructive p-2 text-sm text-destructive">
          Ce document a déjà été déposé le {dt(r.doublon.depose_le)}{r.doublon.numero && ` (n° ${r.doublon.numero})`} : il ne sera pas recréé.</p>}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="min-h-[200px] space-y-1 overflow-hidden rounded-md border bg-muted">
            <a href={url} target="_blank" rel="noopener" className="block px-2 pt-1 text-xs underline">Ouvrir le document dans un onglet</a>
            {fichier.type === "application/pdf" || /\.pdf$/i.test(fichier.name)
              ? <iframe title="Document déposé" src={url} className="h-[35vh] w-full lg:h-[60vh]" />
              : <img src={url} alt="Document déposé" className="w-full object-contain" />}
          </div>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="space-y-1"><span className="text-xs text-muted-foreground">Fournisseur du catalogue</span>
                <select aria-label="Fournisseur" className="h-9 w-full rounded-md border bg-background px-2" value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)}>
                  <option value="">— Autre (nom libre) —</option>
                  {(fourn.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
                </select></label>
              {!fournisseurId && <label className="space-y-1"><span className="text-xs text-muted-foreground">Nom lu</span>
                <Input aria-label="Nom du fournisseur" value={libre} onChange={(e) => setLibre(e.target.value)} /></label>}
              <label className="space-y-1"><span className="text-xs text-muted-foreground">Type</span>
                <select aria-label="Type de document" className="h-9 w-full rounded-md border bg-background px-2" value={entete.type_document}
                  onChange={(e) => setEntete({ ...entete, type_document: e.target.value as TypeDocument })}>
                  {Object.entries(TYPE_DOCUMENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select></label>
              <label className="space-y-1"><span className="text-xs text-muted-foreground">Numéro</span>
                <Input aria-label="Numéro" value={entete.numero} onChange={(e) => setEntete({ ...entete, numero: e.target.value })} /></label>
              <label className="space-y-1"><span className="text-xs text-muted-foreground">Date</span>
                <Input aria-label="Date du document" type="date" value={entete.date_document} onChange={(e) => setEntete({ ...entete, date_document: e.target.value })} /></label>
              <label className="space-y-1"><span className="text-xs text-muted-foreground">Valable jusqu'au</span>
                <Input aria-label="Valable jusqu'au" type="date" value={entete.valide_jusquau} onChange={(e) => setEntete({ ...entete, valide_jusquau: e.target.value })} /></label>
              <label className="space-y-1 sm:col-span-2"><span className="text-xs text-muted-foreground">Référence projet</span>
                <Input aria-label="Référence projet" value={entete.reference_projet} onChange={(e) => setEntete({ ...entete, reference_projet: e.target.value })} /></label>
            </div>
            <div className="space-y-2">
              <p className="font-medium">{lignes.length} ligne(s) de matériaux</p>
              {lignes.map((l, i) => {
                const rp = rappro.data?.[i];
                const pct = ecartPct(rp?.meme_ref?.prix_achat, nombre(l.prix));
                return (
                  <div key={i} className="space-y-2 rounded-md border p-2" data-testid="ligne-document">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" aria-label={`Garder la ligne ${i + 1}`} className="mt-2" checked={l.garder} onChange={(e) => set(i, "garder", e.target.checked)} />
                      <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-6">
                        <Input aria-label="Référence" placeholder="Réf." value={l.ref} onChange={(e) => set(i, "ref", e.target.value)} />
                        <Input aria-label="Désignation" className="col-span-2 sm:col-span-5" value={l.produit} onChange={(e) => set(i, "produit", e.target.value)} />
                        <Input aria-label="Format" placeholder="Format" className="sm:col-span-2" value={l.format_texte} onChange={(e) => set(i, "format_texte", e.target.value)} />
                        <Input aria-label="Quantité" placeholder="Qté" value={l.quantite} onChange={(e) => set(i, "quantite", e.target.value)} />
                        <Input aria-label="Unité" placeholder="Unité" value={l.unite} onChange={(e) => set(i, "unite", e.target.value)} />
                        <Input aria-label="Prix net HT" placeholder="Prix net HT" inputMode="decimal" className="sm:col-span-2" value={l.prix} onChange={(e) => set(i, "prix", e.target.value)} />
                      </div>
                    </div>
                    <div className="pl-6 text-xs">
                      {rappro.isLoading ? <span className="text-muted-foreground">Rapprochement…</span>
                        : rp?.meme_ref ? (
                          <span>Au catalogue : {eur(rp.meme_ref.prix_achat)} (tarif {dt(rp.meme_ref.date_tarif)}) → {eur(nombre(l.prix))}
                            {pct != null && <Badge variant={pct < 0 ? "secondary" : "destructive"} className="ml-2">{pct > 0 ? "+" : ""}{pct.toLocaleString("fr-FR")} %</Badge>}</span>
                        ) : (
                          <span className="text-muted-foreground">Nouvelle ligne{rp && rp.proches.length > 0 ? " — proches : " + rp.proches.map((p) => `${p.produit} (${p.fournisseur ?? "?"}, ${eur(p.prix_achat)})`).join(" ; ") : ""}</span>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
            {r.ecartees.length > 0 && <div className="rounded-md bg-muted p-2 text-xs">
              <p className="font-medium">Frais écartés (non envoyés au catalogue)</p>
              <ul>{r.ecartees.map((e, i) => <li key={i}>{e.produit} — {eur(e.montant)}</li>)}</ul></div>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => void fermer()} disabled={busy}>Annuler</Button>
          <Button onClick={() => void envoyer()} disabled={busy || !!r.doublon}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Envoyer pour validation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
