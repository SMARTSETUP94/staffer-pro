/**
 * Liste virtualisée du drill-down d'une cellule de charge : reste fluide même
 * quand des dizaines de chantiers partagent le même métier le même jour.
 */
import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Users } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChargeDrillAffaire } from "@/lib/charge-atelier";

export function ChargeDrillList({ groupes }: { groupes: ChargeDrillAffaire[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: groupes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 132,
    overscan: 6,
  });

  if (groupes.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">Aucun détail pour cette cellule.</p>;
  }

  return (
    <div ref={parentRef} className="-mx-2 mt-3 flex-1 overflow-y-auto px-2">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((v) => {
          const g = groupes[v.index]!;
          return (
            <div
              key={g.affaire_id}
              ref={virtualizer.measureElement}
              data-index={v.index}
              className="absolute left-0 top-0 w-full pb-2"
              style={{ transform: `translateY(${v.start}px)` }}
            >
              <div className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {g.affaire_numero} · {g.affaire_nom}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {g.cibles.join(" · ") || "Sans objet rattaché"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {g.prospect && <Badge variant="outline" className="text-[10px]">Prospect</Badge>}
                    <Badge variant="secondary">{g.nbPers} pers.</Badge>
                  </div>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-xs">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  {g.nommes.length > 0 ? (
                    <span className="truncate">{g.nommes.map((n) => n.nom).join(", ")}</span>
                  ) : (
                    <span className="text-muted-foreground">Personne nommée</span>
                  )}
                  {g.nbPers > g.nommes.length && (
                    <span className="flex shrink-0 items-center gap-1 text-amber-600 dark:text-amber-500">
                      <AlertTriangle className="h-3 w-3" />
                      {g.nbPers - g.nommes.length} à nommer
                    </span>
                  )}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Button asChild size="sm" variant="link" className="h-auto p-0 text-xs">
                    <Link to="/affaires/$affaireId/planning-atelier" params={{ affaireId: g.affaire_id }}>
                      Ouvrir le planning atelier →
                    </Link>
                  </Button>
                  {g.objets.map((o) => (
                      <Button
                        key={o.id}
                        asChild
                        size="sm"
                        variant="link"
                        className="h-auto p-0 text-xs"
                      >
                        <Link
                          to="/affaires/$affaireId/objets/$objetId"
                          params={{ affaireId: g.affaire_id, objetId: o.id }}
                        >
                          Fiche {o.label} →
                        </Link>
                      </Button>
                    ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
