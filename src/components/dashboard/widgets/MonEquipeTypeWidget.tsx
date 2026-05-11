/**
 * v0.43 — Widget "Mon équipe type".
 * Coéquipiers les plus fréquemment staffés avec le chef connecté
 * sur les 12 derniers mois, filtrable par typologie.
 * Réservé chef_chantier / chef_metier_scoped (whitelist).
 */
import { useEffect, useMemo, useState } from "react";
import { Users, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Row {
  employe_id: string;
  prenom: string;
  nom: string;
  type_contrat: string;
  poste_principal: string | null;
  nb_chantiers: number;
  total_demi_jours: number;
  presence_pct_moyen: number;
  derniere_collab: string | null;
  score: number;
}

const TYPOLOGIE_OPTS: { value: string; label: string }[] = [
  { value: "all", label: "Toutes typologies" },
  { value: "montage_demontage", label: "Montage / démontage" },
  { value: "fabrication", label: "Fabrication" },
  { value: "stockage", label: "Stockage" },
  { value: "prototype", label: "Prototype" },
  { value: "non_operationnel", label: "Non opérationnel" },
];

function fmtLastCollab(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "aujourd'hui";
  if (days < 30) return `il y a ${days}j`;
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  return d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

export function MonEquipeTypeWidget() {
  const [typologie, setTypologie] = useState<string>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("get_mon_equipe_type", {
        _typologie: typologie === "all" ? undefined : typologie,
        _limit: 8,
        _months: 12,
      });
      if (cancelled) return;
      if (!error && data) setRows(data as Row[]);
      else setRows([]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [typologie]);

  const totalCollabs = useMemo(
    () => rows.reduce((acc, r) => acc + r.nb_chantiers, 0),
    [rows],
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Mon équipe type
        </CardTitle>
        <Select value={typologie} onValueChange={setTypologie}>
          <SelectTrigger className="h-7 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPOLOGIE_OPTS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Pas encore d'historique sur ce filtre.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              Top {rows.length} coéquipiers sur 12 mois · {totalCollabs} collaborations cumulées
            </p>
            <ul className="divide-y">
              {rows.map((r, idx) => (
                <li key={r.employe_id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold tabular-nums text-primary">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {r.prenom} {r.nom}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.poste_principal ?? r.type_contrat}
                        <span className="mx-1">·</span>
                        <span className="tabular-nums">{r.nb_chantiers} chantier{r.nb_chantiers > 1 ? "s" : ""}</span>
                        <span className="mx-1">·</span>
                        {fmtLastCollab(r.derniere_collab)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[11px] tabular-nums">
                    {r.total_demi_jours} ½j
                  </Badge>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-3 flex items-center justify-end text-[11px] text-muted-foreground">
          <span>Calculé en temps réel <ArrowRight className="inline h-3 w-3" /></span>
        </div>
      </CardContent>
    </Card>
  );
}
