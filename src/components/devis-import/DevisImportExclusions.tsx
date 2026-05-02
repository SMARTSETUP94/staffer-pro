/**
 * v0.31.6 — Panneau "Pourquoi c'est exclu".
 *
 * Affiche, pour chaque ligne écartée par le parser, la règle qui a déclenché
 * l'exclusion + un lien rapide vers la ligne Excel correspondante (numéro de
 * ligne 1-based + bouton copier pour aller chercher dans le fichier source).
 *
 * Filtres : par section + par règle. Les exclusions silencieuses (commentaires,
 * postes vides) sont masquées par défaut — on n'affiche que celles qui peuvent
 * surprendre l'utilisateur (exclusions regex, métiers inconnus, lots chantier…).
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Copy, Filter, HelpCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import type { ExclusionEntry, ExclusionKind } from "@/lib/devis-parser/types";

interface Props {
  exclusions: ExclusionEntry[];
  /** Nom du fichier source (pour l'aide « ouvrir la ligne X dans Excel »). */
  filename?: string | null;
}

interface KindMeta {
  label: string;
  hint: string;
  /** Variant Tailwind via design tokens. */
  tone: "destructive" | "warning" | "muted" | "info";
  /** true = caché par défaut (informatif silencieux). */
  silent: boolean;
}

const KIND_META: Record<ExclusionKind, KindMeta> = {
  exclude_regex: {
    label: "Règle d'exclusion",
    hint: "Le libellé matche une règle EXCLUDE_REGEX (remise commerciale, total HT, sous-total, …).",
    tone: "destructive",
    silent: false,
  },
  niveau2_excluded_no_children: {
    label: "Objet exclu sans enfant",
    hint: "Un objet N.M exclu par règle et qui n'a aucun poste atelier/matière à récupérer.",
    tone: "destructive",
    silent: false,
  },
  metier_unknown: {
    label: "Métier non détecté",
    hint: "Le poste a des heures mais aucun pattern métier ne matche son libellé. À mapper manuellement.",
    tone: "warning",
    silent: false,
  },
  matiere_no_montant: {
    label: "Matière sans montant",
    hint: "Ligne matière sans Total HT — non comptée dans le budget matériaux.",
    tone: "warning",
    silent: false,
  },
  regul_with_hours: {
    label: "Régul avec heures",
    hint: "Régul avec Temps prévu > 0. Les heures sont ignorées par défaut, le total HT est conservé.",
    tone: "warning",
    silent: false,
  },
  lot_chantier_in_objet: {
    label: "Lot chantier",
    hint: "Lignes Montage/Démontage rebasculées dans les heures chantier globales (pas dans l'objet).",
    tone: "info",
    silent: true,
  },
  section_skipped: {
    label: "Section ignorée",
    hint: "Section niveau 1 entièrement chantier (Montage/Démontage) sans métier atelier.",
    tone: "info",
    silent: true,
  },
  empty_poste: {
    label: "Poste vide",
    hint: "Quantité, total HT et temps prévu tous à zéro — poste inutilisé dans ce devis.",
    tone: "muted",
    silent: true,
  },
  comment: {
    label: "Commentaire",
    hint: "Ligne sans numéro — utilisée comme description de l'objet parent.",
    tone: "muted",
    silent: true,
  },
};

const TONE_CLASS: Record<KindMeta["tone"], string> = {
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  info: "bg-primary/10 text-primary border-primary/30",
  muted: "bg-muted text-muted-foreground border-muted-foreground/20",
};

export function DevisImportExclusions({ exclusions, filename }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showSilent, setShowSilent] = useState(false);
  const [kindFilter, setKindFilter] = useState<ExclusionKind | "all">("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");

  const sections = useMemo(() => {
    const set = new Set<string>();
    for (const e of exclusions) if (e.sectionNumero) set.add(e.sectionNumero);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  }, [exclusions]);

  const visibleByDefault = useMemo(
    () => exclusions.filter((e) => !KIND_META[e.kind].silent),
    [exclusions],
  );

  const filtered = useMemo(() => {
    return exclusions.filter((e) => {
      if (!showSilent && KIND_META[e.kind].silent) return false;
      if (kindFilter !== "all" && e.kind !== kindFilter) return false;
      if (sectionFilter !== "all" && e.sectionNumero !== sectionFilter) return false;
      return true;
    });
  }, [exclusions, showSilent, kindFilter, sectionFilter]);

  const counts = useMemo(() => {
    const out: Record<ExclusionKind, number> = {
      exclude_regex: 0,
      empty_poste: 0,
      lot_chantier_in_objet: 0,
      metier_unknown: 0,
      niveau2_excluded_no_children: 0,
      matiere_no_montant: 0,
      regul_with_hours: 0,
      section_skipped: 0,
      comment: 0,
    };
    for (const e of exclusions) out[e.kind]++;
    return out;
  }, [exclusions]);

  if (exclusions.length === 0) return null;

  return (
    <Card className="border-dashed">
      <CardContent className="space-y-3 p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <HelpCircle className="h-4 w-4 text-primary" />
            <span className="font-medium">Pourquoi c'est exclu</span>
            <Badge variant="secondary" className="ml-1">
              {visibleByDefault.length} à expliquer
            </Badge>
            {exclusions.length - visibleByDefault.length > 0 && (
              <Badge variant="outline" className="text-xs">
                +{exclusions.length - visibleByDefault.length} silencieuses
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {counts.exclude_regex > 0 && (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">
                {counts.exclude_regex} règle
              </span>
            )}
            {counts.metier_unknown > 0 && (
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
                {counts.metier_unknown} métier ?
              </span>
            )}
            {counts.lot_chantier_in_objet > 0 && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                {counts.lot_chantier_in_objet} chantier
              </span>
            )}
          </div>
        </button>

        {expanded && (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-2">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Filtres :</span>
              </div>
              <Select
                value={kindFilter}
                onValueChange={(v) => setKindFilter(v as ExclusionKind | "all")}
              >
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les règles</SelectItem>
                  {(Object.keys(KIND_META) as ExclusionKind[]).map((k) =>
                    counts[k] > 0 ? (
                      <SelectItem key={k} value={k}>
                        {KIND_META[k].label} ({counts[k]})
                      </SelectItem>
                    ) : null,
                  )}
                </SelectContent>
              </Select>
              <Select value={sectionFilter} onValueChange={setSectionFilter}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes sections</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s} value={s}>
                      Section {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={showSilent}
                  onCheckedChange={(v) => setShowSilent(v === true)}
                />
                Inclure exclusions silencieuses (commentaires, postes vides…)
              </label>
            </div>

            {filtered.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Aucune exclusion ne correspond aux filtres actuels.
              </p>
            ) : (
              <div className="max-h-[420px] overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-2 py-1.5 font-medium">Ligne</th>
                      <th className="px-2 py-1.5 font-medium">N°</th>
                      <th className="px-2 py-1.5 font-medium">Désignation</th>
                      <th className="px-2 py-1.5 font-medium">Règle</th>
                      <th className="px-2 py-1.5 font-medium">Pourquoi</th>
                      <th className="px-2 py-1.5 font-medium text-right">H / Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e, idx) => {
                      const meta = KIND_META[e.kind];
                      return (
                        <tr
                          key={`${e.rowIndex}-${idx}`}
                          className="border-b last:border-b-0 hover:bg-muted/30"
                        >
                          <td className="px-2 py-1.5 align-top font-mono">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 hover:bg-muted"
                                  onClick={() => {
                                    void navigator.clipboard
                                      .writeText(String(e.rowIndex))
                                      .then(() =>
                                        toast.success(
                                          `Ligne ${e.rowIndex} copiée${
                                            filename ? ` — ouvrir "${filename}"` : ""
                                          }`,
                                          { duration: 2500 },
                                        ),
                                      );
                                  }}
                                >
                                  L{e.rowIndex}
                                  <Copy className="h-3 w-3 text-muted-foreground" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Copier le n° de ligne pour l'ouvrir dans Excel
                                {filename ? ` (${filename})` : ""}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="px-2 py-1.5 align-top font-mono text-muted-foreground">
                            {e.numero || "—"}
                          </td>
                          <td className="px-2 py-1.5 align-top">
                            <span className="line-clamp-2">{e.designation || "—"}</span>
                            {e.sectionNumero && (
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                Section {e.sectionNumero}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 align-top">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="outline"
                                  className={`${TONE_CLASS[meta.tone]} cursor-help font-normal`}
                                >
                                  {meta.label}
                                  {e.isRecoverable && " · récupérable"}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                {meta.hint}
                                {e.rule && (
                                  <div className="mt-1 font-mono text-[10px] opacity-80">
                                    /{e.rule}/i
                                  </div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                          <td className="px-2 py-1.5 align-top text-muted-foreground">
                            {e.reason}
                          </td>
                          <td className="px-2 py-1.5 align-top text-right font-mono text-muted-foreground">
                            {e.tempsPrevu != null && e.tempsPrevu !== 0 && (
                              <div>{e.tempsPrevu}h</div>
                            )}
                            {e.totalHt != null && e.totalHt !== 0 && (
                              <div>{e.totalHt.toFixed(2)}€</div>
                            )}
                            {(e.tempsPrevu == null || e.tempsPrevu === 0) &&
                              (e.totalHt == null || e.totalHt === 0) && (
                                <span className="opacity-50">—</span>
                              )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              💡 Astuce : copiez le numéro de ligne (bouton L###) puis dans Excel,{" "}
              <kbd className="rounded border bg-background px-1">Ctrl+G</kbd> ou{" "}
              <kbd className="rounded border bg-background px-1">F5</kbd>, collez et validez pour
              sauter directement à la ligne du devis source.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const tsv =
                  "Ligne\tN°\tSection\tRègle\tDésignation\tPourquoi\tHeures\tTotal HT\n" +
                  filtered
                    .map((e) =>
                      [
                        e.rowIndex,
                        e.numero || "",
                        e.sectionNumero || "",
                        KIND_META[e.kind].label,
                        e.designation.replace(/\t/g, " "),
                        e.reason.replace(/\t/g, " "),
                        e.tempsPrevu ?? "",
                        e.totalHt ?? "",
                      ].join("\t"),
                    )
                    .join("\n");
                void navigator.clipboard
                  .writeText(tsv)
                  .then(() => toast.success(`${filtered.length} exclusions copiées (TSV)`));
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copier le tableau (TSV)
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
