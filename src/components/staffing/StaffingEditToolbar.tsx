// v0.35.x — Toolbar batch edition staffing
// - Affiche compteur "N modifs non sauvegardées" + dernière sauvegarde
// - Boutons : Enregistrer (N) + Annuler les modifs
// - Autosave 2 min idle (auto-flush silencieux)
// - beforeunload + flush au unmount
// - Dialog conflit (recharger / forcer)
import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Save, RotateCcw, Check, Loader2, AlertTriangle, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useEditStore } from "@/lib/staffing/edit-store";
import { flushStepEdits } from "@/server/staffing-flush.functions";

const AUTOSAVE_IDLE_MS = 2 * 60 * 1000; // 2 min

export function StaffingEditToolbar({
  planId,
  onSaved,
}: {
  planId: string;
  /** Appelé après flush réussi pour recharger les données serveur */
  onSaved: () => void;
}) {
  const flush = useServerFn(flushStepEdits);
  const edits = useEditStore((s) => s.edits);
  const baseUpdatedAt = useEditStore((s) => s.baseUpdatedAt);
  const lastSavedAt = useEditStore((s) => s.lastSavedAt);
  const lastChangeAt = useEditStore((s) => s.lastChangeAt);
  const flushing = useEditStore((s) => s.flushing);
  const markFlushing = useEditStore((s) => s.markFlushing);
  const markSaved = useEditStore((s) => s.markSaved);
  const resetAll = useEditStore((s) => s.resetAll);
  const undo = useEditStore((s) => s.undo);
  const historyDepth = useEditStore((s) => s.history.length);

  const [confirmReset, setConfirmReset] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictUpdatedAt, setConflictUpdatedAt] = useState<string | null>(null);
  const [savedAgo, setSavedAgo] = useState<string>("");

  const dirtyCount = Object.keys(edits).filter((k) => {
    const v = edits[k];
    return (
      v.pers !== undefined || v.manual_shift !== undefined || v.manual_pers !== undefined
    );
  }).length;

  /** Flush, retourne true si succès */
  const doFlush = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      if (!baseUpdatedAt || dirtyCount === 0 || flushing) return true;
      const editsArr = Object.entries(edits)
        .map(([step_id, v]) => ({
          step_id,
          pers: v.pers,
          manual_pers: v.manual_pers,
          manual_shift: v.manual_shift,
        }))
        .filter(
          (e) =>
            e.pers !== undefined ||
            e.manual_pers !== undefined ||
            e.manual_shift !== undefined,
        );
      markFlushing(true);
      try {
        const res = (await flush({
          data: {
            plan_id: planId,
            base_updated_at: baseUpdatedAt,
            force: opts?.force ?? false,
            edits: editsArr,
          },
        })) as
          | { ok: true; updated_at: string; applied: number }
          | { ok: false; conflict: true; current_updated_at: string };
        if (!res.ok) {
          setConflictUpdatedAt(res.current_updated_at);
          setConflictOpen(true);
          markFlushing(false);
          return false;
        }
        markSaved(res.updated_at);
        if (!opts?.silent) {
          toast.success(`${res.applied} modification${res.applied > 1 ? "s" : ""} sauvegardée${res.applied > 1 ? "s" : ""}`);
        }
        onSaved();
        return true;
      } catch (e) {
        markFlushing(false);
        toast.error(e instanceof Error ? e.message : "Erreur sauvegarde");
        return false;
      }
    },
    [baseUpdatedAt, dirtyCount, flushing, edits, flush, planId, markFlushing, markSaved, onSaved],
  );

  /** Autosave 2 min idle */
  useEffect(() => {
    if (dirtyCount === 0 || !lastChangeAt) return;
    const handle = setTimeout(() => {
      if (Date.now() - (useEditStore.getState().lastChangeAt ?? 0) >= AUTOSAVE_IDLE_MS - 100) {
        void doFlush({ silent: true });
      }
    }, AUTOSAVE_IDLE_MS);
    return () => clearTimeout(handle);
  }, [lastChangeAt, dirtyCount, doFlush]);

  /** beforeunload + flush au unmount */
  useEffect(() => {
    const handler = (ev: BeforeUnloadEvent) => {
      const dc = useEditStore.getState().dirtyCount();
      if (dc > 0) {
        ev.preventDefault();
        ev.returnValue = "";
        return "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      // flush silencieux best-effort au démontage
      const dc = useEditStore.getState().dirtyCount();
      if (dc > 0 && useEditStore.getState().baseUpdatedAt) {
        void doFlush({ silent: true });
      }
    };
  }, [doFlush]);

  /** Affichage "Sauvegardé il y a Xs" — refresh chaque 10s */
  useEffect(() => {
    const compute = () => {
      if (!lastSavedAt) {
        setSavedAgo("");
        return;
      }
      const sec = Math.floor((Date.now() - lastSavedAt) / 1000);
      if (sec < 60) setSavedAgo(`il y a ${sec}s`);
      else if (sec < 3600) setSavedAgo(`il y a ${Math.floor(sec / 60)} min`);
      else setSavedAgo(`il y a ${Math.floor(sec / 3600)} h`);
    };
    compute();
    const itv = setInterval(compute, 10_000);
    return () => clearInterval(itv);
  }, [lastSavedAt]);

  /** Raccourcis clavier : Ctrl/Cmd+S → flush ; Ctrl/Cmd+Z → undo */
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      const meta = ev.ctrlKey || ev.metaKey;
      if (!meta) return;
      // Ne pas hijack le undo natif quand on tape dans un input/textarea
      const target = ev.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (ev.key === "s" || ev.key === "S") {
        ev.preventDefault();
        const dc = useEditStore.getState().dirtyCount();
        if (dc === 0) {
          toast.info("Aucune modification à enregistrer");
          return;
        }
        void doFlush();
        return;
      }
      if ((ev.key === "z" || ev.key === "Z") && !ev.shiftKey && !inEditable) {
        const depth = useEditStore.getState().history.length;
        if (depth === 0) return; // laisse passer si rien à annuler
        ev.preventDefault();
        const ok = useEditStore.getState().undo();
        if (ok) toast.info("Modification annulée", { duration: 1500 });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doFlush]);

  return (
    <>
      <div className="sticky top-2 z-30 flex items-center gap-2 rounded-2xl border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
        {dirtyCount > 0 ? (
          <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 text-white">
            {dirtyCount} modif{dirtyCount > 1 ? "s" : ""} non sauvegardée{dirtyCount > 1 ? "s" : ""}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <Check className="h-3 w-3 text-emerald-600" />
            <span>À jour</span>
          </Badge>
        )}
        {lastSavedAt && (
          <span className="text-xs text-muted-foreground">Sauvegardé {savedAgo}</span>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const ok = undo();
            if (ok) toast.info("Modification annulée", { duration: 1500 });
          }}
          disabled={historyDepth === 0 || flushing}
          title="Annuler la dernière modification (Ctrl+Z / ⌘+Z)"
        >
          <Undo2 className="mr-1 h-3 w-3" />
          Annuler
          {historyDepth > 0 && (
            <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[9px]">
              {historyDepth}
            </Badge>
          )}
          <kbd className="ml-1.5 hidden sm:inline-flex h-4 items-center rounded border border-border bg-muted px-1 text-[9px] font-mono opacity-80">
            ⌘Z
          </kbd>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirmReset(true)}
          disabled={dirtyCount === 0 || flushing}
        >
          <RotateCcw className="mr-1 h-3 w-3" /> Tout réinitialiser
        </Button>
        <Button
          size="sm"
          onClick={() => void doFlush()}
          disabled={dirtyCount === 0 || flushing}
          title="Enregistrer maintenant (raccourci Ctrl+S / ⌘+S)"
        >
          {flushing ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Save className="mr-1 h-3 w-3" />
          )}
          Enregistrer{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
          <kbd className="ml-2 hidden sm:inline-flex h-4 items-center rounded border border-white/40 bg-white/10 px-1 text-[9px] font-mono opacity-80">
            ⌘S
          </kbd>
        </Button>
      </div>

      {/* Reset confirm */}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler vos modifications ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous allez perdre {dirtyCount} modification{dirtyCount > 1 ? "s" : ""} non sauvegardée
              {dirtyCount > 1 ? "s" : ""}. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder mes modifs</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                resetAll();
                onSaved(); // recharge depuis serveur
                toast.info("Modifications annulées");
              }}
            >
              Tout annuler
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conflit */}
      <AlertDialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Conflit détecté
            </AlertDialogTitle>
            <AlertDialogDescription>
              Le plan a été modifié par un autre utilisateur depuis votre dernière synchronisation
              {conflictUpdatedAt
                ? ` (${new Date(conflictUpdatedAt).toLocaleString("fr-FR")})`
                : ""}
              . Vous avez {dirtyCount} modification{dirtyCount > 1 ? "s" : ""} en attente.
              <br />
              <br />
              <strong>Recharger</strong> : annule vos modifs et récupère la version serveur.
              <br />
              <strong>Forcer</strong> : écrase les changements concurrents avec vos modifs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                resetAll();
                onSaved();
                setConflictOpen(false);
                toast.info("Plan rechargé depuis le serveur");
              }}
            >
              Recharger (perd mes modifs)
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConflictOpen(false);
                await doFlush({ force: true });
              }}
            >
              Forcer mes modifs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
