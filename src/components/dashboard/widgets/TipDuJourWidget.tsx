/**
 * Widget "Astuce de la semaine" — rotation hebdo déterministe (week-of-year).
 * Source : table `content_astuces` WHERE active=true.
 * Auto-hide si table vide.
 */
import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { weekIndex } from "@/lib/dashboard-fun-helpers";
import { supabase } from "@/integrations/supabase/client";

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

export function TipDuJourWidget() {
  const [astuce, setAstuce] = useState<Astuce | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("content_astuces")
        .select("id, texte, categorie, auteur")
        .eq("active", true)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error || !data || data.length === 0) {
        setAstuce(null);
      } else {
        const idx = weekIndex(new Date()) % data.length;
        setAstuce(data[idx] as Astuce);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!loaded || !astuce) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          Astuce de la semaine
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            {CAT_LABEL[astuce.categorie] ?? astuce.categorie}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm">{astuce.texte}</p>
        {astuce.auteur && (
          <p className="text-xs text-muted-foreground mt-1">— {astuce.auteur}</p>
        )}
      </CardContent>
    </Card>
  );
}
