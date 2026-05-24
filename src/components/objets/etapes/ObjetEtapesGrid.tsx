/**
 * Lot 8.3a — Zone Étapes Kanban (5 cartes).
 * Réutilise EtapeDialog (composant fabrication) sans wrapper.
 */
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  ETAPES_ORDER,
  ETAPE_LABELS,
  STATUT_LABELS,
  STATUT_ICONS,
  type FabricationEtape,
  type FabricationEtapeStatut,
  type FabricationObjet,
} from "@/hooks/use-fabrication";
import { EtapeDialog } from "@/components/fabrication/EtapeDialog";

interface Props {
  objetId: string;
}

const STATUT_TONE: Record<FabricationEtapeStatut, string> = {
  a_faire: "bg-muted text-muted-foreground",
  en_cours: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  termine: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  non_applicable: "bg-muted text-muted-foreground/70",
};

export function ObjetEtapesGrid({ objetId }: Props) {
  const [objet, setObjet] = useState<FabricationObjet | null>(null);
  const [loading, setLoading] = useState(true);
  const [openEtape, setOpenEtape] = useState<FabricationEtape | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data: obj } = await supabase
      .from("fabrication_objets")
      .select(
        "id, affaire_id, devis_id, reference, nom, quantite, respo_fab_id, type_finition, commentaire, ordre, archive, created_at, a_dessiner, a_usiner, a_construire, est_brut, a_emballer, heures_prevues_be, heures_prevues_numerique, heures_prevues_bois, heures_prevues_metal, heures_prevues_peinture, heures_prevues_tapisserie, heures_prevues_manutention, budget_materiaux"
      )
      .eq("id", objetId)
      .maybeSingle();
    if (!obj) {
      setObjet(null);
      setLoading(false);
      return;
    }
    const { data: etapes } = await supabase
      .from("fabrication_etapes")
      .select(
        "id, objet_id, type_etape, statut, assignee_id, validateur_id, date_debut, date_fin, commentaire"
      )
      .eq("objet_id", objetId);

    // Profile names pour assignees
    const ids = Array.from(
      new Set([
        obj.respo_fab_id,
        ...(etapes ?? []).map((e) => e.assignee_id),
      ].filter(Boolean) as string[])
    );
    const nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      for (const p of profs ?? []) {
        nameMap.set(
          p.id as string,
          ((p as { full_name: string | null }).full_name ?? p.email ?? "?") as string
        );
      }
    }

    const merged: FabricationObjet = {
      ...(obj as unknown as FabricationObjet),
      heures_prevues_be: Number(obj.heures_prevues_be ?? 0),
      heures_prevues_numerique: Number(obj.heures_prevues_numerique ?? 0),
      heures_prevues_bois: Number(obj.heures_prevues_bois ?? 0),
      heures_prevues_metal: Number(obj.heures_prevues_metal ?? 0),
      heures_prevues_peinture: Number(obj.heures_prevues_peinture ?? 0),
      heures_prevues_tapisserie: Number(obj.heures_prevues_tapisserie ?? 0),
      heures_prevues_manutention: Number(obj.heures_prevues_manutention ?? 0),
      budget_materiaux: Number(obj.budget_materiaux ?? 0),
      respo_fab_name: obj.respo_fab_id ? nameMap.get(obj.respo_fab_id) ?? null : null,
      etapes: (etapes ?? [])
        .map((e) => ({
          ...(e as unknown as FabricationEtape),
          assignee_name: e.assignee_id ? nameMap.get(e.assignee_id as string) ?? null : null,
        }))
        .sort(
          (a, b) =>
            ETAPES_ORDER.indexOf(a.type_etape) - ETAPES_ORDER.indexOf(b.type_etape)
        ),
    };
    setObjet(merged);
    setLoading(false);
  }, [objetId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Étapes de fabrication</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!objet) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Étapes de fabrication</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3 lg:grid-cols-5">
          {ETAPES_ORDER.map((type) => {
            const etape = objet.etapes.find((e) => e.type_etape === type);
            if (!etape) {
              return (
                <Card key={type} className="border-dashed bg-muted/30">
                  <CardContent className="p-3 text-center text-xs text-muted-foreground">
                    {ETAPE_LABELS[type]}
                    <div className="mt-1">—</div>
                  </CardContent>
                </Card>
              );
            }
            return (
              <button
                type="button"
                key={etape.id}
                onClick={() => setOpenEtape(etape)}
                className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`etape-card-${type}`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {ETAPE_LABELS[type]}
                  </span>
                  <Badge variant="outline" className={`gap-1 ${STATUT_TONE[etape.statut]}`}>
                    <span aria-hidden>{STATUT_ICONS[etape.statut]}</span>
                    <span className="text-[10px]">{STATUT_LABELS[etape.statut]}</span>
                  </Badge>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="truncate font-medium">
                    {etape.assignee_name ?? (
                      <span className="text-muted-foreground italic">Non assigné</span>
                    )}
                  </div>
                  {etape.date_fin && (
                    <div className="text-muted-foreground">
                      {new Date(etape.date_fin + "T00:00:00Z").toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => void reload()}>
            Rafraîchir
          </Button>
        </div>
      </CardContent>
      {openEtape && (
        <EtapeDialog
          objet={objet}
          etape={openEtape}
          open={!!openEtape}
          onOpenChange={(o) => {
            if (!o) setOpenEtape(null);
          }}
          onSaved={() => {
            setOpenEtape(null);
            void reload();
          }}
        />
      )}
    </Card>
  );
}
