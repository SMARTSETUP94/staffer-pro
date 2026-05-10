/**
 * v0.44.0 Sprint 2 — Détail mobile chef d'une affaire : Photos.
 * Le chef accède à cette route depuis le dashboard (tap sur affaire).
 * RLS garantit qu'il ne peut voir / uploader que sur les affaires où il est chef
 * (la gallery elle-même fait des requêtes scopées par affaire_id).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { ChefMobileBottomNav } from "@/components/mobile-chef/ChefMobileBottomNav";
import { AffaireDocumentsGallery } from "@/components/affaire-documents/AffaireDocumentsGallery";
import { useMesAffairesChefIds } from "@/hooks/use-mes-affaires-chef";

export const Route = createFileRoute("/mobile/chef/affaires/$affaireId")({
  head: () => ({ meta: [{ title: "Affaire — Photos" }] }),
  component: () => (
    <RoleGuard required="chef_or_admin">
      <ChefAffaireDetail />
    </RoleGuard>
  ),
});

function ChefAffaireDetail() {
  const { affaireId } = Route.useParams();
  const { ids, isLoading: idsLoading } = useMesAffairesChefIds();

  const { data: affaire, isLoading } = useQuery({
    queryKey: ["mobile-chef-affaire", affaireId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affaires")
        .select("id, numero, nom, client, lieu")
        .eq("id", affaireId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Scope sécurité côté UI : si l'affaire n'est pas dans ma liste de chef → on bloque l'upload
  const canUpload = !idsLoading && ids.has(affaireId);

  return (
    <div className="min-h-screen bg-background pb-24">
      <ChefMobileHeader title="Affaire" />

      <div className="px-4 pt-3">
        <Link
          to="/mobile/chef/dashboard"
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Dashboard
        </Link>

        {isLoading ? (
          <div className="mt-6 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !affaire ? (
          <p className="mt-6 text-sm text-muted-foreground">Affaire introuvable</p>
        ) : (
          <div className="mt-3">
            <p className="overline">— {affaire.numero}</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight">{affaire.nom}</h1>
            {(affaire.client || affaire.lieu) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {[affaire.client, affaire.lieu].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        )}

        <div className="mt-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Photos & documents
          </h2>
          <AffaireDocumentsGallery
            affaireId={affaireId}
            variant="mobile"
            canUpload={canUpload}
          />
        </div>
      </div>

      <ChefMobileBottomNav />
    </div>
  );
}
