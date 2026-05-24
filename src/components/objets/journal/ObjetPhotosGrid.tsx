/**
 * Lot 8.4 MVP — Grille de photos d'un objet (lecture seule).
 *
 * Lit `fabrication_objets_photos` via le SF `getObjetPhotos` (signed URLs 1h).
 * Affiche les vignettes avec lien vers la version pleine résolution.
 * L'upload sera ajouté en Sprint suivant (form mobile + compression existante).
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getObjetPhotos } from "@/server/objet-photos.functions";

interface Props {
  objetId: string;
}

export function ObjetPhotosGrid({ objetId }: Props) {
  const fetchPhotos = useServerFn(getObjetPhotos);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["objet-photos", objetId],
    queryFn: () => fetchPhotos({ data: { objetId } }),
    staleTime: 60_000,
  });

  return (
    <Card data-testid="objet-photos-grid">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Photos</CardTitle>
        {data?.photos && (
          <span className="text-xs text-muted-foreground">{data.photos.length}</span>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-xs text-destructive">Erreur de chargement des photos.</p>
        ) : !data || data.photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <ImageOff className="h-8 w-8" />
            <p className="text-xs">Aucune photo pour le moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {data.photos.map((p) => {
              const src = p.thumb_url ?? p.signed_url;
              const full = p.signed_url ?? p.thumb_url;
              if (!src) return null;
              return (
                <a
                  key={p.id}
                  href={full ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative block aspect-square overflow-hidden rounded-md border bg-muted"
                  title={p.commentaire ?? ""}
                >
                  <img
                    src={src}
                    alt={p.commentaire ?? "photo objet"}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </a>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
