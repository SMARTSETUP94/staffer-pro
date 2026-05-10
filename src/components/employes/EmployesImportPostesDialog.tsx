/**
 * v0.42.2 — Modale d'import Excel des postes principaux (diff preview).
 *
 * Workflow :
 *  1. RH dépose un .xlsx (issu de l'export employés, complété)
 *  2. Parse + matching nom + prénom (insensible accents/casse)
 *  3. Affiche le diff (à mettre à jour / inchangés / non trouvés)
 *  4. Validation → UPDATE batch
 */
import { useState, useRef } from "react";
import { Loader2, Upload, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  parseImportPosteFile,
  computeImportPosteDiff,
  applyImportPosteDiff,
  type ImportPosteDiff,
} from "@/lib/employes-excel";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onApplied?: () => void;
}

export function EmployesImportPostesDialog({ open, onOpenChange, onApplied }: Props) {
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [diff, setDiff] = useState<ImportPosteDiff | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    setDiff(null);
    try {
      const rows = await parseImportPosteFile(file);
      if (rows.length === 0) {
        toast.error("Aucune ligne exploitable", { description: "Vérifie les colonnes Nom / Prénom / Poste principal" });
        return;
      }
      const d = await computeImportPosteDiff(rows);
      setDiff(d);
    } catch (e) {
      toast.error("Lecture du fichier impossible", { description: (e as Error).message });
    } finally {
      setParsing(false);
    }
  };

  const handleApply = async () => {
    if (!diff || diff.toUpdate.length === 0) return;
    setApplying(true);
    const res = await applyImportPosteDiff(diff);
    setApplying(false);
    if (res.ko > 0) {
      toast.warning(`${res.ok} mises à jour, ${res.ko} échec(s)`);
    } else {
      toast.success(`${res.ok} poste(s) mis à jour`);
    }
    onApplied?.();
    setDiff(null);
    onOpenChange(false);
  };

  const reset = () => {
    setDiff(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer les postes principaux (Excel)</DialogTitle>
          <DialogDescription>
            Fichier .xlsx avec colonnes <strong>Nom</strong>, <strong>Prénom</strong>, <strong>Poste principal</strong>.
            Le matching est insensible aux accents et à la casse — idempotent.
          </DialogDescription>
        </DialogHeader>

        {!diff && (
          <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
            <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button onClick={() => fileInput.current?.click()} disabled={parsing}>
              {parsing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyse…</> : "Choisir un fichier .xlsx"}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Astuce : exporte d'abord la liste actuelle, complète la colonne <em>Poste principal</em>, puis réimporte.
            </p>
          </div>
        )}

        {diff && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-card p-3 text-center">
                <CheckCircle2 className="mx-auto mb-1 h-5 w-5 text-primary" />
                <div className="text-2xl font-bold">{diff.toUpdate.length}</div>
                <div className="text-xs text-muted-foreground">À mettre à jour</div>
              </div>
              <div className="rounded-lg border bg-card p-3 text-center">
                <Info className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
                <div className="text-2xl font-bold">{diff.unchanged.length}</div>
                <div className="text-xs text-muted-foreground">Déjà à jour</div>
              </div>
              <div className="rounded-lg border bg-card p-3 text-center">
                <AlertCircle className="mx-auto mb-1 h-5 w-5 text-destructive" />
                <div className="text-2xl font-bold">{diff.notFound.length}</div>
                <div className="text-xs text-muted-foreground">Non trouvés</div>
              </div>
            </div>

            {diff.toUpdate.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="p-2 text-left">Employé</th>
                      <th className="p-2 text-left">Ancien</th>
                      <th className="p-2 text-left">Nouveau</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.toUpdate.slice(0, 100).map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">{r.nom.toUpperCase()} {r.prenom}</td>
                        <td className="p-2 text-muted-foreground">{r.ancien ?? "—"}</td>
                        <td className="p-2 font-medium">{r.nouveau}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {diff.toUpdate.length > 100 && (
                  <div className="p-2 text-xs text-muted-foreground">+ {diff.toUpdate.length - 100} autres lignes…</div>
                )}
              </div>
            )}

            {diff.notFound.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
                <div className="mb-1 font-semibold text-destructive">Non trouvés (ignorés) :</div>
                <div className="space-x-1">
                  {diff.notFound.slice(0, 20).map((r, i) => (
                    <Badge key={i} variant="outline">{r.nom} {r.prenom}</Badge>
                  ))}
                  {diff.notFound.length > 20 && <span className="text-muted-foreground">+ {diff.notFound.length - 20}…</span>}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {diff && (
            <Button variant="ghost" onClick={reset}>Recommencer</Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          {diff && diff.toUpdate.length > 0 && (
            <Button onClick={handleApply} disabled={applying}>
              {applying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Application…</> : `Appliquer ${diff.toUpdate.length} mise(s) à jour`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
