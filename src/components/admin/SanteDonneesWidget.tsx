import { Link } from "@tanstack/react-router";
import { Activity, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useQualite } from "@/hooks/use-qualite";
import { listesQualite } from "@/lib/qualite-listes";
export function SanteDonneesWidget() {
  const {roles}=useAuth();
  const query=useQualite();
  if(!roles.includes("admin")) return null;
  const listes=query.data?listesQualite(query.data):null;
  return <section className="flex flex-wrap items-center gap-4 border-y py-4" aria-label="Santé des données">
    <Activity className="h-6 w-6 text-primary" />
    <div className="min-w-0 flex-1"><h2 className="font-semibold">Santé des données</h2><p className="text-sm text-muted-foreground">{query.isError?"Lecture indisponible":listes?`${listes.total} points à vérifier · ${listes.personnes} personnes · ${listes.commercial} commercial · ${listes.devis.length} devis`:"Chargement…"}</p></div>
    {query.isError?<Button variant="outline" onClick={()=>query.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Réessayer</Button>:<Button asChild variant="outline"><Link to="/admin/qualite-donnees">Voir le détail<ArrowRight className="ml-2 h-4 w-4"/></Link></Button>}
  </section>;
}