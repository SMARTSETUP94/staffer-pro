import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { construireExportEquipe, nomFichierEquipe, refEquipe, type FicheEquipe, type ResultatEquipe } from "@/lib/devis/export-equipe";
import { classeurEquipe, lireDonneesEquipe } from "@/lib/devis/export-equipe-io";
import { eur } from "@/components/devis/editeur/api";

function telecharger(bytes: Uint8Array | ArrayBuffer, nom: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a"); a.href = url; a.download = nom; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * « Version équipe » : heures par objet, détail des heures et matériaux, en Excel ou en PDF.
 * Document interne : jamais de taux, coût de revient, prix d'achat, coefficient ni marge.
 */
export function ExportEquipeDialog({ devisId, open, onOpenChange }: { devisId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [fiche, setFiche] = useState<FicheEquipe | null>(null);
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const res = useRef<ResultatEquipe | null>(null);

  useEffect(() => {
    if (!open) return;
    setFiche(null); setErreur(null); res.current = null;
    void (async () => {
      try {
        const donnees = await lireDonneesEquipe(supabase, devisId);
        const r = construireExportEquipe(donnees);
        res.current = r; setFiche(r.fiche);
      } catch (e) { setErreur(e instanceof Error ? e.message : "Devis illisible"); }
    })();
  }, [open, devisId]);

  const faire = async (format: "excel" | "pdf") => {
    const r = res.current;
    if (!r) return;
    setBusy(format);
    try {
      if (format === "excel") {
        const bytes = await classeurEquipe(r);
        telecharger(bytes, nomFichierEquipe({ numero: r.fiche.numero, version: r.fiche.version }), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      } else {
        const [{ construirePdfEquipeClient }, { syntheseEquipePdf }] = await Promise.all([import("@/lib/devis/pdf-export"), import("@/lib/devis/export-equipe")]);
        telecharger(await construirePdfEquipeClient(supabase, devisId, { heuresParLigne: r.heures_par_ligne, synthese: syntheseEquipePdf(r) }), nomFichierEquipe({ numero: r.fiche.numero, version: r.fiche.version }).replace(/\.xlsx$/, ".pdf"), "application/pdf");
      }
      toast.success(format === "excel" ? "Excel équipe téléchargé" : "PDF équipe téléchargé");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Export impossible"); } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Version équipe</DialogTitle>
          <DialogDescription>
            Heures par objet, détail des heures et matériaux, avec une synthèse. En Excel ou en PDF.
            Document interne : ni taux, ni coût de revient, ni prix d'achat, ni marge.
          </DialogDescription>
        </DialogHeader>
        {erreur && <p className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">{erreur}</p>}
        {!erreur && !fiche && <p className="text-sm text-muted-foreground">Préparation…</p>}
        {fiche && (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Devis</dt><dd>{refEquipe(fiche)}</dd>
              <dt className="text-muted-foreground">Client</dt><dd>{fiche.client ?? "—"}</dd>
              <dt className="text-muted-foreground">Affaire</dt><dd>{fiche.affaire ?? "—"}</dd>
              <dt className="text-muted-foreground">Lignes</dt><dd className="tabular-nums">{fiche.nb_lignes} dont {fiche.nb_objets} objets</dd>
              <dt className="text-muted-foreground">Heures</dt><dd className="tabular-nums">{String(fiche.total_heures).replace(".", ",")} h ({fiche.nb_heures} saisies)</dd>
              <dt className="text-muted-foreground">Matériaux</dt><dd className="tabular-nums">{fiche.nb_materiaux} lignes</dd>
            </dl>
            {fiche.heures_par_metier.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Heures par métier</p>
                <ul className="mt-1 space-y-0.5">
                  {fiche.heures_par_metier.map((h) => (
                    <li key={h.metier} className="flex justify-between gap-2"><span>{h.metier}</span><span className="tabular-nums">{String(h.heures).replace(".", ",")} h</span></li>
                  ))}
                </ul>
              </div>
            )}
            {fiche.options_hors_total.length > 0 && (
              <p className="rounded-md border border-dashed px-3 py-2 text-xs">
                {fiche.options_hors_total.length} option(s) non incluse(s) affichée(s) mais hors total :
                {" "}{fiche.options_hors_total.map((o) => o.libelle).join(", ")}.
              </p>
            )}
            <p className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Aucun coût, taux, prix d'achat, coefficient ni marge dans le fichier. Total HT rappelé en synthèse :
              {" "}<strong className="tabular-nums">{eur(fiche.total_ht)}</strong>
            </p>
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
          <Button variant="outline" disabled={busy !== null || !fiche || !!erreur} onClick={() => void faire("pdf")}>
            <FileDown className="mr-1 h-4 w-4" />{busy === "pdf" ? "Génération…" : "Télécharger en PDF"}
          </Button>
          <Button disabled={busy !== null || !fiche || !!erreur} onClick={() => void faire("excel")}>
            <FileSpreadsheet className="mr-1 h-4 w-4" />{busy === "excel" ? "Génération…" : "Télécharger en Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
