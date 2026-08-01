import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ChevronDown, ChevronRight, Layers, Loader2, Plus, Sparkles, Truck } from "lucide-react";
import { toast } from "sonner";

import { requireCapability } from "@/lib/capability-guard";
import { useCapability } from "@/hooks/use-capability";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import {
  ETAPE_STATUT_LABELS, METIER_CODE_TO_ETAPE, useGrilleFabrication,
} from "@/hooks/use-grille-fabrication";
import {
  buildCellIndex, cellKey, computePrefillLines, ecartVsDevis, formatHeures, groupObjetsByLot,
  metiersVisibles, objetOrigine, objetsACompleter, totalGeneral, totalHorsDevis, totalObjet,
  totauxParMetier, type GrilleCell, type GrilleObjet,
} from "@/lib/grille-fabrication";
import { GrilleCellInput } from "@/components/grille/GrilleCellInput";
import { GrilleNotePopover } from "@/components/grille/GrilleNotePopover";
import { AjouterLigneDialog, type NouvelleLigne } from "@/components/grille/AjouterLigneDialog";
import { GrouperLotDialog } from "@/components/grille/GrouperLotDialog";
import { PrefillDevisDialog } from "@/components/grille/PrefillDevisDialog";

const VUE_STORAGE_KEY = "grille-fabrication:vue";

const searchSchema = z.object({
  vue: z.enum(["transverse", "metier"]).optional(),
  metier: z.coerce.number().optional(),
});

type GrilleSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_app/affaires/$affaireId/grille")({
  beforeLoad: () => requireCapability("section.fabrication"),
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [{ title: "Grille de fabrication — Setup Paris" }] }),
  component: GrillePage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Affaire introuvable.</div>,
});

function GrillePage() {
  const { affaireId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const canEdit = useCapability("casting.edit_phase_fabrication");

  const { query, setCell, renameObjet, createObjet, createLot, setObjetLot, prefillFromDevis } =
    useGrilleFabrication(affaireId);

  const [showAllMetiers, setShowAllMetiers] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [collapsedLots, setCollapsedLots] = useState<string[]>([]);
  const [openAjout, setOpenAjout] = useState(false);
  const [openLot, setOpenLot] = useState(false);
  const [openPrefill, setOpenPrefill] = useState(false);

  // Vue persistée en URL + localStorage
  const vue = search.vue ?? "transverse";
  useEffect(() => {
    if (search.vue) {
      window.localStorage.setItem(VUE_STORAGE_KEY, search.vue);
      return;
    }
    const stored = window.localStorage.getItem(VUE_STORAGE_KEY);
    if (stored === "metier" || stored === "transverse") {
      void navigate({ to: ".", search: (p: GrilleSearch) => ({ ...p, vue: stored }), replace: true });
    }
  }, [search.vue, navigate]);

  const setVue = (next: "transverse" | "metier") => {
    window.localStorage.setItem(VUE_STORAGE_KEY, next);
    void navigate({ to: ".", search: (p: GrilleSearch) => ({ ...p, vue: next }) });
  };

  const data = query.data;
  const cells = useMemo<GrilleCell[]>(() => data?.cells ?? [], [data]);
  const objets = useMemo<GrilleObjet[]>(() => data?.objets ?? [], [data]);
  const metiers = data?.metiers ?? [];
  const lots = data?.lots ?? [];

  const colonnes = useMemo(
    () => metiersVisibles(metiers, cells, showAllMetiers),
    [metiers, cells, showAllMetiers],
  );
  const index = useMemo(() => buildCellIndex(cells), [cells]);
  const totaux = useMemo(() => totauxParMetier(cells), [cells]);
  const ecarts = useMemo(
    () => ecartVsDevis(totaux, data?.devisTotaux ?? {}),
    [totaux, data?.devisTotaux],
  );
  const aCompleter = useMemo(() => new Set(objetsACompleter(objets, cells)), [objets, cells]);
  const groupes = useMemo(() => groupObjetsByLot(objets, lots), [objets, lots]);
  const prefillLines = useMemo(
    () => computePrefillLines(objets, cells, data?.devisTotaux ?? {}),
    [objets, cells, data?.devisTotaux],
  );

  const metierActifId = search.metier ?? colonnes[0]?.id ?? metiers[0]?.id ?? null;
  const metierActif = metiers.find((m) => m.id === metierActifId) ?? null;

  const writeCell = (
    objetId: string,
    metierId: number,
    patch: { heures_prevues?: number; note?: string | null; sous_traitance?: boolean },
  ) => {
    const existing = index.get(cellKey(objetId, metierId)) ?? null;
    setCell.mutate(
      { objet_id: objetId, metier_id: metierId, existing, ...patch },
      { onError: () => toast.error("Modification impossible — valeur restaurée") },
    );
  };

  const handleAjout = async (line: NouvelleLigne) => {
    try {
      let objetId = line.objetId;
      if (!objetId) {
        objetId = await createObjet.mutateAsync({
          nom: line.nouvelObjetNom,
          reference: line.nouvelObjetNom.slice(0, 24),
        });
      }
      const existing = index.get(cellKey(objetId, line.metierId)) ?? null;
      await setCell.mutateAsync({
        objet_id: objetId,
        metier_id: line.metierId,
        existing,
        heures_prevues: line.heures,
        note: line.note,
        origine: line.origine,
        sous_traitance: line.sousTraitance,
      });
      setOpenAjout(false);
      toast.success("Ligne ajoutée");
    } catch {
      toast.error("Impossible d'ajouter la ligne");
    }
  };

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const totalGen = totalGeneral(cells);
  const horsDevis = totalHorsDevis(cells);

  return (
    <TooltipProvider>
      <div className="space-y-4 pb-16">
        {/* En-tête */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Grille de fabrication</h2>
            <p className="text-sm text-muted-foreground">
              {objets.length} objet{objets.length > 1 ? "s" : ""}
              {aCompleter.size > 0 && (
                <span className="text-amber-600 dark:text-amber-500"> · {aCompleter.size} à compléter</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border p-0.5">
              <Button
                size="sm"
                variant={vue === "transverse" ? "secondary" : "ghost"}
                onClick={() => setVue("transverse")}
              >
                Transverse
              </Button>
              <Button
                size="sm"
                variant={vue === "metier" ? "secondary" : "ghost"}
                onClick={() => setVue("metier")}
              >
                Par métier
              </Button>
            </div>
            {canEdit && (
              <>
                <Button size="sm" variant="outline" onClick={() => setOpenPrefill(true)}>
                  <Sparkles className="mr-1.5 h-4 w-4" /> Pré-remplir depuis le devis
                </Button>
                <Button size="sm" onClick={() => setOpenAjout(true)}>
                  <Plus className="mr-1.5 h-4 w-4" /> Ligne
                </Button>
              </>
            )}
          </div>
        </div>

        {objets.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun objet sur ce chantier. Ajoutez une ligne ou pré-remplissez depuis le devis.
            </p>
            {canEdit && (
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" onClick={() => setOpenAjout(true)}>
                  <Plus className="mr-1.5 h-4 w-4" /> Ajouter une ligne
                </Button>
                <Button size="sm" variant="outline" onClick={() => setOpenPrefill(true)}>
                  <Sparkles className="mr-1.5 h-4 w-4" /> Pré-remplir depuis le devis
                </Button>
              </div>
            )}
          </div>
        ) : vue === "transverse" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowAllMetiers((v) => !v)}>
                {showAllMetiers ? "Masquer les métiers sans heures" : "Afficher tous les métiers"}
              </Button>
              {canEdit && selection.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setOpenLot(true)}>
                  <Layers className="mr-1.5 h-4 w-4" /> Grouper en lot ({selection.length})
                </Button>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="sticky left-0 z-20 min-w-[240px] bg-muted/40 p-2 text-left font-medium">
                      Objet
                    </th>
                    {colonnes.map((m) => (
                      <th key={m.id} className="min-w-[92px] p-2 text-right font-medium">
                        {m.libelle}
                      </th>
                    ))}
                    <th className="min-w-[80px] p-2 text-right font-medium">Total</th>
                    <th className="min-w-[90px] p-2 text-left font-medium">Origine</th>
                  </tr>
                </thead>
                <tbody>
                  {groupes.map((g) => {
                    const collapsed = g.lot ? collapsedLots.includes(g.lot.id) : false;
                    return (
                      <>
                        {g.lot && (
                          <tr key={`lot-${g.lot.id}`} className="border-b bg-accent/40">
                            <td
                              colSpan={colonnes.length + 3}
                              className="sticky left-0 p-1.5"
                            >
                              <button
                                type="button"
                                className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
                                onClick={() =>
                                  setCollapsedLots((prev) =>
                                    prev.includes(g.lot!.id)
                                      ? prev.filter((x) => x !== g.lot!.id)
                                      : [...prev, g.lot!.id],
                                  )
                                }
                              >
                                {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                {g.lot.nom}
                                <span className="text-muted-foreground">({g.objets.length})</span>
                              </button>
                            </td>
                          </tr>
                        )}
                        {!collapsed &&
                          g.objets.map((o) => {
                            const origine = objetOrigine(cells, o.id);
                            return (
                              <tr key={o.id} className="border-b hover:bg-muted/20">
                                <td className="sticky left-0 z-10 bg-background p-2">
                                  <div className="flex items-center gap-2">
                                    {canEdit && (
                                      <Checkbox
                                        checked={selection.includes(o.id)}
                                        onCheckedChange={(c) =>
                                          setSelection((prev) =>
                                            c === true ? [...prev, o.id] : prev.filter((x) => x !== o.id),
                                          )
                                        }
                                        aria-label={`Sélectionner ${o.nom}`}
                                      />
                                    )}
                                    <ObjetNomCell
                                      objet={o}
                                      disabled={!canEdit}
                                      onRename={(nom) => renameObjet.mutate({ id: o.id, nom })}
                                    />
                                    {aCompleter.has(o.id) && (
                                      <Badge
                                        variant="outline"
                                        className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-500"
                                      >
                                        À compléter
                                      </Badge>
                                    )}
                                    {g.lot && canEdit && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            className="text-[10px] text-muted-foreground hover:text-foreground"
                                            onClick={() => setObjetLot.mutate({ objetId: o.id, lotId: null })}
                                          >
                                            retirer du lot
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent>Détacher cet objet du lot</TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                </td>
                                {colonnes.map((m) => {
                                  const c = index.get(cellKey(o.id, m.id));
                                  return (
                                    <td key={m.id} className="p-1">
                                      <div className="flex items-center justify-end gap-0.5">
                                        {(c?.note || (canEdit && c)) && (
                                          <GrilleNotePopover
                                            note={c?.note ?? null}
                                            disabled={!canEdit}
                                            onSave={(note) => writeCell(o.id, m.id, { note })}
                                          />
                                        )}
                                        {c?.sous_traitance && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                                            </TooltipTrigger>
                                            <TooltipContent>Sous-traitance</TooltipContent>
                                          </Tooltip>
                                        )}
                                        <GrilleCellInput
                                          value={c?.heures_prevues ?? 0}
                                          disabled={!canEdit}
                                          onCommit={(v) => writeCell(o.id, m.id, { heures_prevues: v })}
                                        />
                                      </div>
                                    </td>
                                  );
                                })}
                                <td className="p-2 text-right font-medium tabular-nums">
                                  {formatHeures(totalObjet(cells, o.id))}
                                </td>
                                <td className="p-2">
                                  {origine === "ajout" ? (
                                    <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/10 dark:text-amber-500" variant="outline">
                                      Ajout
                                    </Badge>
                                  ) : origine === "devis" ? (
                                    <span className="text-xs text-muted-foreground">Devis</span>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                      </>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/40 font-medium">
                    <td className="sticky left-0 z-10 bg-muted/40 p-2">Total prévu</td>
                    {colonnes.map((m) => (
                      <td key={m.id} className="p-2 text-right tabular-nums">
                        {formatHeures(totaux[m.id] ?? 0)}
                      </td>
                    ))}
                    <td className="p-2 text-right tabular-nums">{formatHeures(totalGen)}</td>
                    <td />
                  </tr>
                  <tr className="bg-muted/20 text-xs">
                    <td className="sticky left-0 z-10 bg-muted/20 p-2 text-muted-foreground">
                      Écart vs devis
                    </td>
                    {colonnes.map((m) => {
                      const e = ecarts[m.id] ?? 0;
                      return (
                        <td
                          key={m.id}
                          className={
                            e > 0
                              ? "p-2 text-right tabular-nums font-semibold text-destructive"
                              : e < 0
                                ? "p-2 text-right tabular-nums text-muted-foreground"
                                : "p-2 text-right tabular-nums text-muted-foreground/40"
                          }
                        >
                          {e === 0 ? "·" : `${e > 0 ? "+" : "−"}${formatHeures(Math.abs(e))}`}
                        </td>
                      );
                    })}
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="text-sm text-muted-foreground">
              Total hors devis : <span className="font-medium text-foreground">{formatHeures(horsDevis)}</span>
              {" — chiffrable en supplément"}
            </p>
          </>
        ) : (
          <VueParMetier
            metierActifId={metierActifId}
            onChangeMetier={(id) =>
              void navigate({ to: ".", search: (p: GrilleSearch) => ({ ...p, metier: id }) })
            }
            colonnes={metiersVisibles(metiers, cells, true)}
            actifs={colonnes}
            objets={objets}
            lots={lots}
            cells={cells}
            index={index}
            etapesParObjet={data?.etapesParObjet ?? {}}
            metierCode={metierActif?.code ?? null}
            canEdit={canEdit}
            onWrite={writeCell}
          />
        )}

        <AjouterLigneDialog
          open={openAjout}
          onOpenChange={setOpenAjout}
          objets={objets}
          metiers={metiers}
          {...(metierActifId != null ? { defaultMetierId: metierActifId } : {})}
          saving={setCell.isPending || createObjet.isPending}
          onSubmit={(l) => void handleAjout(l)}
        />

        <GrouperLotDialog
          open={openLot}
          onOpenChange={setOpenLot}
          nbObjets={selection.length}
          saving={createLot.isPending}
          onSubmit={(nom) => {
            createLot.mutate(
              { nom, objetIds: selection },
              {
                onSuccess: () => {
                  setSelection([]);
                  setOpenLot(false);
                  toast.success("Lot créé");
                },
                onError: () => toast.error("Création du lot impossible"),
              },
            );
          }}
        />

        <PrefillDevisDialog
          open={openPrefill}
          onOpenChange={setOpenPrefill}
          lines={prefillLines}
          metiers={metiers}
          onConfirm={() =>
            prefillFromDevis.mutate(prefillLines, {
              onSuccess: () => toast.success(`${prefillLines.length} ligne(s) créée(s)`),
              onError: () => toast.error("Pré-remplissage impossible"),
            })
          }
        />
      </div>
    </TooltipProvider>
  );
}

/** Nom d'objet éditable en ligne. */
function ObjetNomCell({
  objet, disabled, onRename,
}: {
  objet: GrilleObjet;
  disabled: boolean;
  onRename: (nom: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(objet.nom);

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        className="h-7 w-48"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft.trim() && draft.trim() !== objet.nom) onRename(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(objet.nom);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setDraft(objet.nom);
        setEditing(true);
      }}
      className="truncate text-left font-medium hover:underline disabled:no-underline"
      title={objet.nom}
    >
      {objet.reference ? <span className="mr-1 text-muted-foreground">{objet.reference}</span> : null}
      {objet.nom}
    </button>
  );
}

/** VUE 2 — un métier, une ligne par objet concerné (« mon Excel à moi »). */
function VueParMetier({
  metierActifId, onChangeMetier, colonnes, actifs, objets, lots, cells, index,
  etapesParObjet, metierCode, canEdit, onWrite,
}: {
  metierActifId: number | null;
  onChangeMetier: (id: number) => void;
  colonnes: { id: number; libelle: string }[];
  actifs: { id: number; libelle: string }[];
  objets: GrilleObjet[];
  lots: { id: string; nom: string }[];
  cells: GrilleCell[];
  index: Map<string, GrilleCell>;
  etapesParObjet: Record<string, Record<string, string>>;
  metierCode: string | null;
  canEdit: boolean;
  onWrite: (
    objetId: string,
    metierId: number,
    patch: { heures_prevues?: number; note?: string | null; sous_traitance?: boolean },
  ) => void;
}) {
  if (metierActifId == null) return null;
  const etapeType = metierCode ? METIER_CODE_TO_ETAPE[metierCode] ?? null : null;
  const lignes = objets.filter((o) => index.has(cellKey(o.id, metierActifId)));
  const source = actifs.length > 0 && actifs.length <= 6 ? actifs : colonnes;

  return (
    <div className="space-y-3">
      {source.length <= 6 ? (
        <div className="flex flex-wrap gap-1 rounded-md border p-0.5">
          {source.map((m) => (
            <Button
              key={m.id}
              size="sm"
              variant={m.id === metierActifId ? "secondary" : "ghost"}
              onClick={() => onChangeMetier(m.id)}
            >
              {m.libelle}
            </Button>
          ))}
        </div>
      ) : (
        <Select value={String(metierActifId)} onValueChange={(v) => onChangeMetier(Number(v))}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {colonnes.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>{m.libelle}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="sticky left-0 z-20 min-w-[240px] bg-muted/40 p-2 text-left font-medium">Objet</th>
              <th className="p-2 text-left font-medium">Lot</th>
              <th className="p-2 text-right font-medium">Heures prévues</th>
              <th className="p-2 text-left font-medium">Note</th>
              <th className="p-2 text-left font-medium">Origine</th>
              <th className="p-2 text-left font-medium">Statut d'étape</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                  Aucun objet avec des heures sur ce métier.
                </td>
              </tr>
            )}
            {lignes.map((o) => {
              const c = index.get(cellKey(o.id, metierActifId))!;
              const statut = etapeType ? etapesParObjet[o.id]?.[etapeType] : undefined;
              return (
                <tr key={o.id} className="border-b hover:bg-muted/20">
                  <td className="sticky left-0 z-10 bg-background p-2 font-medium">
                    {o.reference ? <span className="mr-1 text-muted-foreground">{o.reference}</span> : null}
                    {o.nom}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {lots.find((l) => l.id === o.lot_id)?.nom ?? "—"}
                  </td>
                  <td className="p-1">
                    <GrilleCellInput
                      value={c.heures_prevues}
                      disabled={!canEdit}
                      onCommit={(v) => onWrite(o.id, metierActifId, { heures_prevues: v })}
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1.5">
                      <GrilleNotePopover
                        note={c.note}
                        disabled={!canEdit}
                        onSave={(note) => onWrite(o.id, metierActifId, { note })}
                      />
                      <span className="truncate text-xs text-muted-foreground">{c.note ?? ""}</span>
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      {c.origine === "ajout" ? (
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500">
                          Ajout
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Devis</span>
                      )}
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Checkbox
                          checked={c.sous_traitance}
                          disabled={!canEdit}
                          onCheckedChange={(v) =>
                            onWrite(o.id, metierActifId, { sous_traitance: v === true })
                          }
                          aria-label="Sous-traitance"
                        />
                        ST
                      </label>
                    </div>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {statut ? (ETAPE_STATUT_LABELS[statut] ?? statut) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/40 font-medium">
              <td className="sticky left-0 z-10 bg-muted/40 p-2">Total prévu</td>
              <td />
              <td className="p-2 text-right tabular-nums">
                {formatHeures(
                  cells
                    .filter((x) => x.metier_id === metierActifId)
                    .reduce((a, x) => a + x.heures_prevues, 0),
                )}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
