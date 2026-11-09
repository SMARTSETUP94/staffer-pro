import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lireHeuresDevisAffaire } from "@/lib/planning-devis-heures.functions";

const STATUTS: Record<string, string> = { brouillon: "brouillon", a_valider: "à valider", valide: "validé", transfere: "transféré", signe: "signé", refuse: "refusé" };
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Devis du chantier avec leurs heures : sert à remplir « Heures prévues » (global ou métier). */
export function DevisHeuresChantier({ affaireId, metierId, metiers, disabled, onUse }: {
  affaireId: string; metierId: number | null; metiers: { id: number; libelle: string }[]; disabled: boolean; onUse: (h: number) => void;
}) {
  const lire = useServerFn(lireHeuresDevisAffaire);
  const q = useQuery({ queryKey: ["planning-devis-heures", affaireId], queryFn: () => lire({ data: { affaireId } }) });
  const nom = (k: string) => metiers.find((m) => String(m.id) === k)?.libelle ?? `Métier ${k}`;
  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium"><FileText className="h-4 w-4" />Devis du chantier</div>
      {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : q.error ? <p className="text-destructive">Devis indisponibles.</p>
        : !q.data?.length ? <p className="text-muted-foreground">Aucun devis rattaché à ce chantier.</p>
        : <ul className="space-y-2">{q.data.map((d) => {
          const h = metierId != null ? r1(d.heures[String(metierId)] ?? 0) : d.total;
          return <li key={d.id} className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><strong>{d.numero}</strong> · {STATUTS[d.statut] ?? d.statut}{d.source === "import" ? " · import" : ""} · <strong>{h} h</strong>{metierId != null ? "" : " au total"}</span>
              <span className="flex gap-1">
                {d.source === "staffing" && <Button asChild size="sm" variant="ghost"><Link to="/affaires/$affaireId/devis" params={{ affaireId }}>Voir</Link></Button>}
                {!disabled && <Button size="sm" variant="outline" onClick={() => onUse(h)}>Reprendre {h} h</Button>}
              </span>
            </div>
            {metierId == null && <p className="text-xs text-muted-foreground">{Object.entries(d.heures).filter(([, v]) => v > 0).map(([k, v]) => `${nom(k)} ${r1(v)} h`).join(" · ") || "Aucune heure saisie"}</p>}
          </li>;
        })}</ul>}
    </div>
  );
}
