/**
 * LOT B3 — Tableau d'atelier : 5 colonnes, une carte par objet, placée dans
 * la colonne de son étape courante. Lecture + validation, rien d'autre.
 */
import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { requireCapability } from "@/lib/capability-guard";
import { Button } from "@/components/ui/button";
import { AffaireFilterMenu } from "@/components/charge/AffaireFilterMenu";
import { AtelierCard } from "@/components/atelier/AtelierCard";
import { useAtelierBoard, useValiderEtape } from "@/hooks/use-atelier-board";
import { ATELIER_COLONNES, grouperParColonne, totauxColonne } from "@/lib/atelier-board";

const searchSchema = z.object({ affaires: z.string().optional() });

export const Route = createFileRoute("/_app/atelier")({
  beforeLoad: () => requireCapability("section.planning_fab"),
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Tableau d'atelier — Setup Paris" },
      {
        name: "description",
        content:
          "Objets en fabrication répartis par poste : bureau d'étude, numérique, fabrication, finition, manutention.",
      },
      { property: "og:title", content: "Tableau d'atelier — Setup Paris" },
      {
        property: "og:description",
        content: "État de chaque objet par poste d'atelier, prérequis signalés et validation d'étape.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AtelierPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-destructive">{error.message}</div>
  ),
});

const csvToList = (v: string | undefined) =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function AtelierPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data, isLoading } = useAtelierBoard();
  const valider = useValiderEtape();
  const [pending, setPending] = useState<string | null>(null);

  const selected = csvToList(search.affaires);

  const setAffaires = (ids: string[]) =>
    navigate({
      to: "/atelier",
      search: { affaires: ids.length > 0 ? ids.join(",") : undefined },
      replace: true,
    });

  const colonnes = useMemo(() => {
    const cartes = (data?.cartes ?? []).filter(
      (c) => selected.length === 0 || selected.includes(c.affaire_id),
    );
    return grouperParColonne(cartes);
  }, [data, selected.join(",")]);

  const onValider = async (etapeId: string) => {
    setPending(etapeId);
    const res = await valider.mutateAsync(etapeId);
    setPending(null);
    if (res.ok) toast.success("Étape validée");
    else toast.error(res.error ?? "Validation impossible");
  };

  return (
    <div className="space-y-4 px-2 py-4 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="overline">— Atelier</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Tableau d'atelier</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Chaque objet est placé sur son poste courant. Les prérequis manquants sont signalés,
            ils n'empêchent jamais de valider.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AffaireFilterMenu
            affaires={data?.affaires ?? []}
            selected={selected}
            onToggle={(id) =>
              setAffaires(
                selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
              )
            }
            onClear={() => setAffaires([])}
          />
          {selected.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setAffaires([])}>
              Tout afficher
            </Button>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement du tableau…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {ATELIER_COLONNES.map((col) => {
            const cartes = colonnes[col.type] ?? [];
            const t = totauxColonne(cartes);
            return (
              <section key={col.type} className="rounded-xl border bg-muted/30 p-2">
                <header className="flex items-baseline justify-between px-1 pb-2">
                  <h2 className="text-sm font-bold text-foreground">{col.label}</h2>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {t.objets} obj · {t.heures} h
                  </span>
                </header>
                <div className="space-y-2">
                  {cartes.length === 0 ? (
                    <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">
                      Aucun objet
                    </p>
                  ) : (
                    cartes.map((c) => (
                      <AtelierCard
                        key={c.objet_id}
                        carte={c}
                        onValider={onValider}
                        validating={pending === c.etape.id}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
