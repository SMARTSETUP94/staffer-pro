import type { ReactNode } from "react";

interface PageHeaderProps {
  /** Numéro affiché en overline, ex "01" */
  number?: string;
  /** Catégorie affichée à côté du numéro, ex "Données / Employés" */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * En-tête de page interne — sobre, factuel.
 * Pattern Setup : overline "— 01 / Catégorie", titre fort, description courte.
 */
export function PageHeader({ number, eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {(number || eyebrow) && (
          <p className="overline">
            — {number ? `${number}${eyebrow ? " / " : ""}` : ""}{eyebrow}
          </p>
        )}
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
