import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Filter, Trophy } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChargesAffaires } from "@/hooks/use-charges-affaires";
import {
  STATUT_ORDER,
  type OpportuniteStatut,
} from "@/lib/opportunites";
import { KanbanColonne } from "@/components/opportunites/KanbanColonne";
import {
  OpportuniteCard,
  type OpportuniteCardData,
} from "@/components/opportunites/OpportuniteCard";
import { NouvelleOpportuniteDialog } from "@/components/opportunites/NouvelleOpportuniteDialog";
import { SignerOpportuniteDialog } from "@/components/opportunites/SignerOpportuniteDialog";

export const Route = createFileRoute("/_app/opportunites")({
  head: () => ({
    meta: [
      { title: "Opportunités — Pipeline commercial" },
      {
        name: "description",
        content:
          "Pipeline Kanban des opportunités commerciales (9XXX) — à faire, envoyées, gagnées, perdues, terminées.",
      },
    ],
  }),
  component: OpportunitesPage,
});

function OpportunitesPage() {
  const { user, isAdmin, isAdminOrChef } = useAuth();
  const { data: charges, loading: chargesLoading } = useChargesAffaires();
  const [opps, setOpps] = useState<OpportuniteCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [signTarget, setSignTarget] = useState<OpportuniteCardData | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

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
        "id, numero, client, nom, charge_affaires_id, taille, date_opportunite, notes, statut_opportunite",
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
        setOpps((data ?? []) as OpportuniteCardData[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  // Filtrage CA
  const oppsFiltrees = useMemo(() => {
    if (!filterCa || filterCa === "__all__") return opps;
    return opps.filter((o) => o.charge_affaires_id === filterCa);
  }, [opps, filterCa]);

  // Groupage par statut
  const byStatut = useMemo(() => {
    const m = new Map<OpportuniteStatut, OpportuniteCardData[]>();
    STATUT_ORDER.forEach((s) => m.set(s, []));
    oppsFiltrees.forEach((o) => {
      m.get(o.statut_opportunite)?.push(o);
    });
    return m;
  }, [oppsFiltrees]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // v0.18.1 — Accessibilité : navigation clavier dans le Kanban.
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
    // overId est soit "col::<statut>" (drop sur colonne vide), soit l'id d'une carte
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

    // Optimistic update
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

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <PageHeader
        number="03"
        eyebrow="Chantiers / Pipeline commercial"
        title="Opportunités"
        description={`${opps.length} opportunité${opps.length > 1 ? "s" : ""} 9XXX en pipeline. Glissez les cartes entre colonnes pour changer leur statut.`}
        actions={
          isAdminOrChef && (
            <Button
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-2 h-4 w-4" /> Nouvelle opportunité
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Chargé d'affaires
          </span>
          <Select
            value={filterCa}
            onValueChange={setFilterCa}
            disabled={chargesLoading}
          >
            <SelectTrigger className="h-9 w-[220px] rounded-xl">
              <SelectValue placeholder="Sélectionner…" />
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
        </div>

        <Link
          to="/affaires"
          className="text-xs font-semibold text-muted-foreground hover:text-primary hover:underline"
        >
          Voir les affaires signées (5XXX) →
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {STATUT_ORDER.map((s) => (
              <KanbanColonne
                key={s}
                statut={s}
                items={byStatut.get(s) ?? []}
                chargesById={chargesById}
                onSign={handleSign}
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
          onSigned={() => setRefreshTick((t) => t + 1)}
        />
      )}
    </div>
  );
}
