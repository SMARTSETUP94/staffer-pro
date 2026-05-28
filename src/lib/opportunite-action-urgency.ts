/**
 * Bloc 10.4 — urgence d'une prochaine action commerciale.
 * - rouge si date due passée (overdue)
 * - orange si due dans <3 jours
 * - gris sinon
 */
export type ActionUrgency = "overdue" | "soon" | "later";

export function actionUrgency(dueIso: string | null | undefined, ref: Date = new Date()): ActionUrgency | null {
  if (!dueIso) return null;
  const due = new Date(dueIso + "T00:00:00");
  const today = new Date(ref);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return "overdue";
  if (diffDays < 3) return "soon";
  return "later";
}

export const URGENCY_CLASS: Record<ActionUrgency, string> = {
  overdue:
    "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900",
  soon: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  later:
    "bg-muted text-muted-foreground border-border",
};

export function fmtActionDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

const JALON_LABEL: Record<string, string> = {
  qualification: "Qualification",
  devis_envoye: "Devis envoyé",
  negociation: "Négociation",
  signature: "Signature",
};

export function jalonLabel(etape: string | null | undefined): string {
  if (!etape) return "—";
  return JALON_LABEL[etape] ?? etape;
}
