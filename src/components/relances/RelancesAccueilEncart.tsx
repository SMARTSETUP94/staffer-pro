import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BellRing, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/use-capability";
import { texteAccueil, type ReponseRelances } from "@/lib/relances/regles";

/** Encart d'accueil « N relances cette semaine » (périmètre « Mes affaires »). */
export function RelancesAccueilEncart() {
  const peut = useCapability("commercial.relances");
  const q = useQuery({
    queryKey: ["relances", "mes", null, false], enabled: peut, staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("relances_a_faire", {});
      if (error) throw error; return data as unknown as ReponseRelances;
    },
  });
  if (!peut || !q.data) return null;
  return (
    <Link to="/relances" className="flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary">
      <BellRing className="h-5 w-5 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{texteAccueil(q.data.nb)}</p>
        <p className="text-xs text-muted-foreground">Opportunités à relancer dans vos affaires</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
