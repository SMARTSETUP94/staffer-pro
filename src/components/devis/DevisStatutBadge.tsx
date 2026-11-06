import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DevisStatut } from "@/components/devis/editeur/api";

/** Pastille de statut devis Staffing : une couleur distincte par statut, lisible en clair comme en sombre. */
const CLASSES: Record<DevisStatut, string> = {
  brouillon: "border-transparent bg-statut-brouillon text-statut-brouillon-foreground",
  a_valider: "border-transparent bg-statut-a-valider text-statut-a-valider-foreground",
  valide: "border-transparent bg-statut-valide text-statut-valide-foreground",
  transfere: "border-transparent bg-statut-envoye text-statut-envoye-foreground",
  signe: "border-transparent bg-statut-signe text-statut-signe-foreground",
  refuse: "border-transparent bg-statut-refuse text-statut-refuse-foreground",
};

export function DevisStatutBadge({ statut, label, className }: { statut: DevisStatut; label: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-semibold", CLASSES[statut], className)}>
      {label}
    </Badge>
  );
}
