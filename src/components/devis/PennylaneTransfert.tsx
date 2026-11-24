import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/use-capability";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { avecOptionsRetenues, optionsDuDevis, type DonneesPennylane } from "@/lib/devis/pennylane";
import { exporterDevisPdf, lireDevisClient } from "@/lib/devis/pdf-export";
import { preparerTransfert, transfererDevis } from "@/lib/devis/pennylane.functions";

const eur = (v: number | null | undefined) => `${(v ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Bloc « Pennylane » d'un devis : bouton manuel de transfert (devis signé), puis lien et numéro Pennylane. */
export function PennylaneTransfert({ devisId, statut }: { devisId: string; statut: string }) {
  const peut = useCapability("devis.pennylane");
  const qc = useQueryClient();
  const etat = useQuery({
    queryKey: ["devis-pennylane", devisId], enabled: peut,
    queryFn: async () => {
      const { data } = await supabase.from("devis").select("pennylane_quote_id,pennylane_numero,pennylane_lien,pennylane_etat,pennylane_transfere_le,pennylane_total_ht,pennylane_transfere_par,remise_mode,remise_valeur,client_id,clients!devis_client_id_fkey(pennylane_id)").eq("id", devisId).maybeSingle();
      return data;
    },
  });
  const [open, setOpen] = useState(false);
  if (!peut || !etat.data) return null;
  const e = etat.data;
  const rapproche = !!(e.clients as unknown as { pennylane_id: string | null } | null)?.pennylane_id;
  if (e.pennylane_quote_id) {
    return (
      <p className={`mt-1 flex flex-wrap items-center gap-1 text-xs ${e.pennylane_etat === "ecart" ? "text-destructive" : ""}`}>
        {e.pennylane_etat === "ecart" && <AlertTriangle className="h-3.5 w-3.5" />}
        Pennylane <strong>{e.pennylane_numero || `n° ${e.pennylane_quote_id}`}</strong>
        {e.pennylane_transfere_le && ` · transféré le ${new Date(e.pennylane_transfere_le).toLocaleDateString("fr-FR")}`}
        {e.pennylane_etat === "ecart" && ` · écart de total HT (Pennylane ${eur(Number(e.pennylane_total_ht))}) — laissé en brouillon`}
        <a href={e.pennylane_lien || "https://app.pennylane.com/"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">Ouvrir dans Pennylane<ExternalLink className="h-3 w-3" /></a>
      </p>
    );
  }
  if (statut !== "signe") return null;
  return (
    <div className="mt-2 space-y-1">
      <Button size="sm" variant="outline" disabled={!rapproche} onClick={() => setOpen(true)}><Send className="mr-1 h-4 w-4" />Transférer vers Pennylane</Button>
      {!rapproche && <p className="text-xs text-destructive">⚠ Client non rapproché avec Pennylane · <Link to="/parametres/pennylane" className="underline">Rapprocher</Link></p>}
      {e.pennylane_etat === "echec" && <p className="text-xs text-destructive">Le dernier essai a échoué ; vous pouvez réessayer.</p>}
      {open && <DialogueOptions devisId={devisId} remise={{ mode: e.remise_mode, valeur: e.remise_valeur == null ? null : Number(e.remise_valeur) }} onClose={() => setOpen(false)}
        onFini={() => { void qc.invalidateQueries({ queryKey: ["devis-pennylane", devisId] }); }} />}
    </div>
  );
}

function DialogueOptions({ devisId, remise, onClose, onFini }: { devisId: string; remise: { mode: string | null; valeur: number | null }; onClose: () => void; onFini: () => void }) {
  const preparer = useServerFn(preparerTransfert);
  const transferer = useServerFn(transfererDevis);
  const vc = useQuery({ queryKey: ["devis-client-pl", devisId], queryFn: () => lireDevisClient(supabase, devisId) });
  const [choix, setChoix] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const donnees = vc.data ? ({ ...vc.data, remise_mode: remise.mode, remise_valeur: remise.valeur } as DonneesPennylane) : null;
  const options = useMemo(() => (donnees ? optionsDuDevis(donnees) : []), [donnees]);
  const avant = useMemo(() => (donnees ? avecOptionsRetenues(donnees, new Set(options.filter((o) => o.incluse).map((o) => o.id))) : null), [donnees, options]);
  const apres = useMemo(() => (donnees ? avecOptionsRetenues(donnees, choix) : null), [donnees, choix]);
  // Les options déjà incluses dans le devis sont cochées par défaut.
  const [init, setInit] = useState(false);
  if (!init && options.length) { setInit(true); setChoix(new Set(options.filter((o) => o.incluse).map((o) => o.id))); }

  const lancer = async () => {
    if (!donnees) return;
    let envoye = false;
    try {
      setBusy("Préparation…");
      await preparer({ data: { devisId, options: [...choix] } });
      setBusy("PDF Staffing…");
      const pdf = await exporterDevisPdf(supabase, devisId, "detaille", (v) => avecOptionsRetenues({ ...v, remise_mode: remise.mode, remise_valeur: remise.valeur } as DonneesPennylane, choix));
      setBusy("Envoi à Pennylane…");
      envoye = true;
      const r = await transferer({ data: { devisId, pdfPath: pdf.path } });
      if (!r.controle.ok) toast.error(`Écart de total HT : Staffing ${eur(r.attendu)} / Pennylane ${r.controle.lu == null ? "illisible" : eur(r.controle.lu)}. Le devis Pennylane reste en brouillon.`, { duration: 15000 });
      else toast.success(`Devis créé dans Pennylane${r.numero ? ` (${r.numero})` : ""}, total HT vérifié ${eur(r.attendu)}.`);
      if (!r.pieceJointe) toast.warning(`PDF Staffing non joint : ${r.pieceErreur ?? "inconnu"}. Joignez-le dans Pennylane.`);
      onFini(); onClose();
    } catch (e) {
      if (!envoye) await supabase.rpc("devis_pennylane_echec", { _devis_id: devisId, _detail: { raison: (e as Error).message, etape: "preparation" } });
      toast.error((e as Error).message);
      onFini();
    } finally { setBusy(null); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Transférer vers Pennylane — {vc.data?.numero ?? ""}</DialogTitle>
          <DialogDescription>Cochez les options retenues par le client : elles partent comme lignes comprises. Les autres ne sont pas transférées. Aucun e-mail n'est envoyé ; le PDF Staffing est joint au devis Pennylane.</DialogDescription>
        </DialogHeader>
        {vc.isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {options.length === 0 && vc.data && <p className="text-sm text-muted-foreground">Ce devis n'a pas d'option.</p>}
        <ul className="space-y-1">
          {options.map((o, i) => (
            <li key={o.id}><label className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm">
              <span className="flex items-center gap-2"><input type="checkbox" checked={choix.has(o.id)} disabled={!!busy}
                onChange={(ev) => setChoix((s) => { const n = new Set(s); if (ev.target.checked) n.add(o.id); else n.delete(o.id); return n; })} />O{i + 1} {o.libelle}</span>
              <span className="tabular-nums">{eur(o.montant)} HT</span>
            </label></li>
          ))}
        </ul>
        {avant && apres && (
          <table className="w-full text-sm">
            <tbody>
              <tr><td>Total HT sans options</td><td className="text-right tabular-nums">{eur(avant.net_ht)}</td></tr>
              <tr className="font-semibold"><td>Total HT transféré</td><td className="text-right tabular-nums">{eur(apres.net_ht)}</td></tr>
              {Number(apres.remise ?? 0) > 0 && <tr className="text-muted-foreground"><td>dont remise</td><td className="text-right tabular-nums">−{eur(apres.remise)}</td></tr>}
              <tr className="text-muted-foreground"><td>TVA {apres.tva_pct} % · TTC</td><td className="text-right tabular-nums">{eur(apres.tva)} · {eur(apres.ttc)}</td></tr>
            </tbody>
          </table>
        )}
        <p className="text-xs text-muted-foreground">Un seul transfert par devis. Le total HT est relu dans Pennylane ; en cas d'écart, le devis Pennylane reste en brouillon. La facture d'acompte se crée ensuite dans Pennylane.</p>
        <DialogFooter>
          <Button variant="outline" disabled={!!busy} onClick={onClose}>Annuler</Button>
          <Button disabled={!!busy || !donnees} onClick={() => void lancer()}>{busy ?? "Transférer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
