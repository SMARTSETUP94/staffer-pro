// v0.35.x — Mode rapide : section "Équipe affaire" — pré-remplir personnes par métier
// pour toutes les steps du plan en une action.
import { useEffect, useState, useCallback, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Check, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  assignTeamToMetier,
  getEquipeAffaireData,
} from "@/server/staffing-equipe.functions";
import { METIER_KEY_BY_ID } from "@/lib/staffing/types";
import { METIER_COLOR, METIER_LABEL } from "./gantt-helpers";
import { TeamPresetsBar } from "./TeamPresetsBar";

interface Candidate {
  id: string;
  nom: string;
  prenom: string;
  type_contrat: string;
  tier: 1 | 2 | 3;
}

interface MetierEntry {
  metier_id: number;
  steps_count: number;
  total_pers_jours: number;
}

interface Props {
  planId: string;
  /** Trigger pour rafraîchir la section détaillée après assign batch */
  onAssigned?: () => void;
}

const TIER_LABEL: Record<1 | 2 | 3, string> = {
  1: "Principal",
  2: "Polyvalent",
  3: "Intérim",
};

export function EquipeAffaireSection({ planId, onAssigned }: Props) {
  const fetchData = useServerFn(getEquipeAffaireData);
  const assign = useServerFn(assignTeamToMetier);
  const [metiers, setMetiers] = useState<MetierEntry[]>([]);
  const [candidatsByMetier, setCandidatsByMetier] = useState<Record<number, Candidate[]>>({});
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyMetier, setBusyMetier] = useState<number | null>(null);
  // v0.35.x audit UX #5 — confirmation pré-affectation
  const [confirmMetier, setConfirmMetier] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchData({ data: { planId } });
      setMetiers(r.metiers);
      setCandidatsByMetier(r.candidats_by_metier);
    } finally {
      setLoading(false);
    }
  }, [fetchData, planId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAssign = useCallback(
    async (metier_id: number) => {
      const ids = selected[metier_id] ?? [];
      if (ids.length === 0) {
        toast.error("Sélectionnez au moins une personne");
        return;
      }
      setBusyMetier(metier_id);
      try {
        const r = await assign({
          data: { planId, metier_id, employe_ids: ids, presence_pct: 100 },
        });
        const labels: string[] = [];
        if (r.inserted > 0) labels.push(`${r.inserted} affectations créées`);
        if (r.skipped_existing > 0) labels.push(`${r.skipped_existing} déjà présentes`);
        if (r.skipped_conflict > 0) labels.push(`${r.skipped_conflict} skip conflit cumul`);
        toast.success(`${METIER_LABEL[METIER_KEY_BY_ID[metier_id] ?? "Manut"]} pré-rempli`, {
          description: labels.join(" · "),
        });
        onAssigned?.();
      } catch (e) {
        toast.error("Erreur d'affectation", {
          description: e instanceof Error ? e.message : "Inconnue",
        });
      } finally {
        setBusyMetier(null);
        setConfirmMetier(null);
      }
    },
    [assign, planId, selected, onAssigned],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 rounded-2xl border border-border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (metiers.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm italic text-muted-foreground">
        Aucun métier planifié dans ce plan.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Équipe affaire — Mode rapide
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Affecte une équipe par métier sur toutes les étapes du plan en une action.
            Les conflits cumul &gt; 100% sont automatiquement skippés.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          <Users className="mr-1 h-3 w-3" /> {metiers.length} métiers
        </Badge>
      </div>

      {/* v0.35.10 #7 — Templates équipe (sauvegarde / chargement) */}
      <TeamPresetsBar
        currentSelection={selected}
        onLoad={(sel) => setSelected(sel)}
        availableEmployeIds={
          new Set(
            Object.values(candidatsByMetier)
              .flatMap((cands) => cands.map((c) => c.id)),
          )
        }
      />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {metiers.map((m) => {
          const k = METIER_KEY_BY_ID[m.metier_id] ?? "Manut";
          const cands = candidatsByMetier[m.metier_id] ?? [];
          const sel = selected[m.metier_id] ?? [];
          return (
            <div
              key={m.metier_id}
              className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: METIER_COLOR[k] }}
                />
                <span className="text-sm font-bold">{METIER_LABEL[k]}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">
                  {m.steps_count} étapes · {m.total_pers_jours} pers·j
                </Badge>
              </div>

              <PersonneMultiSelect
                candidates={cands}
                value={sel}
                onChange={(v) => setSelected((prev) => ({ ...prev, [m.metier_id]: v }))}
              />

              <Button
                size="sm"
                className="w-full"
                disabled={sel.length === 0 || busyMetier === m.metier_id}
                onClick={() => setConfirmMetier(m.metier_id)}
              >
                {busyMetier === m.metier_id ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Check className="mr-1 h-3 w-3" />
                )}
                Affecter ces {sel.length || "—"} personne{sel.length > 1 ? "s" : ""} à toutes les étapes
              </Button>
            </div>
          );
        })}
      </div>

      {/* v0.35.x audit UX #5 — confirmation pré-affectation avec récap */}
      <AlertDialog
        open={confirmMetier !== null}
        onOpenChange={(o) => !o && setConfirmMetier(null)}
      >
        <AlertDialogContent>
          {confirmMetier !== null && (() => {
            const m = metiers.find((x) => x.metier_id === confirmMetier);
            const ids = selected[confirmMetier] ?? [];
            const cands = candidatsByMetier[confirmMetier] ?? [];
            const persons = cands.filter((c) => ids.includes(c.id));
            const metierLabel =
              METIER_LABEL[METIER_KEY_BY_ID[confirmMetier] ?? "Manut"];
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmer l'affectation rapide</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm">
                      <p>
                        Vous allez affecter{" "}
                        <strong>
                          {persons.length} personne{persons.length > 1 ? "s" : ""}
                        </strong>{" "}
                        sur le métier <strong>{metierLabel}</strong> à 100% de présence,
                        couvrant <strong>{m?.steps_count ?? 0} étape{(m?.steps_count ?? 0) > 1 ? "s" : ""}</strong>{" "}
                        soit <strong>{m?.total_pers_jours ?? 0} pers·j</strong> de
                        couverture potentielle.
                      </p>
                      <ul className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs space-y-0.5">
                        {persons.map((p) => (
                          <li key={p.id} className="flex items-center justify-between">
                            <span>
                              {p.prenom} {p.nom}
                            </span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0">
                              T{p.tier} · {p.type_contrat}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-muted-foreground">
                        Les jours déjà saturés (cumul &gt; 100% sur d'autres affaires)
                        seront automatiquement skippés. Vous pourrez ajuster la présence
                        au cas par cas dans la section détaillée.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void handleAssign(confirmMetier)}
                    disabled={busyMetier === confirmMetier}
                  >
                    Confirmer l'affectation
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PersonneMultiSelect({
  candidates,
  value,
  onChange,
}: {
  candidates: Candidate[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedDetails = candidates.filter((c) => selectedSet.has(c.id));

  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  };

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-xs font-normal"
          >
            <Users className="mr-1.5 h-3 w-3" />
            {selectedDetails.length === 0
              ? "Choisir les personnes principales…"
              : `${selectedDetails.length} sélectionné${selectedDetails.length > 1 ? "s" : ""}`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder="Rechercher…" className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty>Aucune personne.</CommandEmpty>
              <CommandGroup>
                {candidates.map((c) => {
                  const checked = selectedSet.has(c.id);
                  return (
                    <CommandItem
                      key={c.id}
                      onSelect={() => toggle(c.id)}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                          checked
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-input"
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex-1 truncate">
                        {c.prenom} {c.nom}
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                        T{c.tier} · {c.type_contrat}
                      </Badge>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedDetails.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedDetails.map((c) => (
            <Badge
              key={c.id}
              variant="secondary"
              className="text-[10px] flex items-center gap-1 pr-1"
            >
              {c.prenom[0]}. {c.nom}
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                aria-label="Retirer"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/** Toggle Mode rapide / Mode détaillé — persisté dans localStorage */
const TOGGLE_KEY = "staffing.equipeMode";
export type StaffingViewMode = "rapide" | "detaille";

export function useStaffingViewMode(): [StaffingViewMode, (m: StaffingViewMode) => void] {
  const [mode, setMode] = useState<StaffingViewMode>(() => {
    if (typeof window === "undefined") return "rapide";
    const v = window.localStorage.getItem(TOGGLE_KEY);
    return v === "detaille" ? "detaille" : "rapide";
  });
  const update = useCallback((m: StaffingViewMode) => {
    setMode(m);
    if (typeof window !== "undefined") window.localStorage.setItem(TOGGLE_KEY, m);
  }, []);
  return [mode, update];
}
