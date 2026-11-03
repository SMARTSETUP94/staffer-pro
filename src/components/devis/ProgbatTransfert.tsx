import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BUCKET_EXPORTS } from "@/lib/devis/pdf-export";
import { exporterDevisProgbat } from "@/lib/devis/progbat-io";
import { CONSIGNES_PROGBAT, ecartTransfert, estNumeroProgbatValide, NUMERO_PROGBAT_PROVISOIRE_RE, NUMERO_PROGBAT_RE, type FicheProgbat } from "@/lib/devis/progbat-export";
import { eur } from "@/components/devis/editeur/api";

type ExportRow = { id: string; version: number; format?: string; fiche?: FicheProgbat | null; storage_path: string; cree_le: string; auteur: string | null };
const DATES: [string, string][] = [["date_visite_technique", "Visite technique"], ["date_montage", "Montage"], ["date_evenement_debut", "Événement du"], ["date_evenement_fin", "Événement au"], ["date_demontage", "Démontage"], ["date_validite", "Validité"]];
const fr = (s?: string | null) => (s ? new Date(s).toLocaleDateString("fr-FR") : "");

function telecharger(bytes: Uint8Array, nom: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = nom; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function lien(bucket: string, path: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

function FicheControle({ fiche }: { fiche: FicheProgbat }) {
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  useEffect(() => {
    void Promise.all(fiche.photos.map(async (p) => [p.storage_path, await lien("devis-photos", p.storage_path)] as const)).then((e) => setPhotos(Object.fromEntries(e)));
  }, [fiche]);
  const dates = DATES.map(([k, l]) => [l, fr(fiche.dates?.[k])] as const).filter(([, v]) => v);
  return (
    <div className="space-y-3 text-sm">
      <div className={`flex items-center gap-2 rounded-md border px-3 py-2 ${fiche.controle_ok ? "border-primary/40 bg-primary/5" : "border-destructive bg-destructive/10"}`}>
        {fiche.controle_ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
        <span>Somme des lignes du fichier : <strong className="tabular-nums">{eur(fiche.total_fichier)}</strong> {fiche.controle_ok ? "= total HT Staffing" : `≠ total HT ${eur(fiche.total_ht_attendu)}`}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Total HT attendu</dt><dd className="text-right font-semibold tabular-nums">{eur(fiche.total_ht_attendu)}</dd>
        <dt className="text-muted-foreground">Remise à saisir dans ProGBat</dt>
        <dd className="text-right tabular-nums">{fiche.remise.montant ? `${eur(-fiche.remise.montant)} (${fiche.remise.mode === "pct" ? `${fiche.remise.valeur} %` : fiche.remise.mode === "net_cible" ? "net souhaité" : "montant"})` : "aucune"}</dd>
        <dt className="text-muted-foreground">Total net HT attendu</dt><dd className="text-right font-bold tabular-nums">{eur(fiche.net_ht_attendu)}</dd>
        <dt className="text-muted-foreground">Lignes / titres / commentaires</dt><dd className="text-right tabular-nums">{fiche.nb_lignes} / {fiche.nb_titres} / {fiche.nb_commentaires}</dd>
        <dt className="text-muted-foreground">Client</dt><dd className="text-right">{fiche.client ?? "—"}{fiche.client_final ? ` (client final : ${fiche.client_final})` : ""}</dd>
        <dt className="text-muted-foreground">Contact</dt><dd className="text-right">{[fiche.contact, fiche.contact_email].filter(Boolean).join(" · ") || "—"}</dd>
      </dl>
      <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Mode opératoire ProGBat</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs">{(fiche.consignes ?? CONSIGNES_PROGBAT).map((c) => <li key={c}>{c}</li>)}</ol>
      </div>
      {fiche.ajustement_arrondi && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs">Arrondi : écart de {eur(fiche.ajustement_arrondi.montant)} {fiche.ajustement_arrondi.mode === "absorbe" ? `absorbé dans la ligne ${fiche.ajustement_arrondi.n} « ${fiche.ajustement_arrondi.designation} »` : `porté par la ligne ${fiche.ajustement_arrondi.n} « Ajustement d'arrondi »`}.</p>
      )}
      {fiche.options.length > 0 && (
        <div><p className="text-xs font-semibold uppercase text-muted-foreground">Options — à passer en Option / Variante dans ProGBat</p>
          <ul className="mt-1 space-y-0.5">{fiche.options.map((o) => (
            <li key={o.n} className="flex justify-between gap-2"><span>{o.n} {o.libelle} · <strong>{o.incluse ? "incluse" : "non incluse"}</strong></span><span className="tabular-nums">{eur(o.montant)}</span></li>
          ))}</ul></div>
      )}
      {dates.length > 0 && <p className="text-xs text-muted-foreground">{dates.map(([l, v]) => `${l} : ${v}`).join(" · ")}</p>}
      {fiche.photos.length > 0 && (
        <div><p className="text-xs font-semibold uppercase text-muted-foreground">Photos visibles client (liens valables 1 h)</p>
          <ul className="mt-1 space-y-0.5 text-xs">{fiche.photos.map((p) => (
            <li key={p.storage_path}>{photos[p.storage_path] ? <a className="underline" href={photos[p.storage_path]!} target="_blank" rel="noopener noreferrer">{[p.objet, p.legende].filter(Boolean).join(" — ") || "Photo"}</a> : <span>{p.objet ?? "Photo"}</span>}</li>
          ))}</ul></div>
      )}
    </div>
  );
}

/** « Vers ProGBat » : génère l'Excel d'import, affiche la fiche de contrôle et l'historique. */
export function ProgbatExportDialog({ devisId, open, onOpenChange, peutTransferer, onTransfert }: {
  devisId: string; open: boolean; onOpenChange: (o: boolean) => void; peutTransferer: boolean; onTransfert: () => void;
}) {
  const [fiche, setFiche] = useState<FicheProgbat | null>(null);
  const [busy, setBusy] = useState(false);
  const hist = useQuery({
    queryKey: ["devis-exports", devisId], enabled: open,
    queryFn: async () => ((await supabase.rpc("devis_exports_lister", { _devis_id: devisId })).data ?? []) as unknown as ExportRow[],
  });
  const generer = async () => {
    setBusy(true);
    try { const r = await exporterDevisProgbat(supabase, devisId); telecharger(r.bytes, r.nom); setFiche(r.fiche); toast.success("Excel ProGBat généré"); void hist.refetch(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Export impossible"); } finally { setBusy(false); }
  };
  useEffect(() => { if (open) { setFiche(null); void generer(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const exports = (hist.data ?? []).filter((e) => e.format === "progbat_xlsx");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vers ProGBat</DialogTitle>
          <DialogDescription>Importer le fichier dans un devis ProGBat neuf et vide (Import/Export &gt; Importer un Excel), en cochant « La première ligne contient les titres », puis vérifier avec la fiche ci-dessous. Aucune heure par poste, taux, coût ni marge dans le fichier.</DialogDescription>
        </DialogHeader>
        {busy && !fiche && <p className="text-sm text-muted-foreground">Génération…</p>}
        {fiche && <FicheControle fiche={fiche} />}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Exports ProGBat</p>
          {exports.length === 0 && <p className="text-sm text-muted-foreground">Aucun export pour l'instant.</p>}
          <ul className="max-h-36 space-y-1 overflow-auto text-sm">{exports.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
              <span>{new Date(e.cree_le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })} · R{e.version} · {e.auteur ?? "—"}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Télécharger cet export"
                onClick={async () => { const u = await lien(BUCKET_EXPORTS, e.storage_path); if (u) window.open(u, "_blank", "noopener"); else toast.error("Lien indisponible"); }}><Download className="h-4 w-4" /></Button>
            </li>
          ))}</ul>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void generer()}><FileSpreadsheet className="mr-1 h-4 w-4" />Regénérer</Button>
          {peutTransferer && <Button disabled={!fiche} onClick={() => { onOpenChange(false); onTransfert(); }}>Enregistrer le transfert…</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Saisie du numéro ProGBat et du total HT relevé ; comparaison au centime avec Staffing. */
export function EnregistrerTransfertDialog({ devisId, netHt, numeroActuel = null, open, onOpenChange, onDone }: {
  devisId: string; netHt: number; numeroActuel?: string | null; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void;
}) {
  const [numero, setNumero] = useState(""); const [total, setTotal] = useState(""); const [motif, setMotif] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setNumero(""); setTotal(""); setMotif(""); } }, [open]);
  const num = numero.trim().toUpperCase();
  const finalisation = NUMERO_PROGBAT_PROVISOIRE_RE.test(numeroActuel ?? "");
  const numOk = finalisation ? NUMERO_PROGBAT_RE.test(num) : estNumeroProgbatValide(num);
  const provisoire = NUMERO_PROGBAT_PROVISOIRE_RE.test(num);
  const t = Number(total.replace(/\s/g, "").replace(",", "."));
  const totalOk = total.trim() !== "" && Number.isFinite(t);
  const ecart = totalOk ? ecartTransfert(netHt, t) : null;
  const ok = numOk && totalOk && (ecart === 0 || motif.trim().length > 0);
  const enregistrer = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("devis_enregistrer_transfert", { _devis_id: devisId, _numero: num, _total_progbat: t, _motif: ecart ? motif.trim() : undefined });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(provisoire ? `Import enregistré : ProGBat ${num} (brouillon)` : `Numéro ProGBat enregistré : ${num}`); onDone(); onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{finalisation ? "Numéro définitif ProGBat" : "Enregistrer le transfert ProGBat"}</DialogTitle>
          <DialogDescription>{finalisation
            ? `Import enregistré sous le numéro provisoire ${numeroActuel}. Saisir le numéro D-AAAAMM-NNNN attribué par ProGBat à la finalisation.`
            : "Juste après l'import : numéro provisoire S… du brouillon ProGBat. Si le devis ProGBat est déjà finalisé : numéro définitif D-AAAAMM-NNNN. Le devis Staffing sera figé : toute correction passera par une nouvelle version."}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="pg-num">{finalisation ? "Numéro définitif (D-AAAAMM-NNNN)" : "Numéro ProGBat (S000000 provisoire ou D-AAAAMM-NNNN définitif)"}</Label>
            <Input id="pg-num" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder={finalisation ? "D-202611-0012" : "S003800"} aria-invalid={numero.trim() !== "" && !numOk} />
            {numero.trim() !== "" && !numOk && <p className="text-xs text-destructive">{finalisation ? "Format attendu : D-AAAAMM-NNNN" : "Format attendu : S + 6 chiffres, ou D-AAAAMM-NNNN"}</p>}
            {numOk && <p className="text-xs text-muted-foreground">{provisoire ? "Importé dans ProGBat, en attente de finalisation" : "Numéro définitif ProGBat"}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="pg-total">Total net HT lu dans ProGBat (€)</Label>
            <Input id="pg-total" inputMode="decimal" className="text-right tabular-nums" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="9510,99" />
            <p className="text-xs text-muted-foreground">Total net HT Staffing : <strong className="tabular-nums">{eur(netHt)}</strong></p>
          </div>
          {ecart === 0 && <p className="flex items-center gap-1 text-sm text-primary"><CheckCircle2 className="h-4 w-4" />Totaux identiques au centime</p>}
          {ecart != null && ecart !== 0 && (
            <div className="space-y-1 rounded-md border border-destructive bg-destructive/10 p-2">
              <p className="flex items-center gap-1 text-sm font-medium text-destructive"><AlertTriangle className="h-4 w-4" />Écart de {eur(ecart)} entre ProGBat et Staffing</p>
              <Label htmlFor="pg-motif">Motif (obligatoire pour enregistrer malgré l'écart)</Label>
              <Textarea id="pg-motif" rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter><Button disabled={!ok || busy} onClick={() => void enregistrer()}>{busy ? "Enregistrement…" : "Enregistrer le transfert"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
