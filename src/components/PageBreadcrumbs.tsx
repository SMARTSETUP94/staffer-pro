import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface BreadcrumbStep {
  /** Libellé affiché. */
  label: string;
  /** Si fourni → rendu en lien cliquable. Si absent → page courante (non cliquable). */
  to?: string;
}

interface PageBreadcrumbsProps {
  /** Étapes intermédiaires + finale. La racine "Accueil" est ajoutée auto. */
  steps: BreadcrumbStep[];
  /** Cacher la racine "Accueil" si besoin. */
  hideHome?: boolean;
  className?: string;
}

/**
 * Fil d'ariane standard, basé sur shadcn/breadcrumb.
 * Usage :
 *   <PageBreadcrumbs steps={[
 *     { label: "Affaires", to: "/affaires" },
 *     { label: affaire.numero, to: `/affaires/${id}` },
 *     { label: "Staffing" },
 *   ]} />
 */
export function PageBreadcrumbs({ steps, hideHome, className }: PageBreadcrumbsProps) {
  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {!hideHome && (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/" aria-label="Accueil" className="inline-flex items-center">
                  <Home className="h-3.5 w-3.5" />
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {steps.length > 0 && <BreadcrumbSeparator />}
          </>
        )}
        {steps.map((s, i) => {
          const isLast = i === steps.length - 1;
          return (
            <BreadcrumbItem key={`${s.label}-${i}`}>
              {isLast || !s.to ? (
                <BreadcrumbPage className="max-w-[28ch] truncate">{s.label}</BreadcrumbPage>
              ) : (
                <>
                  <BreadcrumbLink asChild>
                    <Link to={s.to} className="max-w-[28ch] truncate">
                      {s.label}
                    </Link>
                  </BreadcrumbLink>
                  <BreadcrumbSeparator />
                </>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
