import { createFileRoute, Link, useNavigate, stripSearchParams } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Filter, Trophy, LayoutGrid, Table as TableIcon, X } from "lucide-react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useChargesAffaires } from "@/hooks/use-charges-affaires";
import {
  KANBAN_STATUT_ORDER,
  STATUT_LABEL,
  STATUT_ORDER,
  TAILLE_LABEL,
  TAILLE_ORDER,
  type OpportuniteStatut,
  type OpportuniteTaille,
} from "@/lib/opportunites";
import { KanbanColonne } from "@/components/opportunites/KanbanColonne";
import {
  OpportuniteCard,
  type OpportuniteCardData,
} from "@/components/opportunites/OpportuniteCard";
import { NouvelleOpportuniteDialog } from "@/components/opportunites/NouvelleOpportuniteDialog";
import { SignerOpportuniteDialog } from "@/components/opportunites/SignerOpportuniteDialog";
import { TypologieMultiFilter } from "@/components/typologie/TypologieMultiFilter";
import {
  type AffaireTypologie,
  AFFAIRE_TYPOLOGIES,
  getAffaireTypologie,
} from "@/lib/affaire-typologie";
import { OpportunitesTableurView } from "@/components/opportunites/OpportunitesTableurView";
import {
  dateRangeForPreset,
  type DatePreset,
  type TableurFilters,
  type TableurRow,
} from "@/lib/opportunites-tableur-helpers";
import {
  checkCanDeleteOpportunite,
  deleteBlockedMessage,
} from "@/lib/opportunite-delete";
import { useDeleteOpportunite } from "@/hooks/use-delete-opportunite";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const VUE_VALUES = ["kanban", "tableur"] as const;
type VueOpportunites = (typeof VUE_VALUES)[number];

type StoredPreset = "all" | "7d" | "30d" | "current_month";

const OPPS_SEARCH_DEFAULTS = {
  typo: [] as AffaireTypologie[],
  vue: "kanban" as VueOpportunites,
  q: "",
  preset: "all" as StoredPreset,
  archived: false,
};

const oppsSearchSchema = z.object({
  typo: fallback(
    z.array(z.enum(AFFAIRE_TYPOLOGIES as [AffaireTypologie, ...AffaireTypologie[]])),
    [],
  ).default([]),
  vue: fallback(z.enum(VUE_VALUES), "kanban").default("kanban"),
  q: fallback(z.string(), "").default(""),
  preset: fallback(
    z.enum(["all", "7d", "30d", "current_month"] as const),
    "all",
  ).default("all"),
  archived: fallback(z.boolean(), false).default(false),
});

type OppsSearch = z.infer<typeof oppsSearchSchema>;

export const Route = createFileRoute("/_app/opportunites")({
  head: () => ({
    meta: [
      { title: "Opportunités — Pipeline commercial" },
      {
        name: "description",
        content:
          "Pipeline Kanban + vue tableur des opportunités commerciales (9XXX) — saisie inline ligne par ligne.",
      },
    ],
  }),
  validateSearch: zodValidator(oppsSearchSchema),
  search: { middlewares: [stripSearchParams(OPPS_SEARCH_DEFAULTS)] },
  component: OpportunitesPage,
});

interface OppRowFull extends OpportuniteCardData {
  date_pat: string | null;
  date_montage: string | null;
  date_demontage: string | null;
  typologie_future: AffaireTypologie | null;
}

function OpportunitesPage() {
  const { user, isAdmin, isAdminOrChef } = useAuth();
  const navigate = useNavigate({ from: "/opportunites" });
  const search = Route.useSearch();
  const { typo: typoFilter, vue, q: searchQuery, preset } = search;

  const setTypoFilter = (next: AffaireTypologie[]) => {
    navigate({ search: (prev: OppsSearch) => ({ ...prev, typo: next }), replace: true });
  };
  const setVue = (next: VueOpportunites) => {
    navigate({ search: (prev: OppsSearch) => ({ ...prev, vue: next }), replace: true });
  };
  const setSearchQuery = (next: string) => {
    navigate({ search: (prev: OppsSearch) => ({ ...prev, q: next }), replace: true });
  };
  const setPreset = (next: StoredPreset) => {
    navigate({
      search: (prev: OppsSearch) => ({ ...prev, preset: next }),
      replace: true,
    });
  };

  const { data: charges, loading: chargesLoading } = useChargesAffaires();
  const [opps, setOpps] = useState<OppRowFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [signTarget, setSignTarget] = useState<OpportuniteCardData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OpportuniteCardData | null>(null);
  const { remove: removeOpportunite, pending: deletePending } = useDeleteOpportunite();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Filtres tableur additionnels (statut/taille/deviseur multi-select)
  const [statutsFilter, setStatutsFilter] = useState<OpportuniteStatut[]>([]);
  const [taillesFilter, setTaillesFilter] = useState<OpportuniteTaille[]>([]);

  // Filtre CA — admin par défaut "Tous", chef par défaut "moi"
  const [filterCa, setFilterCa] = useState<string>("");
  useEffect(() => {
    if (filterCa) return;
    if (isAdmin) {
      setFilterCa("__all__");
    } else if (user?.id) {
      setFilterCa(user.id);
    }
  }, [isAdmin, user?.id, filterCa]);

  const chargesById = useMemo(() => {
    const m = new Map();
    charges.forEach((c) => m.set(c.id, c));
    return m;
  }, [charges]);

  // Charge les opportunités (phase='opportunite')
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("affaires")
      .select(
        "id, numero, client, nom, charge_affaires_id, taille, date_opportunite, notes, statut_opportunite, date_pat, date_montage, date_demontage, typologie_future",
      )
      .eq("phase", "opportunite")
      .order("date_opportunite", { ascending: false, nullsFirst: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error("Chargement impossible", { description: error.message });
          setLoading(false);
          return;
        }
        setOpps((data ?? []) as OppRowFull[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  // v0.29.2 — Filtrage CA + typologie FUTURE (la typologie dérivée du numero
  // est inutile ici car toutes les opps sont 9XXX = prototype par construction).
  const typoSet = useMemo(() => new Set(typoFilter), [typoFilter]);
  const oppsFiltrees = useMemo(() => {
    return opps.filter((o) => {
      if (filterCa && filterCa !== "__all__" && o.charge_affaires_id !== filterCa)
        return false;
      if (typoSet.size > 0) {
        if (!o.typologie_future || !typoSet.has(o.typologie_future)) return false;
      }
      return true;
    });
  }, [opps, filterCa, typoSet]);

  const typoCounts = useMemo(() => {
    const counts: Partial<Record<AffaireTypologie, number>> = {};
    opps.forEach((o) => {
      if (o.typologie_future) {
        counts[o.typologie_future] = (counts[o.typologie_future] ?? 0) + 1;
      }
    });
    return counts;
  }, [opps]);

  // Groupage par statut (Kanban) — exclut "Archivé" pour rester lisible
  const byStatut = useMemo(() => {
    const m = new Map<OpportuniteStatut, OpportuniteCardData[]>();
    KANBAN_STATUT_ORDER.forEach((s) => m.set(s, []));
    oppsFiltrees.forEach((o) => {
      if (o.statut_opportunite === "termine") return;
      m.get(o.statut_opportunite)?.push(o);
    });
    return m;
  }, [oppsFiltrees]);

  // Conversion en TableurRow pour la vue Tableur
  const tableurRows: TableurRow[] = useMemo(
    () =>
      oppsFiltrees.map((o) => ({
        id: o.id,
        affaireId: o.id,
        numero: o.numero,
        client: o.client ?? "",
        nom: o.nom ?? "",
        charge_affaires_id: o.charge_affaires_id,
        date_opportunite: o.date_opportunite,
        taille: o.taille,
        statut_opportunite: o.statut_opportunite,
        code_opportunite: null,
        signed_affaire_numero: null,
        signed_affaire_id: null,
        date_pat: o.date_pat,
        date_montage: o.date_montage,
        date_demontage: o.date_demontage,
        notes: o.notes,
        typologie_future: o.typologie_future,
      })),
    [oppsFiltrees],
  );

  const tableurFilters: TableurFilters = useMemo(() => {
    const range = dateRangeForPreset(preset as DatePreset);
    return {
      statuts: statutsFilter,
      tailles: taillesFilter,
      deviseurs: [],
      dateFrom: range.from,
      dateTo: range.to,
      search: searchQuery,
    };
  }, [statutsFilter, taillesFilter, preset, searchQuery]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    let targetStatut: OpportuniteStatut | null = null;
    if (overId.startsWith("col::")) {
      targetStatut = overId.slice(5) as OpportuniteStatut;
    } else {
      const targetOpp = opps.find((o) => o.id === overId);
      if (targetOpp) targetStatut = targetOpp.statut_opportunite;
    }
    if (!targetStatut) return;

    const moved = opps.find((o) => o.id === String(active.id));
    if (!moved || moved.statut_opportunite === targetStatut) return;

    const previous = opps;
    setOpps((prev) =>
      prev.map((o) =>
        o.id === moved.id ? { ...o, statut_opportunite: targetStatut! } : o,
      ),
    );

    const { error } = await supabase
      .from("affaires")
      .update({ statut_opportunite: targetStatut })
      .eq("id", moved.id);
    if (error) {
      toast.error("Mise à jour impossible", { description: error.message });
      setOpps(previous);
      return;
    }
    toast.success(`${moved.numero} → ${targetStatut.replace("_", " ")}`);
  }

  const activeOpp = activeId ? opps.find((o) => o.id === activeId) ?? null : null;

  function handleSign(opp: OpportuniteCardData) {
    setSignTarget(opp);
  }

  function handleDeleteRequest(opp: OpportuniteCardData) {
    const check = checkCanDeleteOpportunite({
      statut_opportunite: opp.statut_opportunite,
      phase: "opportunite",
    });
    if (!check.ok) {
      const msg = deleteBlockedMessage(check.reason);
      toast.error(msg.title, { description: msg.description });
      return;
    }
    setDeleteTarget(opp);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const result = await removeOpportunite(deleteTarget.id);
    if (result.ok) {
      toast.success(`Opportunité ${deleteTarget.numero} supprimée`);
      setRefreshTick((t) => t + 1);
      setDeleteTarget(null);
    } else {
      toast.error("Suppression impossible", { description: result.error });
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <PageHeader
        number="03"
        eyebrow="Chantiers / Pipeline commercial"
        title="Opportunités"
        description={`${opps.length} opportunité${opps.length > 1 ? "s" : ""} 9XXX en pipeline. ${vue === "kanban" ? "Glissez les cartes entre colonnes pour changer leur statut." : "Saisie ligne par ligne (auto-save)."}`}
        actions={
          isAdminOrChef && vue === "kanban" && (
            <Button
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-2 h-4 w-4" /> Nouvelle opportunité
            </Button>
          )
        }
      />

      {/* Toggle Vue Kanban / Tableur */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          value={vue}
          onValueChange={(v) => v && setVue(v as VueOpportunites)}
          className="rounded-xl border border-border bg-card p-1"
        >
          <ToggleGroupItem value="kanban" aria-label="Vue Kanban" className="h-8 gap-1.5 px-3">
            <LayoutGrid className="h-3.5 w-3.5" /> Kanban
          </ToggleGroupItem>
          <ToggleGroupItem value="tableur" aria-label="Vue Tableur" className="h-8 gap-1.5 px-3">
            <TableIcon className="h-3.5 w-3.5" /> Tableur
          </ToggleGroupItem>
        </ToggleGroup>

        <Link
          to="/affaires"
          className="text-xs font-semibold text-muted-foreground hover:text-primary hover:underline"
        >
          Voir les affaires signées (5XXX) →
        </Link>
      </div>

      {/* Filtres communs */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={filterCa} onValueChange={setFilterCa} disabled={chargesLoading}>
          <SelectTrigger className="h-9 w-[200px] rounded-xl">
            <SelectValue placeholder="Chargé d'affaires…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tous les CA</SelectItem>
            {user?.id && charges.some((c) => c.id === user.id) && (
              <SelectItem value={user.id}>Moi</SelectItem>
            )}
            {charges.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.full_name || c.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {vue === "tableur" && (
          <>
            <Select
              value={statutsFilter[0] ?? "__all__"}
              onValueChange={(v) =>
                setStatutsFilter(v === "__all__" ? [] : [v as OpportuniteStatut])
              }
            >
              <SelectTrigger className="h-9 w-[150px] rounded-xl">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous statuts</SelectItem>
                {STATUT_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUT_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={taillesFilter[0] ?? "__all__"}
              onValueChange={(v) =>
                setTaillesFilter(v === "__all__" ? [] : [v as OpportuniteTaille])
              }
            >
              <SelectTrigger className="h-9 w-[150px] rounded-xl">
                <SelectValue placeholder="Taille" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toutes tailles</SelectItem>
                {TAILLE_ORDER.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TAILLE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={preset} onValueChange={(v) => setPreset(v as StoredPreset)}>
              <SelectTrigger className="h-9 w-[160px] rounded-xl">
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toute période</SelectItem>
                <SelectItem value="7d">7 derniers jours</SelectItem>
                <SelectItem value="30d">30 derniers jours</SelectItem>
                <SelectItem value="current_month">Mois en cours</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher client/chantier…"
                className="h-9 w-[240px] rounded-xl pr-8"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Effacer recherche"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Typologie future (cible à la signature)
        </div>
        <TypologieMultiFilter
          value={typoFilter}
          onChange={setTypoFilter}
          counts={typoCounts}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : vue === "tableur" ? (
        <OpportunitesTableurView
          rows={tableurRows}
          charges={charges}
          filters={tableurFilters}
          canEdit={isAdminOrChef}
          isAdminOrChef={isAdminOrChef}
          isAdmin={isAdmin}
          currentUserId={user?.id ?? null}
          defaultChargeId={user?.id ?? null}
          onRowsMutated={() => setRefreshTick((t) => t + 1)}
        />
      ) : opps.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/20 p-16 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">
            Aucune opportunité en pipeline
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            Créez votre première opportunité 9XXX ou importez le CRM Excel pour
            initialiser le pipeline.
          </p>
          {isAdminOrChef && (
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Créer une opportunité
            </Button>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {KANBAN_STATUT_ORDER.map((s) => (
              <KanbanColonne
                key={s}
                statut={s}
                items={byStatut.get(s) ?? []}
                chargesById={chargesById}
                onSign={handleSign}
                onDelete={isAdminOrChef ? handleDeleteRequest : undefined}
                draggable={isAdminOrChef}
              />
            ))}
          </div>
          <DragOverlay>
            {activeOpp && (
              <div className="rotate-2 cursor-grabbing">
                <OpportuniteCard
                  opp={activeOpp}
                  chargesById={chargesById}
                  draggable={false}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <NouvelleOpportuniteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultChargeId={user?.id ?? null}
        charges={charges}
        onCreated={() => setRefreshTick((t) => t + 1)}
      />

      {signTarget && (
        <SignerOpportuniteDialog
          open={!!signTarget}
          onOpenChange={(o) => !o && setSignTarget(null)}
          affaireId={signTarget.id}
          oldCode={signTarget.numero}
          clientLabel={signTarget.client}
          typologieFuture={signTarget.typologie_future ?? null}
          onSigned={() => setRefreshTick((t) => t + 1)}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer l&apos;opportunité {deleteTarget?.numero}&nbsp;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.client ?? "(sans client)"}
              {deleteTarget?.nom && deleteTarget.nom !== deleteTarget.client
                ? ` — ${deleteTarget.nom}`
                : ""}
              . Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteConfirm();
              }}
              disabled={deletePending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePending ? "Suppression…" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
