/**
 * Lot 8.2 — Fiche Objet (intégrée par objet de fabrication)
 * Route : /affaires/:affaireId/objets/:objetId
 *
 * Gardes :
 *   - Capability `objet.view` (sinon → redirect / + toast)
 *   - Feature flag `fiche_objet_v1` (sinon → redirect vers /affaires/$/fabrication)
 */
import { useState, useEffect } from "react";
import {
  createFileRoute,
  redirect,
  useNavigate,
  Link,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCapability } from "@/lib/capability-guard";
import { supabase } from "@/integrations/supabase/client";
import { getObjetFiche } from "@/server/objet-fiche.functions";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { ObjetIdentiteSection } from "@/components/objets/ObjetIdentiteSection";
import { ObjetHeuresTable } from "@/components/objets/ObjetHeuresTable";

export const Route = createFileRoute("/_app/affaires/$affaireId/objets/$objetId")({
  beforeLoad: async () => {
    await requireCapability("objet.view");
  },
  head: () => ({ meta: [{ title: "Fiche objet — Setup Paris" }] }),
  component: FicheObjetPage,
});

function FicheObjetPage() {
  const { affaireId, objetId } = Route.useParams();
  const navigate = useNavigate();
  const flagEnabled = useFeatureFlag("fiche_objet_v1");
  const fetchFiche = useServerFn(getObjetFiche);
  const qc = useQueryClient();

  // Redirect propre si flag OFF (on rend pas le contenu côté client)
  useEffect(() => {
    if (flagEnabled === false) {
      navigate({
        to: "/affaires/$affaireId/fabrication",
        params: { affaireId },
        replace: true,
      });
    }
  }, [flagEnabled, navigate, affaireId]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["fiche-objet", objetId],
    queryFn: () => fetchFiche({ data: { objetId } }),
    enabled: flagEnabled,
  });

  // Liste responsables fab (profiles est_respo_fab)
  const { data: respoOptions = [] } = useQuery({
    queryKey: ["respo-fab-options"],
    enabled: flagEnabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("profiles")
        .select("id, full_name, est_respo_fab")
        .eq("est_respo_fab", true)
        .order("full_name");
      return (rows ?? []).map((r) => ({
        id: r.id,
        label: (r as { full_name: string | null }).full_name ?? "?",
      }));
    },
  });

  if (!flagEnabled) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            La fiche objet n'est pas encore activée pour votre compte.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto space-y-4 p-4 lg:p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="mb-3 text-sm text-destructive">
              {error instanceof Error ? error.message : "Objet introuvable"}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/affaires/$affaireId/fabrication" params={{ affaireId }}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Retour à la fabrication
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { objet, affaire, heures } = data;

  return (
    <div className="container mx-auto space-y-4 p-4 lg:p-6">
      {/* Header / breadcrumb */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              to="/affaires/$affaireId/fabrication"
              params={{ affaireId }}
              className="hover:underline"
            >
              {affaire.numero} — {affaire.nom}
            </Link>
            <span>/</span>
            <span>Fabrication</span>
          </div>
          <h1 className="truncate text-2xl font-semibold" data-testid="fiche-objet-title">
            {objet.reference} — {objet.nom}
          </h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/affaires/$affaireId/fabrication" params={{ affaireId }}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Fabrication
          </Link>
        </Button>
      </div>

      {/* Grid responsive 2 cols desktop / 1 col mobile */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ObjetIdentiteSection
          objetId={objet.id}
          reference={objet.reference}
          initial={{
            nom: objet.nom,
            quantite: objet.quantite,
            commentaire: objet.commentaire,
            respo_fab_id: objet.respo_fab_id,
            heures_prevues_be: Number(objet.heures_prevues_be),
            heures_prevues_numerique: Number(objet.heures_prevues_numerique),
            heures_prevues_bois: Number(objet.heures_prevues_bois),
            heures_prevues_metal: Number(objet.heures_prevues_metal),
            heures_prevues_peinture: Number(objet.heures_prevues_peinture),
            heures_prevues_tapisserie: Number(objet.heures_prevues_tapisserie),
            heures_prevues_manutention: Number(objet.heures_prevues_manutention),
          }}
          respoOptions={respoOptions}
        />
        <ObjetHeuresTable heures={heures} quantite={objet.quantite} />
      </div>

      {/* Placeholders Lots 8.3 → 8.5 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Placeholder title="Équipe affectée" sub="Lot 8.3 — à venir" />
        <Placeholder title="Étapes Kanban" sub="Lot 8.3 — à venir" />
        <Placeholder title="Journal photos" sub="Lot 8.4 — à venir" />
      </div>
    </div>
  );
}

function Placeholder({ title, sub }: { title: string; sub: string }) {
  return (
    <Card className="border-dashed bg-muted/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="py-6 text-center text-xs text-muted-foreground">
        {sub}
      </CardContent>
    </Card>
  );
}
