/**
 * L6-B — Sélecteur de portée pour pages /mes-*.
 *
 * Affiche des onglets « Moi / Équipe / Tout » selon le scope max accordé
 * par la capability passée en prop. Synchronisé avec `?scope=` dans l'URL.
 *
 * - cap scope `none` → composant masqué (cap absente)
 * - cap scope `own`  → un seul onglet "Moi", pas de switch (masqué)
 * - cap scope `team` → onglets Moi + Équipe
 * - cap scope `metier`/`all` → 3 onglets
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCapabilityScope, type CapabilityScope } from "@/hooks/use-capability";

export type UrlScope = "mine" | "team" | "all";

const SCOPE_RANK: Record<CapabilityScope, number> = {
  none: 0,
  own: 1,
  team: 2,
  metier: 2,
  all: 3,
};

function maxUrlScope(capScope: CapabilityScope): UrlScope {
  if (SCOPE_RANK[capScope] >= 3) return "all";
  if (SCOPE_RANK[capScope] >= 2) return "team";
  return "mine";
}

interface Props {
  capKey: string;
  /** Route id pour useSearch/useNavigate, ex: "/_app/mes-heures" */
  routeId: string;
}

export function ScopeSelector({ capKey, routeId }: Props) {
  const capScope = useCapabilityScope(capKey);
  const search = useSearch({ strict: false }) as { scope?: UrlScope };
  const navigate = useNavigate();
  const current: UrlScope = search.scope ?? "mine";

  if (capScope === "none") return null;
  const max = maxUrlScope(capScope);
  // Si l'utilisateur n'a que "own", pas la peine d'afficher 1 seul onglet
  if (max === "mine") return null;

  const handleChange = (v: string) => {
    navigate({
      to: routeId as never,
      search: (prev: Record<string, unknown>) => ({ ...prev, scope: v as UrlScope }),
      replace: true,
    });
  };

  return (
    <Tabs value={current} onValueChange={handleChange}>
      <TabsList>
        <TabsTrigger value="mine">Moi</TabsTrigger>
        {(max === "team" || max === "all") && (
          <TabsTrigger value="team">Mon équipe</TabsTrigger>
        )}
        {max === "all" && <TabsTrigger value="all">Tous</TabsTrigger>}
      </TabsList>
    </Tabs>
  );
}

/**
 * Bannière affichée quand le scope demandé n'est pas encore brancé sur les
 * données (UI prête, data layer à venir).
 */
export function ScopeNotImplementedBanner({ scope }: { scope: UrlScope }) {
  if (scope === "mine") return null;
  const label = scope === "team" ? "équipe" : "globale";
  return (
    <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      Vue {label} : interface prête, branchement données à venir. Pour l'instant
      vos propres données sont affichées.
    </div>
  );
}

export const scopeSearchSchema = {
  parse: (s: Record<string, unknown>): { scope: UrlScope } => {
    const raw = s.scope;
    const scope: UrlScope =
      raw === "team" || raw === "all" || raw === "mine" ? raw : "mine";
    return { scope };
  },
};
