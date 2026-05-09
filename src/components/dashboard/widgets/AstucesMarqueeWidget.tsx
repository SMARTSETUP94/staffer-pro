/**
 * Bandeau astuces défilant — remplace TipDuJourWidget.
 * Toutes les astuces actives défilent en boucle (react-fast-marquee).
 * Pause au survol, click → toast plein texte.
 * Mobile : vitesse réduite (40 px/s) mais reste affiché.
 * Auto-hide si table vide.
 */
import { useEffect, useState } from "react";
import Marquee from "react-fast-marquee";
import { Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Astuce {
  id: string;
  texte: string;
  categorie: string;
  auteur: string | null;
}

const CAT_LABEL: Record<string, string> = {
  atelier: "Atelier",
  process: "Process",
  securite: "Sécurité",
  livraison: "Livraison",
  RH: "RH",
};

const CAT_COLOR: Record<string, string> = {
  atelier: "bg-blue-500",
  process: "bg-violet-500",
  securite: "bg-red-500",
  livraison: "bg-amber-500",
  RH: "bg-emerald-500",
};

export function AstucesMarqueeWidget() {
  const [astuces, setAstuces] = useState<Astuce[] | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("content_astuces")
        .select("id, texte, categorie, auteur")
        .eq("active", true)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      setAstuces((data ?? []) as Astuce[]);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!astuces || astuces.length === 0) return null;

  const speed = isMobile ? 40 : 70;

  const handleClick = (a: Astuce) => {
    toast(CAT_LABEL[a.categorie] ?? a.categorie, {
      description: a.texte + (a.auteur ? ` — ${a.auteur}` : ""),
      duration: 8000,
    });
  };

  return (
    <div
      className="relative overflow-hidden rounded-lg border bg-gradient-to-r from-amber-50/60 via-background to-violet-50/60 dark:from-amber-950/20 dark:via-background dark:to-violet-950/20"
      style={{ height: 56 }}
    >
      <div className="absolute left-0 top-0 z-10 flex h-full items-center gap-1.5 bg-background/95 px-3 backdrop-blur-sm border-r">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <span className="text-xs font-medium text-muted-foreground hidden sm:inline">Astuces</span>
      </div>
      <Marquee speed={speed} pauseOnHover gradient={false} className="h-full">
        {astuces.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => handleClick(a)}
            className="mx-4 inline-flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <span className={cn("inline-block h-2 w-2 rounded-full", CAT_COLOR[a.categorie] ?? "bg-muted-foreground")} aria-hidden />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {CAT_LABEL[a.categorie] ?? a.categorie}
            </span>
            <span className="text-sm">{a.texte}</span>
            {a.auteur && <span className="text-xs text-muted-foreground italic">— {a.auteur}</span>}
            <span className="mx-2 text-muted-foreground/40">•</span>
          </button>
        ))}
      </Marquee>
    </div>
  );
}
