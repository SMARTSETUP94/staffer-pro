/**
 * LOT A — Vignette photo d'objet avec chargement paresseux.
 * Reprend le pattern IntersectionObserver de `DocumentThumbnail` : l'image
 * n'est montée que lorsqu'elle approche de la fenêtre.
 */
import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import type { RawPhoto } from "@/lib/objet-feed";

interface Props {
  photo: RawPhoto;
  onClick?: () => void;
  className?: string;
}

export function ObjetPhotoThumb({ photo, onClick, className }: Props) {
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  const src = photo.thumb_url ?? photo.signed_url ?? null;

  useEffect(() => {
    if (!ref.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const el = ref.current;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      title={photo.commentaire ?? undefined}
      className={[
        "group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 transition-all hover:border-primary hover:shadow-md",
        className ?? "",
      ].join(" ")}
      data-testid="objet-photo-thumb"
    >
      {!inView || !src ? (
        src ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
        )
      ) : (
        <>
          {!loaded && <Loader2 className="absolute h-5 w-5 animate-spin text-muted-foreground" />}
          <img
            src={src}
            alt={photo.commentaire ?? "Photo de l'objet"}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        </>
      )}
      {photo.commentaire && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-left text-[11px] font-medium text-white">
          {photo.commentaire}
        </span>
      )}
    </button>
  );
}
