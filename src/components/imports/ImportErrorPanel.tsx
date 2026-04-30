/**
 * v0.32.0 — Panneau d'erreurs partagé pour les imports Excel/CSV.
 *
 * Affiche un récapitulatif (erreurs / warnings) en haut de page avec :
 *  - compteurs visuels par sévérité
 *  - liste détaillée scrollable
 *  - export CSV du rapport
 *
 * S'utilise conjointement avec le marquage inline (cellule rouge + tooltip)
 * dans le tableau de preview de l'import.
 */
import { AlertCircle, AlertTriangle, Download, Info, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  countIssues,
  downloadIssuesCsv,
  type ImportIssue,
} from "@/lib/import-validation";

interface Props {
  issues: readonly ImportIssue[];
  /** Nom du fichier source (utilisé dans le nom du CSV téléchargé). */
  filename?: string | null;
  /** Bouton « Recommencer » : reset l'état d'import. Optionnel. */
  onReset?: () => void;
  /** Permet de masquer le panneau (cas info-only). */
  onDismiss?: () => void;
  /** Limite d'items affichés avant troncature (défaut 50). */
  maxItems?: number;
}

export function ImportErrorPanel({
  issues,
  filename,
  onReset,
  onDismiss,
  maxItems = 50,
}: Props) {
  if (issues.length === 0) return null;
  const counts = countIssues(issues);
  const tone = counts.errors > 0 ? "danger" : counts.warnings > 0 ? "warning" : "info";

  const toneClasses =
    tone === "danger"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "warning"
        ? "border-warning/40 bg-warning/5"
        : "border-border bg-muted/30";

  const visible = issues.slice(0, maxItems);
  const truncated = issues.length - visible.length;

  const baseName = (filename ?? "import").replace(/\.(xlsx?|xls|csv)$/i, "");

  return (
    <Card className={toneClasses}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {tone === "danger" ? (
              <AlertCircle className="h-4 w-4 text-destructive" aria-hidden />
            ) : tone === "warning" ? (
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
            ) : (
              <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
            )}
            <span>
              {counts.errors > 0
                ? `${counts.errors} erreur${counts.errors > 1 ? "s" : ""} bloquante${counts.errors > 1 ? "s" : ""}`
                : counts.warnings > 0
                  ? `${counts.warnings} avertissement${counts.warnings > 1 ? "s" : ""}`
                  : `${counts.infos} information${counts.infos > 1 ? "s" : ""}`}
            </span>
          </p>
          {counts.warnings > 0 && counts.errors > 0 && (
            <Badge variant="outline" className="text-[10px]">
              + {counts.warnings} warning{counts.warnings > 1 ? "s" : ""}
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-xl text-xs"
              onClick={() => downloadIssuesCsv(issues, `${baseName}-rapport.csv`)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Rapport CSV
            </Button>
            {onReset && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-xl text-xs"
                onClick={onReset}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Recommencer
              </Button>
            )}
            {onDismiss && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl"
                onClick={onDismiss}
                aria-label="Masquer"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {counts.errors > 0 && (
          <p className="text-xs text-destructive/90">
            Corrige les erreurs ci-dessous (ou un autre fichier) avant de pouvoir
            valider l'import. Les avertissements n'empêchent pas l'import mais
            méritent un coup d'œil.
          </p>
        )}

        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border/50 bg-background/50 p-2 text-xs">
          {visible.map((i, idx) => (
            <li
              key={`${i.code}-${i.rowIndex ?? "g"}-${idx}`}
              className="flex items-start gap-2 rounded-lg px-2 py-1 hover:bg-muted/40"
            >
              <SeverityDot severity={i.severity} />
              <div className="min-w-0 flex-1">
                <p className="leading-relaxed">{i.message}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {i.code}
                  {i.rowIndex != null && ` · ligne ${i.rowIndex}`}
                  {i.column && ` · ${i.column}`}
                </p>
              </div>
            </li>
          ))}
          {truncated > 0 && (
            <li className="px-2 py-1 text-center text-[10px] italic text-muted-foreground">
              … et {truncated} autre{truncated > 1 ? "s" : ""}. Télécharge le rapport CSV pour la liste complète.
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function SeverityDot({ severity }: { severity: ImportIssue["severity"] }) {
  const cls =
    severity === "error"
      ? "bg-destructive"
      : severity === "warning"
        ? "bg-warning"
        : "bg-muted-foreground";
  return (
    <span
      aria-hidden
      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${cls}`}
    />
  );
}
