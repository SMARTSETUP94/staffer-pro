import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  errorsCount: number;
  postesCount: number;
  totalHeures: number;
  totalMontant: number;
  committing: boolean;
  canCommit: boolean;
  onReset: () => void;
  onCommit: () => void;
}

export function DevisImportFooter({
  errorsCount,
  postesCount,
  totalHeures,
  totalMontant,
  committing,
  canCommit,
  onReset,
  onCommit,
}: Props) {
  return (
    <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-elegant backdrop-blur">
      <p className="mr-auto text-xs text-muted-foreground">
        {errorsCount === 0
          ? `Prêt à importer : ${postesCount} poste(s) • ${totalHeures} h • ${totalMontant.toLocaleString("fr-FR")} € HT.`
          : `${errorsCount} correction(s) avant validation.`}
      </p>
      <Button variant="ghost" onClick={onReset} className="rounded-xl">
        Réinitialiser
      </Button>
      <Button
        onClick={onCommit}
        disabled={!canCommit}
        className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {committing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
        Valider et importer
      </Button>
    </div>
  );
}
