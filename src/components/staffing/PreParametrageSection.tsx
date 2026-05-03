// v0.36 RC — Section Pré-paramétrage métier (au-dessus du Gantt)
// Affiche les configs métier avec sliders pers cible / capa / lissage + override BE.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Wand2, Save, AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  listChantierMetierConfig,
  suggestPreParametrage,
  upsertChantierMetierConfig,
  applyPreParametrageSuggestions,
  type ChantierMetierConfigRow,
} from "@/server/staffing-pre-parametrage.functions";
import type { Conflict, MetierConfigKey } from "@/lib/staffing/pre-parametrage";

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

export function PreParametrageSection({ affaireId, deadline, onApplied }: Props) {
  const list = useServerFn(listChantierMetierConfig);
  const suggest = useServerFn(suggestPreParametrage);
  const upsert = useServerFn(upsertChantierMetierConfig);
  const applyAll = useServerFn(applyPreParametrageSuggestions);

  const [rows, setRows] = useState<ChantierMetierConfigRow[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [pipelineDuration, setPipelineDuration] = useState(0);
  const [fenetreDispo, setFenetreDispo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, Partial<ChantierMetierConfigRow>>>({});

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [existing, sugg] = await Promise.all([
        list({ data: { affaire_id: affaireId } }),
        suggest({ data: { affaire_id: affaireId, deadline: deadline ?? null } }),
      ]);
      // Merge : existant prioritaire, sinon suggestion
      const map = new Map<number, ChantierMetierConfigRow>();
      for (const c of sugg.configs) {
        map.set(c.metier_id, {
          id: `__suggest_${c.metier_id}`,
          affaire_id: affaireId,
          ...c,
        });
      }
      for (const e of existing) map.set(e.metier_id, e);
      setRows(Array.from(map.values()).sort((a, b) => a.metier_id - b.metier_id));
      setConflicts(sugg.conflicts);
      setPipelineDuration(sugg.pipeline_duration);
      setFenetreDispo(sugg.fenetre_dispo);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erreur";
      // Affiche inline plutôt qu'en toast rouge — le bloc reste visible pour l'utilisateur.
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affaireId, deadline]);

  const patch = (metier_id: number, p: Partial<ChantierMetierConfigRow>) => {
    setEditing((prev) => ({ ...prev, [metier_id]: { ...prev[metier_id], ...p } }));
  };

  const merged = (r: ChantierMetierConfigRow): ChantierMetierConfigRow => {
    const base = { ...r, ...(editing[r.metier_id] ?? {}) };
    const persCible = safeNumber(base.nb_pers_cible, 1, { min: 1 });
    return {
      ...base,
      total_h_calc: safeNumber(base.total_h_calc, 0),
      nb_pers_cible: persCible,
      duree_cible_j: safeNumber(base.duree_cible_j, 0),
      capa_max_jour: safeNumber(base.capa_max_jour, persCible, { min: 1 }),
      lissage_active: safeBool(base.lissage_active, true),
      be_override: safeBool(base.be_override, false),
    };
  };

  const saveRow = async (r: ChantierMetierConfigRow) => {
    const m = merged(r);
    setBusy(true);
    try {
      await upsert({
        data: {
          affaire_id: affaireId,
          metier_id: m.metier_id,
          total_h_calc: Number(m.total_h_calc),
          nb_pers_cible: Number(m.nb_pers_cible),
          duree_cible_j: Number(m.duree_cible_j),
          capa_max_jour: Number(m.capa_max_jour),
          fenetre_start: m.fenetre_start ?? null,
          fenetre_end: m.fenetre_end ?? null,
          lissage_active: Boolean(m.lissage_active),
          be_override: Boolean(m.be_override),
          override_reason: m.override_reason ?? null,
        },
      });
      toast.success(`${METIER_LABEL[m.metier_code]} : sauvegardé`);
      setEditing((prev) => {
        const n = { ...prev };
        delete n[r.metier_id];
        return n;
      });
      await load();
      onApplied?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur sauvegarde");
    } finally {
      setBusy(false);
    }
  };

  const applySuggestions = async () => {
    setBusy(true);
    try {
      const { saved } = await applyAll({
        data: { affaire_id: affaireId, deadline: deadline ?? null },
      });
      toast.success(`${saved} métier(s) appliqué(s)`);
      await load();
      onApplied?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur application");
    } finally {
      setBusy(false);
    }
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
            Pré-paramétrage métier
          </h2>
          <p className="text-xs text-muted-foreground">
            Pipeline {pipelineDuration.toFixed(1)} j · fenêtre dispo {fenetreDispo} j ouvrés
          </p>
        </div>
        <Button size="sm" onClick={applySuggestions} disabled={busy}>
          <Wand2 className="mr-1 h-3 w-3" /> Appliquer + recalculer
        </Button>
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
            {windowConflict.levers && (
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {windowConflict.levers.map((l, i) => (
                  <li key={i}>
                    {l.action === "BE_OVERRIDE" && `BE override (gain ~${l.gain_days?.toFixed(1)} j)`}
                    {l.action === "INCREASE_RESOURCES" && `Renforcer ${l.metier ? METIER_LABEL[l.metier] : "?"}`}
                    {l.action === "POSTPONE_DEADLINE" && `Repousser la livraison de ${l.delta_days} j`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <thead className="border-b border-border bg-background/40 text-left">
            <tr>
              <th className="px-2 py-2">Métier</th>
              <th className="px-2 py-2 text-right">Total h</th>
              <th className="px-2 py-2 text-right">Pers cible</th>
              <th className="px-2 py-2 text-right">Durée j</th>
              <th className="px-2 py-2 text-right">Capa max/j</th>
              <th className="px-2 py-2 text-center">Lissage</th>
              <th className="px-2 py-2">Statut</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const m = merged(r);
              const isSugg = r.id.startsWith("__suggest_");
              const dirty = Boolean(editing[r.metier_id]);
              return (
                <tr
                  key={r.metier_id}
                  data-testid={`pre-param-row-${m.metier_code}`}
                  className="border-b border-border/40"
                >
                  <td className="px-2 py-1.5 font-semibold">{METIER_LABEL[m.metier_code]}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{m.total_h_calc.toFixed(0)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Input
                      type="number"
                      min={1}
                      value={m.nb_pers_cible}
                      onChange={(e) => patch(r.metier_id, { nb_pers_cible: Number(e.target.value) })}
                      className="h-7 w-16 text-right text-xs"
                      data-testid={`pre-param-pers-${m.metier_code}`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{m.duree_cible_j.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Input
                      type="number"
                      min={1}
                      value={m.capa_max_jour}
                      onChange={(e) => patch(r.metier_id, { capa_max_jour: Number(e.target.value) })}
                      className="h-7 w-16 text-right text-xs"
                      data-testid={`pre-param-cap-${m.metier_code}`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <Switch
                      checked={m.lissage_active}
                      onCheckedChange={(v) => patch(r.metier_id, { lissage_active: v })}
                      data-testid={`pre-param-lissage-${m.metier_code}`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {isSugg ? (
                      <Badge variant="outline" className="text-[10px]">Suggéré</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Sauvegardé</Badge>
                    )}
                    {dirty && <Badge variant="default" className="ml-1 text-[10px]">Modifié</Badge>}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy || (!dirty && !isSugg)}
                      onClick={() => saveRow(r)}
                      data-testid={`pre-param-save-${m.metier_code}`}
                    >
                      <Save className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Override BE — seul cas où on autorise 2 BE en parallèle */}
      {rows.some((r) => r.metier_code === "BE") && (
        <BeOverridePanel
          row={rows.find((r) => r.metier_code === "BE")!}
          editing={editing}
          patch={patch}
          onSave={(r) => saveRow(r)}
          busy={busy}
        />
      )}
    </section>
  );
}

function BeOverridePanel({
  row,
  editing,
  patch,
  onSave,
  busy,
}: {
  row: ChantierMetierConfigRow;
  editing: Record<string, Partial<ChantierMetierConfigRow>>;
  patch: (metier_id: number, p: Partial<ChantierMetierConfigRow>) => void;
  onSave: (r: ChantierMetierConfigRow) => void;
  busy: boolean;
}) {
  const m = { ...row, ...(editing[row.metier_id] ?? {}) };
  const reasonOk = (m.override_reason ?? "").trim().length >= 10;
  return (
    <details
      className="rounded-md border border-border bg-background/40 p-2 text-xs"
      data-testid="be-override-panel"
    >
      <summary className="cursor-pointer font-semibold">
        <Lock className="mr-1 inline h-3 w-3" />
        Override BE — autoriser 2 personnes en parallèle
        {m.be_override && <Badge variant="default" className="ml-2 text-[10px]">Activé</Badge>}
      </summary>
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={m.be_override}
            onCheckedChange={(v) => patch(row.metier_id, { be_override: v })}
            data-testid="be-override-switch"
          />
          <span>Activer override</span>
        </div>
        {m.be_override && (
          <Textarea
            placeholder="Raison ≥ 10 caractères (ex: pic projet, 2 BE requis pour tenir la deadline)"
            value={m.override_reason ?? ""}
            onChange={(e) => patch(row.metier_id, { override_reason: e.target.value })}
            className="text-xs"
            rows={2}
            data-testid="be-override-reason"
          />
        )}
        <Button
          size="sm"
          disabled={busy || (m.be_override && !reasonOk)}
          onClick={() => onSave(row)}
          data-testid="be-override-save"
        >
          <Save className="mr-1 h-3 w-3" /> Sauvegarder override
        </Button>
        {m.be_override && !reasonOk && (
          <p className="text-destructive">Raison ≥ 10 caractères requise.</p>
        )}
      </div>
    </details>
  );
}
