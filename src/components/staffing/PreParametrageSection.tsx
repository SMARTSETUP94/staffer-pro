// v0.37 — Section Pré-paramétrage métier (lecture seule).
// v0.38.1 — Chevron repli/dépli + persistance localStorage.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, AlertTriangle, Lock, ChevronDown, ChevronRight } from "lucide-react";
import {
  listChantierMetierConfig,
  suggestPreParametrage,
  type ChantierMetierConfigRow,
} from "@/server/staffing-pre-parametrage.functions";
import type { Conflict, MetierConfigKey } from "@/lib/staffing/pre-parametrage";

const COLLAPSE_LS_KEY = "staffing.preparam.collapsed.v1";


const METIER_LABEL: Record<MetierConfigKey, string> = {
  BE: "Bureau d'études",
  Num: "Numérique (CNC)",
  Bois: "Bois",
  Peint: "Peinture",
  Tap: "Tapisserie",
  Manut: "Manutention",
};

/**
 * Coerce une valeur (number, string, null, undefined) en nombre fini.
 * Tolère les strings vides, les espaces, les virgules décimales FR.
 * Retourne `fallback` si invalide ou < min.
 */
function safeNumber(
  v: unknown,
  fallback: number,
  opts?: { min?: number; max?: number },
): number {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "boolean") return fallback;
  let n: number;
  if (typeof v === "number") {
    n = v;
  } else {
    const s = String(v).trim().replace(",", ".");
    if (s === "") return fallback;
    n = Number(s);
  }
  if (!Number.isFinite(n)) return fallback;
  if (opts?.min !== undefined && n < opts.min) return fallback;
  if (opts?.max !== undefined && n > opts.max) return opts.max;
  return n;
}

/** Coerce une valeur en booléen avec fallback (utile pour Lissage). */
function safeBool(v: unknown, fallback: boolean): boolean {
  if (v === null || v === undefined || v === "") return fallback;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "on", "yes", "oui"].includes(s)) return true;
  if (["false", "0", "off", "no", "non"].includes(s)) return false;
  return fallback;
}

interface Props {
  affaireId: string;
  /** Deadline override (ex: plan.date_fin_fab) — fallback si affaire.date_fin_prevue NULL. */
  deadline?: string | null;
  onApplied?: () => void;
}

export function PreParametrageSection({ affaireId, deadline, onApplied: _onApplied }: Props) {
  const list = useServerFn(listChantierMetierConfig);
  const suggest = useServerFn(suggestPreParametrage);

  const [rows, setRows] = useState<ChantierMetierConfigRow[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [pipelineDuration, setPipelineDuration] = useState(0);
  const [fenetreDispo, setFenetreDispo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_LS_KEY) === "1";
  });
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(COLLAPSE_LS_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [existing, sugg] = await Promise.all([
        list({ data: { affaire_id: affaireId } }),
        suggest({ data: { affaire_id: affaireId, deadline: deadline ?? null } }),
      ]);
      const map = new Map<number, ChantierMetierConfigRow>();
      for (const c of sugg.configs) {
        map.set(c.metier_id, { id: `__suggest_${c.metier_id}`, affaire_id: affaireId, ...c });
      }
      for (const e of existing) map.set(e.metier_id, e);
      setRows(Array.from(map.values()).sort((a, b) => a.metier_id - b.metier_id));
      setConflicts(sugg.conflicts);
      setPipelineDuration(sugg.pipeline_duration);
      setFenetreDispo(sugg.fenetre_dispo);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affaireId, deadline]);

  const merged = (r: ChantierMetierConfigRow): ChantierMetierConfigRow => {
    const persCible = safeNumber(r.nb_pers_cible, 1, { min: 1 });
    return {
      ...r,
      total_h_calc: safeNumber(r.total_h_calc, 0),
      nb_pers_cible: persCible,
      duree_cible_j: safeNumber(r.duree_cible_j, 0),
      capa_max_jour: safeNumber(r.capa_max_jour, persCible, { min: 1 }),
      lissage_active: safeBool(r.lissage_active, true),
      be_override: safeBool(r.be_override, false),
    };
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement pré-paramétrage…
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Pré-paramétrage indisponible</p>
          <p className="text-xs opacity-90">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Aucun objet de fabrication non archivé sur cette affaire — pré-paramétrage indisponible.
      </div>
    );
  }

  const windowConflict = conflicts.find((c) => c.type === "WINDOW_INFEASIBLE");

  return (
    <section
      data-testid="pre-parametrage-section"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
            Pré-paramétrage métier <span className="text-muted-foreground">(lecture seule)</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Pipeline {pipelineDuration.toFixed(1)} j · fenêtre dispo {fenetreDispo} j ouvrés ·
            <span className="ml-1 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
              <Lock className="h-3 w-3" /> v0.37 — algo automatique
            </span>
          </p>
        </div>
      </header>

      {windowConflict && (
        <div
          data-testid="pre-param-conflict"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">Fenêtre infaisable ({windowConflict.delta_days ?? "?"} j manquants)</p>
            <p>{windowConflict.message}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="border-b border-border bg-background/40 text-left">
            <tr>
              <th className="px-2 py-2">Métier</th>
              <th className="px-2 py-2 text-right">Total h</th>
              <th className="px-2 py-2 text-right">Pers cible</th>
              <th className="px-2 py-2 text-right">Durée j</th>
              <th className="px-2 py-2 text-right">Capa max/j</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const m = merged(r);
              return (
                <tr
                  key={r.metier_id}
                  data-testid={`pre-param-row-${m.metier_code}`}
                  className="border-b border-border/40"
                >
                  <td className="px-2 py-1.5 font-semibold">{METIER_LABEL[m.metier_code]}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{m.total_h_calc.toFixed(0)}</td>
                  <td className="px-2 py-1.5 text-right font-mono" data-testid={`pre-param-pers-${m.metier_code}`}>
                    {m.nb_pers_cible}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{m.duree_cible_j.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right font-mono" data-testid={`pre-param-cap-${m.metier_code}`}>
                    {m.capa_max_jour}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Les valeurs sont déduites automatiquement par l'algo v0.37 (pipeline par objet, splits Manut 35/15/50,
        binômes obligatoires Bois/Peint/Tap/Manut). Plus de réglage manuel nécessaire.
      </p>
    </section>
  );
}

// v0.37 — BeOverridePanel supprimé (algo entièrement auto, plus de réglage manuel).

