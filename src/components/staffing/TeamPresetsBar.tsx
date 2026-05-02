// v0.35.10 #7 — Templates d'équipe : sauvegarde/restaure une composition
// (sélection par métier) en localStorage. Plan-agnostic : un même template
// peut être réutilisé sur n'importe quel plan.
import { useEffect, useState, useCallback, useMemo } from "react";
import { Bookmark, BookmarkPlus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const STORAGE_KEY = "staffing.team-presets.v1";
const MAX_PRESETS = 20;

export interface TeamPreset {
  id: string;
  name: string;
  /** Map metier_id (number) → liste employe_id */
  selection: Record<number, string[]>;
  created_at: string;
  /** Métadonnées descriptives (pour aide visuelle) */
  member_count: number;
}

function loadPresets(): TeamPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TeamPreset[];
  } catch {
    return [];
  }
}

function savePresets(presets: TeamPreset[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.slice(0, MAX_PRESETS)));
  } catch {
    /* quota dépassé : silencieux */
  }
}

interface Props {
  /** Sélection courante (par metier_id → employes ids) */
  currentSelection: Record<number, string[]>;
  /** Appelé au chargement d'un preset (remplace toute la sélection) */
  onLoad: (selection: Record<number, string[]>) => void;
  /** Liste des employés disponibles (pour intersection avec preset, filtrer fantômes) */
  availableEmployeIds: Set<string>;
}

export function TeamPresetsBar({ currentSelection, onLoad, availableEmployeIds }: Props) {
  const [presets, setPresets] = useState<TeamPreset[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<TeamPreset | null>(null);
  const [confirmLoad, setConfirmLoad] = useState<TeamPreset | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPresets(loadPresets());
    setLoading(false);
  }, []);

  const currentMemberCount = useMemo(
    () =>
      new Set(
        Object.values(currentSelection).flatMap((ids) => ids),
      ).size,
    [currentSelection],
  );

  const handleSave = useCallback(() => {
    const name = saveName.trim();
    if (!name) {
      toast.error("Donnez un nom au template (ex : Équipe bois standard).");
      return;
    }
    if (currentMemberCount === 0) {
      toast.error("Sélectionnez au moins une personne avant de sauvegarder.");
      return;
    }
    const next: TeamPreset = {
      id: crypto.randomUUID(),
      name,
      selection: { ...currentSelection },
      created_at: new Date().toISOString(),
      member_count: currentMemberCount,
    };
    const updated = [next, ...presets].slice(0, MAX_PRESETS);
    setPresets(updated);
    savePresets(updated);
    setSaveOpen(false);
    setSaveName("");
    toast.success(`Template "${name}" enregistré`);
  }, [saveName, currentSelection, currentMemberCount, presets]);

  const handleLoad = useCallback(
    (p: TeamPreset) => {
      // Filtre les employés qui n'existent plus (changements RH)
      const filtered: Record<number, string[]> = {};
      let dropped = 0;
      for (const [metierId, ids] of Object.entries(p.selection)) {
        const valid = ids.filter((id) => availableEmployeIds.has(id));
        dropped += ids.length - valid.length;
        if (valid.length > 0) filtered[Number(metierId)] = valid;
      }
      onLoad(filtered);
      if (dropped > 0) {
        toast.warning(
          `Template "${p.name}" chargé — ${dropped} personne${dropped > 1 ? "s" : ""} introuvable${dropped > 1 ? "s" : ""} ignorée${dropped > 1 ? "s" : ""}.`,
        );
      } else {
        toast.success(`Template "${p.name}" chargé`);
      }
      setConfirmLoad(null);
    },
    [availableEmployeIds, onLoad],
  );

  const handleDelete = useCallback(
    (p: TeamPreset) => {
      const updated = presets.filter((x) => x.id !== p.id);
      setPresets(updated);
      savePresets(updated);
      setConfirmDelete(null);
      toast.info(`Template "${p.name}" supprimé`);
    },
    [presets],
  );

  if (loading) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2">
        <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Templates équipe
        </span>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={presets.length === 0}
            >
              <Bookmark className="mr-1 h-3 w-3" />
              Charger ({presets.length})
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="border-b border-border bg-muted/30 px-3 py-2">
              <p className="text-xs font-semibold">Templates enregistrés</p>
              <p className="text-[10px] text-muted-foreground">
                Stockés sur ce navigateur uniquement
              </p>
            </div>
            {presets.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                Aucun template
              </div>
            ) : (
              <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                {presets.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30"
                  >
                    <button
                      type="button"
                      className="flex-1 text-left"
                      onClick={() => setConfirmLoad(p)}
                    >
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {p.member_count} pers · {Object.keys(p.selection).length} métier
                        {Object.keys(p.selection).length > 1 ? "s" : ""} ·{" "}
                        {new Date(p.created_at).toLocaleDateString("fr-FR")}
                      </div>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(p);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setSaveOpen(true)}
          disabled={currentMemberCount === 0}
          title={
            currentMemberCount === 0
              ? "Sélectionnez d'abord une équipe"
              : "Sauvegarder la sélection actuelle"
          }
        >
          <BookmarkPlus className="mr-1 h-3 w-3" />
          Sauver équipe actuelle
        </Button>

        {currentMemberCount > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {currentMemberCount} pers sélectionnée{currentMemberCount > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Save dialog */}
      <AlertDialog open={saveOpen} onOpenChange={setSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sauvegarder ce template d'équipe</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {currentMemberCount} personne{currentMemberCount > 1 ? "s" : ""} sur{" "}
                  {Object.keys(currentSelection).filter((k) => (currentSelection[Number(k)] ?? []).length > 0).length}{" "}
                  métier{Object.keys(currentSelection).length > 1 ? "s" : ""}.
                </p>
                <Input
                  autoFocus
                  placeholder="Ex: Équipe bois standard, Équipe peinture rapide..."
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSave();
                    }
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Stocké sur ce navigateur (max {MAX_PRESETS} templates).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave}>
              <Loader2 className="mr-2 h-4 w-4 hidden" />
              Sauvegarder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm load (écrase la sélection en cours) */}
      <AlertDialog open={confirmLoad !== null} onOpenChange={(o) => !o && setConfirmLoad(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Charger le template "{confirmLoad?.name}" ?</AlertDialogTitle>
            <AlertDialogDescription>
              {currentMemberCount > 0 ? (
                <>
                  Cela <strong>remplacera</strong> votre sélection actuelle ({currentMemberCount} pers).
                  Les affectations déjà enregistrées en base ne sont pas touchées : seul le panier de
                  sélection rapide est mis à jour.
                </>
              ) : (
                <>Le template sera chargé dans le panier de sélection rapide.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmLoad && handleLoad(confirmLoad)}>
              Charger
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm delete */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer "{confirmDelete?.name}" ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
