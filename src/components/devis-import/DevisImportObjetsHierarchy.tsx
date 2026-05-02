/**
 * v0.31.4b — Vue arborescente Section / Objet / Postes pour la modale d'import devis.
 *
 * Fonctionnalités :
 *  - Compteur global Total / Auto / Manuel + bandeau intégrité parser.
 *  - Arborescence repliable par Section puis par Objet.
 *  - Description objet (lignes commentaires) dans une sous-section repliable « Détails ».
 *  - Override métier par poste (dropdown) → recompute des heures objet.
 *  - Toggle Matériel / Heures par poste → bascule l'imputation.
 *  - Drag&drop d'un poste vers un autre objet (réassignation parent).
 *  - Bouton « Ajouter un objet » manuel pour récupérer les postes orphelins.
 *  - Liste « Postes à mapper » (non auto-mappés) avec saut rapide.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Info,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import type { FabMetier } from "@/hooks/use-fabrication";
import { emptyHeures } from "@/lib/devis-parser/compute-flags";
import { computeFlagsFromMetiers } from "@/lib/devis-parser/compute-flags";
import type { IntegrityCheck, PosteCandidat } from "@/lib/devis-parser/types";
import {
  computeCounters,
  effectiveIsMatiere,
  isPosteAutoMapped,
  movePosteBetweenObjets,
  objetTotalHeures,
  recomputeObjet,
  removeObjet,
  removePosteFromObjet,
  renamePoste,
  round2,
  type EditableObjet,
} from "./objets-hierarchy-helpers";

const METIER_OPTIONS: { key: FabMetier; label: string }[] = [
  { key: "be", label: "BE / Suivi" },
  { key: "numerique", label: "Numérique" },
  { key: "bois", label: "Bois / Constru." },
  { key: "metal", label: "Métallerie" },
  { key: "peinture", label: "Peinture" },
  { key: "tapisserie", label: "Tapisserie" },
  { key: "manutention", label: "Logistique" },
];

interface Props {
  objets: EditableObjet[];
  setObjets: React.Dispatch<React.SetStateAction<EditableObjet[]>>;
  integrityChecks: IntegrityCheck[];
}

/* -------------------------------------------------------------------------- */
/* Composant principal                                                         */
/* -------------------------------------------------------------------------- */

export function DevisImportObjetsHierarchy({ objets, setObjets, integrityChecks }: Props) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(objets.map((o) => o.sectionNumero || "_orphan")),
  );
  const [expandedObjets, setExpandedObjets] = useState<Set<string>>(new Set());
  const [showDescriptions, setShowDescriptions] = useState<Set<string>>(new Set());
  const [draggedPoste, setDraggedPoste] = useState<{ objetIdx: number; posteId: string } | null>(
    null,
  );

  const toggleSection = (key: string) =>
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleObjet = (key: string) =>
    setExpandedObjets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleDescription = (key: string) =>
    setShowDescriptions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /* ---- Compteurs globaux ---- */
  const counters = useMemo(() => {
    let total = 0;
    let auto = 0;
    let manuel = 0;
    let totalHeuresAuto = 0;
    let totalHeuresManuel = 0;
    for (const o of objets) {
      for (const p of o.postes) {
        total++;
        const heuresEff = p.heuresUnitaires * o.quantite;
        if (isPosteAutoMapped(p)) {
          auto++;
          if (!effectiveIsMatiere(p) && !p.isRegul) totalHeuresAuto += heuresEff;
        } else {
          manuel++;
          totalHeuresManuel += heuresEff;
        }
      }
    }
    const ratio = total === 0 ? 100 : Math.round((auto / total) * 100);
    return {
      total,
      auto,
      manuel,
      ratio,
      totalHeures: round2(totalHeuresAuto + totalHeuresManuel),
      heuresAuto: round2(totalHeuresAuto),
      heuresManuel: round2(totalHeuresManuel),
    };
  }, [objets]);

  /* ---- Postes orphelins (non mappés, tous objets confondus) ---- */
  const postesAMapper = useMemo(() => {
    const arr: { objetIdx: number; objetNom: string; poste: PosteCandidat }[] = [];
    objets.forEach((o, idx) => {
      o.postes.forEach((p) => {
        if (!isPosteAutoMapped(p)) {
          arr.push({ objetIdx: idx, objetNom: o.nom || o.numero, poste: p });
        }
      });
    });
    return arr;
  }, [objets]);

  /* ---- Groupement par Section ---- */
  const sections = useMemo(() => {
    const map = new Map<string, { numero: string; nom: string; objetIdxs: number[] }>();
    objets.forEach((o, idx) => {
      const key = o.sectionNumero || "_orphan";
      const cur = map.get(key) ?? {
        numero: o.sectionNumero || "—",
        nom: o.sectionNom || (o.manuel ? "Objets manuels" : "Sans section"),
        objetIdxs: [],
      };
      cur.objetIdxs.push(idx);
      map.set(key, cur);
    });
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [objets]);

  /* ---- Mutations ---- */
  const updateObjet = (idx: number, patch: Partial<EditableObjet>) =>
    setObjets((prev) => prev.map((o, i) => (i === idx ? recomputeObjet({ ...o, ...patch }) : o)));

  const updateQuantite = (idx: number, q: number) =>
    setObjets((prev) =>
      prev.map((o, i) => (i === idx ? recomputeObjet({ ...o, quantite: Math.max(1, q) }) : o)),
    );

  const updatePoste = (objetIdx: number, posteId: string, patch: Partial<PosteCandidat>) =>
    setObjets((prev) =>
      prev.map((o, i) => {
        if (i !== objetIdx) return o;
        const postes = o.postes.map((p) => {
          if (p.id !== posteId) return p;
          const next = { ...p, ...patch };
          next.autoMapped = isPosteAutoMapped(next);
          return next;
        });
        return recomputeObjet({ ...o, postes });
      }),
    );

  const movePoste = (fromIdx: number, posteId: string, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setObjets((prev) => {
      const from = prev[fromIdx];
      const to = prev[toIdx];
      if (!from || !to) return prev;
      const poste = from.postes.find((p) => p.id === posteId);
      if (!poste) return prev;
      return prev.map((o, i) => {
        if (i === fromIdx) {
          return recomputeObjet({ ...o, postes: o.postes.filter((p) => p.id !== posteId) });
        }
        if (i === toIdx) {
          return recomputeObjet({ ...o, postes: [...o.postes, poste] });
        }
        return o;
      });
    });
  };

  const deletePoste = (objetIdx: number, posteId: string) =>
    setObjets((prev) => removePosteFromObjet(prev, objetIdx, posteId));

  const deleteObjet = (objetIdx: number) => setObjets((prev) => removeObjet(prev, objetIdx));

  const renamePosteDesignation = (objetIdx: number, posteId: string, designation: string) =>
    setObjets((prev) => renamePoste(prev, objetIdx, posteId, designation));

  const addManualObjet = () => {
    const numero = `M${Date.now().toString().slice(-5)}`;
    setObjets((prev) => [
      ...prev,
      {
        selected: true,
        numero,
        sectionNumero: "",
        sectionNom: "Objets manuels",
        sectionQuantite: 1,
        nom: "Nouvel objet manuel",
        description: null,
        quantite: 1,
        heures: emptyHeures(),
        budgetMateriaux: 0,
        typeFinition: "aucune",
        flags: computeFlagsFromMetiers(emptyHeures()),
        confidence: "high",
        warnings: [],
        postes: [],
        manuel: true,
      },
    ]);
  };

  /* ---- Bandeau intégrité ---- */
  const errorChecks = integrityChecks.filter((c) => c.severite === "error");
  const warnChecks = integrityChecks.filter((c) => c.severite === "warning");

  /* -------------------------------------------------------------------------- */
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        {/* Header — titre + compteur global */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Section 3 — Objets fabrication
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Hiérarchie Section / Objet / Postes — édite, mappe ou drag&drop pour ajuster.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-md">
              {counters.total} postes • {counters.totalHeures} h
            </Badge>
            <Badge
              variant="outline"
              className="rounded-md border-emerald-500/40 bg-emerald-500/5 text-emerald-700"
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Auto {counters.auto} ({counters.ratio}%) • {counters.heuresAuto} h
            </Badge>
            <Badge
              variant="outline"
              className={
                counters.manuel > 0
                  ? "rounded-md border-amber-500/50 bg-amber-500/10 text-amber-800"
                  : "rounded-md"
              }
            >
              <TriangleAlert className="mr-1 h-3 w-3" />À mapper {counters.manuel} • {counters.heuresManuel} h
            </Badge>
          </div>
        </div>

        {/* Bandeau intégrité parser */}
        {(errorChecks.length > 0 || warnChecks.length > 0) && (
          <div className="space-y-1.5">
            {errorChecks.map((c) => (
              <div
                key={`err-${c.sectionNumero}`}
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Section {c.sectionNumero} — {c.sectionNom.slice(0, 60)}</strong> :
                  écart {c.ecart > 0 ? "+" : ""}
                  {c.ecart} h (déclaré {c.heuresDeclarees} h, calculé {c.heuresCalculees} h).
                </span>
              </div>
            ))}
            {warnChecks.map((c) => (
              <div
                key={`warn-${c.sectionNumero}`}
                className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-800"
              >
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Section {c.sectionNumero} : tolérance dépassée (écart {c.ecart} h).
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Liste des postes à mapper */}
        {postesAMapper.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="mb-1.5 text-xs font-semibold text-amber-900">
              {postesAMapper.length} poste(s) à mapper manuellement
            </p>
            <ul className="space-y-1 text-xs text-amber-900">
              {postesAMapper.slice(0, 8).map(({ objetIdx, objetNom, poste }) => (
                <li key={`${objetIdx}-${poste.id}`} className="flex items-start gap-2">
                  <span className="font-mono text-[10px] text-amber-700">
                    {poste.numero || `L${poste.rowIndex}`}
                  </span>
                  <span className="flex-1 truncate">
                    {poste.designation.slice(0, 80)}
                    <span className="text-amber-700"> — dans « {objetNom.slice(0, 40)} »</span>
                  </span>
                  <button
                    type="button"
                    className="text-[11px] font-medium underline"
                    onClick={() => {
                      const o = objets[objetIdx];
                      if (!o) return;
                      setExpandedSections((s) => new Set(s).add(o.sectionNumero || "_orphan"));
                      setExpandedObjets((s) => new Set(s).add(o.numero));
                    }}
                  >
                    Ouvrir
                  </button>
                </li>
              ))}
              {postesAMapper.length > 8 && (
                <li className="text-amber-700">
                  + {postesAMapper.length - 8} autre(s) poste(s) à mapper…
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Arborescence Section / Objet / Postes */}
        {objets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Aucun objet de fabrication détecté. Ajoute un objet manuel pour saisir des heures.
          </p>
        ) : (
          <div className="space-y-2">
            {sections.map((sec) => {
              const isOpen = expandedSections.has(sec.key);
              const sectionObjets = sec.objetIdxs.map((i) => objets[i]).filter(Boolean);
              const sectionTotalHeures = round2(
                sectionObjets.reduce((s, o) => s + objetTotalHeures(o), 0),
              );
              return (
                <div key={sec.key} className="rounded-xl border border-border">
                  {/* En-tête Section */}
                  <button
                    type="button"
                    onClick={() => toggleSection(sec.key)}
                    className="flex w-full items-center justify-between gap-2 rounded-t-xl bg-muted/40 px-3 py-2 text-left hover:bg-muted/60"
                  >
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-mono text-[11px] text-muted-foreground">
                        Section {sec.numero}
                      </span>
                      <span className="text-sm font-medium">{sec.nom}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {sec.objetIdxs.length} objet(s) • {sectionTotalHeures} h
                    </span>
                  </button>

                  {/* Objets enfants */}
                  {isOpen && (
                    <div className="space-y-1.5 border-t border-border p-2">
                      {sec.objetIdxs.map((objetIdx) => {
                        const o = objets[objetIdx];
                        if (!o) return null;
                        const objetKey = o.numero;
                        const objetOpen = expandedObjets.has(objetKey);
                        const descOpen = showDescriptions.has(objetKey);
                        const totalH = objetTotalHeures(o);
                        const orphanCount = o.postes.filter((p) => !isPosteAutoMapped(p)).length;

                        return (
                          <div
                            key={objetKey}
                            className="rounded-lg border border-border/70"
                            onDragOver={(e) => {
                              if (draggedPoste && draggedPoste.objetIdx !== objetIdx) {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "move";
                              }
                            }}
                            onDrop={(e) => {
                              if (!draggedPoste) return;
                              e.preventDefault();
                              movePoste(draggedPoste.objetIdx, draggedPoste.posteId, objetIdx);
                              setDraggedPoste(null);
                            }}
                          >
                            {/* Ligne objet : checkbox + nom + qté + total + bouton repli */}
                            <div className="flex flex-wrap items-center gap-2 p-2">
                              <Checkbox
                                checked={o.selected}
                                onCheckedChange={(v) => updateObjet(objetIdx, { selected: !!v })}
                              />
                              <button
                                type="button"
                                onClick={() => toggleObjet(objetKey)}
                                className="text-muted-foreground"
                              >
                                {objetOpen ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {o.numero}
                              </span>
                              <Input
                                value={o.nom}
                                onChange={(e) => updateObjet(objetIdx, { nom: e.target.value })}
                                className="h-8 min-w-[200px] flex-1"
                              />
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                Qté
                                <Input
                                  type="number"
                                  min={1}
                                  value={o.quantite}
                                  onChange={(e) =>
                                    updateQuantite(objetIdx, Number(e.target.value) || 1)
                                  }
                                  className="h-8 w-14 text-right tabular-nums"
                                />
                              </div>
                              <Badge variant="secondary" className="rounded-md tabular-nums">
                                {totalH} h
                              </Badge>
                              <Badge variant="outline" className="rounded-md tabular-nums">
                                {round2(o.budgetMateriaux).toLocaleString("fr-FR")} €
                              </Badge>
                              {orphanCount > 0 && (
                                <Badge className="rounded-md bg-amber-500/15 text-amber-900 hover:bg-amber-500/20">
                                  {orphanCount} à mapper
                                </Badge>
                              )}
                              {o.warnings.length > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="text-amber-600">
                                      <Info className="h-4 w-4" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-md">
                                    <ul className="space-y-0.5 text-xs">
                                      {o.warnings.map((w, i) => (
                                        <li key={i}>• {w}</li>
                                      ))}
                                    </ul>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>

                            {/* Section repliable « Détails » */}
                            {o.description && (
                              <div className="border-t border-border/60 px-3 py-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleDescription(objetKey)}
                                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                                >
                                  {descOpen ? "▾" : "▸"} Détails
                                </button>
                                {descOpen && (
                                  <p className="mt-1 whitespace-pre-line text-xs italic text-muted-foreground">
                                    {o.description}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Postes enfants */}
                            {objetOpen && (
                              <div className="border-t border-border/60 bg-muted/20 p-2">
                                {o.postes.length === 0 ? (
                                  <p className="text-[11px] italic text-muted-foreground">
                                    Aucun poste — déplace-en un ici via drag&drop.
                                  </p>
                                ) : (
                                  <ul className="space-y-1">
                                    {o.postes.map((p) => {
                                      const mapped = isPosteAutoMapped(p);
                                      const isMat = effectiveIsMatiere(p);
                                      return (
                                        <li
                                          key={p.id}
                                          draggable
                                          onDragStart={() =>
                                            setDraggedPoste({ objetIdx, posteId: p.id })
                                          }
                                          onDragEnd={() => setDraggedPoste(null)}
                                          className={`flex flex-wrap items-center gap-2 rounded-md border px-2 py-1 ${
                                            mapped
                                              ? "border-border bg-background"
                                              : "border-amber-500/40 bg-amber-50/50"
                                          }`}
                                        >
                                          <GripVertical className="h-3.5 w-3.5 cursor-grab text-muted-foreground" />
                                          <span className="font-mono text-[10px] text-muted-foreground">
                                            {p.numero || `L${p.rowIndex}`}
                                          </span>
                                          <span className="flex-1 truncate text-xs">
                                            {p.designation.slice(0, 80)}
                                          </span>
                                          {/* Toggle Matériel/Heures */}
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updatePoste(objetIdx, p.id, {
                                                isMatiereOverride: !isMat,
                                              })
                                            }
                                            className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                                              isMat
                                                ? "bg-blue-100 text-blue-800"
                                                : "bg-emerald-100 text-emerald-800"
                                            }`}
                                          >
                                            {isMat ? "Matériel" : "Heures"}
                                          </button>
                                          {/* Override métier (heures) */}
                                          {!isMat && !p.isRegul && (
                                            <Select
                                              value={p.metier ?? "_none"}
                                              onValueChange={(v) =>
                                                updatePoste(objetIdx, p.id, {
                                                  metier: v === "_none" ? null : (v as FabMetier),
                                                })
                                              }
                                            >
                                              <SelectTrigger className="h-7 w-32 text-xs">
                                                <SelectValue placeholder="Métier" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="_none">— Non assigné —</SelectItem>
                                                {METIER_OPTIONS.map((m) => (
                                                  <SelectItem key={m.key} value={m.key}>
                                                    {m.label}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          )}
                                          <span className="w-16 text-right text-xs tabular-nums">
                                            {isMat
                                              ? `${(p.totalHt ?? 0).toLocaleString("fr-FR")} €`
                                              : `${round2(p.heuresUnitaires * o.quantite)} h`}
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Bouton Ajouter objet manuel */}
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={addManualObjet}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Ajouter un objet manuel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
