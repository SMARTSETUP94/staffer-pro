/**
 * v0.28.0 — Vue Tableur opportunités (saisie inline type Excel/Sheets).
 * v0.29.1 — Hotfix édition (3 fixes critiques) :
 *   1. BUG focus perdu : pattern overlay local + debounce 800ms + setQueryData-like
 *      → la cellule en cours d'édition n'est PLUS démontée par les refetch parent.
 *      onRowsMutated() N'est PLUS appelé après chaque save (uniquement create + delete +
 *      sign 5XXX), évitant le re-render destructif. La saisie reste fluide pendant
 *      qu'une mutation s'exécute en background.
 *   2. Colonne PAT retirée (header + cellule + ordre nav).
 *   3. Code 5XXX éditable conditionnel quand statut="gagne" (admin OR CA propriétaire) :
 *      validation regex /^5\d{3}$/ + appel RPC sign_opportunite (unicité côté BDD).
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Loader2,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";
import {
  STATUT_LABEL,
  STATUT_ORDER,
  TAILLE_LABEL,
  TAILLE_ORDER,
  type OpportuniteStatut,
  type OpportuniteTaille,
} from "@/lib/opportunites";
import {
  STATUT_ROW_BG,
  TABLEUR_COLUMNS,
  type TableurColumnKey,
  type TableurFilters,
  type TableurRow,
  applyTableurFilters,
  canEditCode5XXX,
  isDraftRowEmpty,
  isValidCode5XXX,
  isValidCode9XXX,
  mergeRowOverlay,
  nextCell,
} from "@/lib/opportunites-tableur-helpers";
import { useNextOpportuniteCode } from "@/hooks/use-next-opportunite-code";
import { useUpsertOpportunite } from "@/hooks/use-upsert-opportunite";
import type { ChargeAffaires } from "@/hooks/use-charges-affaires";
import { supabase } from "@/integrations/supabase/client";
import {
  checkCanDeleteOpportunite,
  deleteBlockedMessage,
} from "@/lib/opportunite-delete";

const PAGE_SIZE = 50;
/** v0.29.1 — Debounce passé de 300ms à 800ms (spec hotfix). */
const SAVE_DEBOUNCE_MS = 800;

interface Props {
  rows: TableurRow[];
  charges: ChargeAffaires[];
  filters: TableurFilters;
  canEdit: boolean;
  isAdminOrChef: boolean;
  isAdmin: boolean;
  /** v0.29.1 — id du user courant pour vérifier la propriété sur Code 5XXX. */
  currentUserId: string | null;
  defaultChargeId: string | null;
  onRowsMutated: () => void;
}

interface CellPosition {
  row: number;
  col: TableurColumnKey;
}

export function OpportunitesTableurView({
  rows,
  charges,
  filters,
  canEdit,
  isAdminOrChef,
  isAdmin,
  currentUserId,
  defaultChargeId,
  onRowsMutated,
}: Props) {
  const { fetchNext } = useNextOpportuniteCode();
  const { create, update } = useUpsertOpportunite();

  // Lignes brouillons en local (pas encore persistées)
  const [drafts, setDrafts] = useState<TableurRow[]>([]);
  const [page, setPage] = useState(0);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedFlash, setSavedFlash] = useState<Set<string>>(new Set());
  const [, setEditing] = useState<CellPosition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TableurRow | null>(null);
  /**
   * v0.29.1 — Overlay local pour les lignes persistées : patches "en vol"
   * pas encore confirmés serveur. Ne JAMAIS être écrasé par un refetch parent.
   * Clé = row.id, valeur = patches partiels.
   */
  const [overlay, setOverlay] = useState<Map<string, Partial<TableurRow>>>(new Map());
  const debounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const cellRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  /** Ref vers le dernier champ modifié pour chaque ligne (utilisé par debounce). */
  const lastFieldRef = useRef<Map<string, TableurColumnKey>>(new Map());

  // Lignes finales affichées : merge serveur + overlay + drafts
  const mergedRows = useMemo(() => {
    return rows.map((r) => mergeRowOverlay(r, overlay.get(r.id)));
  }, [rows, overlay]);

  const allRows = useMemo(() => [...mergedRows, ...drafts], [mergedRows, drafts]);
  const filtered = useMemo(() => applyTableurFilters(allRows, filters), [allRows, filters]);
  const pageRows = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    if (page >= pageCount) setPage(Math.max(0, pageCount - 1));
  }, [pageCount, page]);

  /** Patch overlay (lignes persistées) — optimistic, pas de re-render destructif. */
  const patchOverlay = useCallback((id: string, patch: Partial<TableurRow>) => {
    setOverlay((prev) => {
      const next = new Map(prev);
      const existing = next.get(id) ?? {};
      next.set(id, { ...existing, ...patch });
      return next;
    });
  }, []);

  /** Patch in place une ligne brouillon (locale). */
  const patchDraftLocal = useCallback((id: string, patch: Partial<TableurRow>) => {
    setDrafts((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const markSaving = useCallback((id: string, on: boolean) => {
    setSavingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const flashSaved = useCallback((id: string) => {
    setSavedFlash((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      setSavedFlash((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1200);
  }, []);

  /**
   * v0.29.1 — Sauvegarde une ligne sans déclencher de refetch parent.
   * Pour les drafts → create() puis on retire le draft ET on demande refresh
   * (nouvelle ligne à charger). Pour update → update() puis on nettoie l'overlay
   * SANS appeler onRowsMutated (le cache local reflète déjà la valeur).
   */
  const saveRow = useCallback(
    async (row: TableurRow, changedField: TableurColumnKey | null) => {
      markSaving(row.id, true);
      try {
        if (!row.affaireId) {
          // Tentative de création — exige client + charge + code valide
          if (!isValidCode9XXX(row.numero)) {
            toast.error("Code 9XXX invalide", {
              description: "Format attendu : 9XXX (4 chiffres).",
            });
            return;
          }
          if (!row.client.trim() || !row.charge_affaires_id) {
            // Incomplet — on garde le brouillon, pas d'erreur
            return;
          }
          const result = await create({
            code: row.numero,
            client: row.client,
            nom: row.nom,
            charge_affaires_id: row.charge_affaires_id,
            date_opportunite:
              row.date_opportunite ?? new Date().toISOString().slice(0, 10),
            taille: row.taille,
            notes: row.notes,
          });
          if (result.kind === "error") {
            const msg = result.message.toLowerCase();
            if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("déjà")) {
              toast.error("Code déjà utilisé", {
                description: `Le code ${row.numero} est déjà attribué.`,
              });
            } else {
              toast.error("Création impossible", { description: result.message });
            }
            return;
          }
          if (result.kind === "created") {
            const extraPatch: Record<string, unknown> = {};
            if (row.statut_opportunite && row.statut_opportunite !== "a_faire")
              extraPatch.statut_opportunite = row.statut_opportunite;
            if (row.date_montage) extraPatch.date_montage = row.date_montage;
            if (row.date_demontage) extraPatch.date_demontage = row.date_demontage;
            if (Object.keys(extraPatch).length > 0) {
              await update(result.affaireId, extraPatch);
            }
            // Retire le brouillon, demande refresh à parent (nouvelle ligne en BDD)
            setDrafts((prev) => prev.filter((r) => r.id !== row.id));
            onRowsMutated();
            flashSaved(result.affaireId);
            toast.success(`Opportunité ${result.numero} créée`);
          }
        } else {
          // Update incrémental sur le seul champ qui a changé
          const patch: Record<string, unknown> = {};
          switch (changedField) {
            case "client":
              patch.client = row.client.trim();
              patch.nom = row.nom?.trim() || row.client.trim();
              break;
            case "deviseur":
              patch.charge_affaires_id = row.charge_affaires_id;
              break;
            case "date_opportunite":
              patch.date_opportunite = row.date_opportunite;
              break;
            case "taille":
              patch.taille = row.taille;
              break;
            case "statut":
              patch.statut_opportunite = row.statut_opportunite;
              break;
            case "date_montage":
              patch.date_montage = row.date_montage;
              break;
            case "date_demontage":
              patch.date_demontage = row.date_demontage;
              break;
            case "commentaires":
              patch.notes = row.notes;
              break;
            case "code":
              if (!isValidCode9XXX(row.numero)) {
                toast.error("Code 9XXX invalide");
                return;
              }
              patch.numero = row.numero;
              break;
            // case "code_5xxx" est géré séparément (RPC sign_opportunite)
          }
          if (Object.keys(patch).length === 0) return;
          const result = await update(row.affaireId, patch);
          if (result.kind === "error") {
            const msg = result.message.toLowerCase();
            if (msg.includes("duplicate") || msg.includes("unique")) {
              toast.error("Code déjà utilisé");
              // En cas d'erreur de duplicat, on rollback l'overlay
              setOverlay((prev) => {
                const next = new Map(prev);
                next.delete(row.id);
                return next;
              });
              onRowsMutated();
            } else {
              toast.error("Sauvegarde impossible", { description: result.message });
              // Rollback overlay sur la clé du champ
              setOverlay((prev) => {
                const next = new Map(prev);
                next.delete(row.id);
                return next;
              });
            }
          } else {
            // ✅ Succès : on garde l'overlay (il reflète la vérité serveur)
            // Pas de onRowsMutated → pas de re-fetch destructif → focus conservé.
            flashSaved(row.id);
          }
        }
      } finally {
        markSaving(row.id, false);
      }
    },
    [create, update, onRowsMutated, markSaving, flashSaved],
  );

  /** Programme une sauvegarde debounced (800ms). */
  const scheduleSave = useCallback(
    (row: TableurRow, field: TableurColumnKey | null) => {
      const map = debounceRef.current;
      const existing = map.get(row.id);
      if (existing) clearTimeout(existing);
      if (field) lastFieldRef.current.set(row.id, field);
      const t = setTimeout(() => {
        map.delete(row.id);
        const lastField = lastFieldRef.current.get(row.id) ?? field;
        void saveRow(row, lastField);
      }, SAVE_DEBOUNCE_MS);
      map.set(row.id, t);
    },
    [saveRow],
  );

  /** Flush immédiat sur blur (sortie cellule) — pas d'attente debounce. */
  const flushSaveNow = useCallback(
    (row: TableurRow, field: TableurColumnKey | null) => {
      const map = debounceRef.current;
      const existing = map.get(row.id);
      if (existing) {
        clearTimeout(existing);
        map.delete(row.id);
        void saveRow(row, field ?? lastFieldRef.current.get(row.id) ?? null);
      }
    },
    [saveRow],
  );

  /** Cleanup debounce au démontage. */
  useEffect(() => {
    const map = debounceRef.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  /** Patch local + schedule save. */
  const updateField = useCallback(
    (row: TableurRow, field: TableurColumnKey, patch: Partial<TableurRow>) => {
      const newRow = { ...row, ...patch };
      if (row.affaireId) {
        // Lignes persistées : overlay local immédiat (pas écrasé par refetch).
        patchOverlay(row.id, patch);
        scheduleSave(newRow, field);
      } else {
        patchDraftLocal(row.id, patch);
        scheduleSave(newRow, field);
      }
    },
    [scheduleSave, patchOverlay, patchDraftLocal],
  );

  /** Ajoute une nouvelle ligne brouillon avec code suggéré. */
  const addDraftRow = useCallback(async () => {
    const code = await fetchNext();
    if (!code) {
      toast.error("Impossible de suggérer un code 9XXX");
      return;
    }
    const draftId = `draft-${Date.now()}`;
    const newRow: TableurRow = {
      id: draftId,
      affaireId: null,
      numero: code,
      client: "",
      nom: "",
      charge_affaires_id: defaultChargeId,
      date_opportunite: new Date().toISOString().slice(0, 10),
      taille: null,
      statut_opportunite: "a_faire",
      code_opportunite: null,
      signed_affaire_numero: null,
      signed_affaire_id: null,
      date_pat: null,
      date_montage: null,
      date_demontage: null,
      notes: null,
    };
    setDrafts((prev) => [...prev, newRow]);
    const newTotal = filtered.length + 1;
    setPage(Math.max(0, Math.ceil(newTotal / PAGE_SIZE) - 1));
    setTimeout(() => {
      const lastIdx = pageRows.length;
      setEditing({ row: lastIdx, col: "client" });
    }, 50);
  }, [fetchNext, defaultChargeId, filtered.length, pageRows.length]);

  /** Suppression d'une opportunité (admin/chef uniquement). */
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    if (!deleteTarget.affaireId) {
      setDrafts((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
      return;
    }
    const check = checkCanDeleteOpportunite({
      statut_opportunite: deleteTarget.statut_opportunite ?? null,
      phase: deleteTarget.signed_affaire_id ? "signe" : "opportunite",
    });
    if (!check.ok) {
      const msg = deleteBlockedMessage(check.reason);
      toast.error(msg.title, { description: msg.description });
      setDeleteTarget(null);
      return;
    }
    const { error } = await supabase
      .from("affaires")
      .delete()
      .eq("id", deleteTarget.affaireId);
    if (error) {
      const m = error.message || "";
      if (m.toLowerCase().includes("violates row-level security")) {
        toast.error("Suppression refusée", {
          description: "Vous n'avez pas les droits pour supprimer cette opportunité.",
        });
      } else if (m.includes("Impossible de supprimer une opportunité")) {
        toast.error("Suppression bloquée", { description: m });
      } else {
        toast.error("Suppression impossible", { description: m });
      }
    } else {
      toast.success(`Opportunité ${deleteTarget.numero} supprimée`);
      onRowsMutated();
    }
    setDeleteTarget(null);
  }, [deleteTarget, onRowsMutated]);

  /**
   * v0.29.1 — Signature d'une opportunité depuis la cellule Code 5XXX.
   * Validation regex puis RPC sign_opportunite (gère unicité côté BDD).
   */
  const handleSignFromCell = useCallback(
    async (row: TableurRow, code5xxx: string) => {
      const trimmed = code5xxx.trim();
      if (!trimmed) return;
      if (!isValidCode5XXX(trimmed)) {
        toast.error("Code 5XXX invalide", {
          description: "Format attendu : 5XXX (4 chiffres commençant par 5).",
        });
        return;
      }
      if (!row.affaireId) return;
      markSaving(row.id, true);
      const { error } = await supabase.rpc("sign_opportunite", {
        _affaire_id: row.affaireId,
        _new_code: trimmed,
      });
      markSaving(row.id, false);
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("duplicate") || msg.includes("unique")) {
          toast.error("Code 5XXX déjà attribué", {
            description: `Le code ${trimmed} est déjà utilisé par une autre affaire.`,
          });
        } else {
          toast.error("Signature impossible", { description: error.message });
        }
        return;
      }
      flashSaved(row.id);
      toast.success(`Opportunité ${row.numero} signée → affaire ${trimmed}`);
      // Le numero a changé en BDD (9XXX → 5XXX) + phase=signe → refetch nécessaire
      onRowsMutated();
    },
    [markSaving, flashSaved, onRowsMutated],
  );

  /** Navigation Tab/Enter. */
  const onCellKeyDown = useCallback(
    (e: React.KeyboardEvent, rowIdx: number, col: TableurColumnKey) => {
      if (e.key === "Escape") {
        setEditing(null);
        (e.target as HTMLElement).blur();
        return;
      }
      let direction: "tab" | "shift-tab" | "enter" | "shift-enter" | null = null;
      if (e.key === "Tab") direction = e.shiftKey ? "shift-tab" : "tab";
      else if (e.key === "Enter" && !e.shiftKey) direction = "enter";
      if (!direction) return;
      e.preventDefault();
      const target = nextCell(rowIdx, col, direction, pageRows.length);
      if (!target) return;
      setEditing(target);
      setTimeout(() => {
        const key = `${target.row}-${target.col}`;
        const el = cellRefs.current.get(key);
        el?.focus();
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          el.select?.();
        }
      }, 10);
    },
    [pageRows.length],
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left font-semibold">Code 9XXX</th>
              <th className="px-2 py-2 text-left font-semibold">Client / chantier</th>
              <th className="px-2 py-2 text-left font-semibold">Deviseur</th>
              <th className="px-2 py-2 text-left font-semibold">Date d'opp</th>
              <th className="px-2 py-2 text-left font-semibold">Taille</th>
              <th className="px-2 py-2 text-left font-semibold">Statut</th>
              <th className="px-2 py-2 text-left font-semibold">Code 5XXX</th>
              <th className="px-2 py-2 text-left font-semibold">Montage</th>
              <th className="px-2 py-2 text-left font-semibold">Démontage</th>
              <th className="px-2 py-2 text-left font-semibold">Commentaires</th>
              {isAdminOrChef && <th className="px-2 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={isAdminOrChef ? 11 : 10}
                  className="px-4 py-8 text-center text-xs text-muted-foreground"
                >
                  Aucune opportunité ne correspond aux filtres.
                </td>
              </tr>
            )}
            {pageRows.map((row, rowIdx) => {
              const bg = row.statut_opportunite ? STATUT_ROW_BG[row.statut_opportunite] : "";
              const saving = savingIds.has(row.id);
              const justSaved = savedFlash.has(row.id);
              const setRef = (col: TableurColumnKey) => (el: HTMLElement | null) => {
                cellRefs.current.set(`${rowIdx}-${col}`, el);
              };
              const isOwner =
                !!currentUserId && row.charge_affaires_id === currentUserId;
              const code5xxxEditable = canEditCode5XXX({
                statut: row.statut_opportunite,
                isAdmin,
                isOwner,
                alreadySigned: !!row.signed_affaire_id,
              });
              return (
                <tr
                  key={row.id}
                  className={cn("border-b border-border/40 transition-colors", bg)}
                >
                  {/* Code 9XXX */}
                  <td className="px-2 py-1">
                    <Input
                      ref={setRef("code") as React.Ref<HTMLInputElement>}
                      value={row.numero}
                      onChange={(e) => updateField(row, "code", { numero: e.target.value })}
                      onKeyDown={(e) => onCellKeyDown(e, rowIdx, "code")}
                      onFocus={() => setEditing({ row: rowIdx, col: "code" })}
                      onBlur={() => flushSaveNow(row, "code")}
                      disabled={!canEdit}
                      maxLength={4}
                      className="h-8 w-20 font-mono"
                    />
                  </td>
                  {/* Client */}
                  <td className="px-2 py-1">
                    <Input
                      ref={setRef("client") as React.Ref<HTMLInputElement>}
                      value={row.client}
                      onChange={(e) => updateField(row, "client", { client: e.target.value })}
                      onKeyDown={(e) => onCellKeyDown(e, rowIdx, "client")}
                      onFocus={() => setEditing({ row: rowIdx, col: "client" })}
                      onBlur={() => flushSaveNow(row, "client")}
                      disabled={!canEdit}
                      placeholder="Client / chantier…"
                      className="h-8 min-w-[180px]"
                    />
                  </td>
                  {/* Deviseur */}
                  <td className="px-2 py-1">
                    <Select
                      value={row.charge_affaires_id ?? ""}
                      onValueChange={(v) =>
                        updateField(row, "deviseur", { charge_affaires_id: v })
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger
                        ref={setRef("deviseur") as React.Ref<HTMLButtonElement>}
                        className="h-8 w-[160px]"
                        onKeyDown={(e) => onCellKeyDown(e, rowIdx, "deviseur")}
                      >
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {charges.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.full_name || c.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  {/* Date opp */}
                  <td className="px-2 py-1">
                    <Input
                      ref={setRef("date_opportunite") as React.Ref<HTMLInputElement>}
                      type="date"
                      value={row.date_opportunite ?? ""}
                      onChange={(e) =>
                        updateField(row, "date_opportunite", {
                          date_opportunite: e.target.value || null,
                        })
                      }
                      onKeyDown={(e) => onCellKeyDown(e, rowIdx, "date_opportunite")}
                      onBlur={() => flushSaveNow(row, "date_opportunite")}
                      disabled={!canEdit}
                      className="h-8 w-[140px]"
                    />
                  </td>
                  {/* Taille */}
                  <td className="px-2 py-1">
                    <Select
                      value={row.taille ?? ""}
                      onValueChange={(v) =>
                        updateField(row, "taille", { taille: v as OpportuniteTaille })
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger
                        ref={setRef("taille") as React.Ref<HTMLButtonElement>}
                        className="h-8 w-[120px]"
                        onKeyDown={(e) => onCellKeyDown(e, rowIdx, "taille")}
                      >
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {TAILLE_ORDER.map((t) => (
                          <SelectItem key={t} value={t}>
                            {TAILLE_LABEL[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  {/* Statut */}
                  <td className="px-2 py-1">
                    <Select
                      value={row.statut_opportunite ?? "a_faire"}
                      onValueChange={(v) =>
                        updateField(row, "statut", {
                          statut_opportunite: v as OpportuniteStatut,
                        })
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger
                        ref={setRef("statut") as React.Ref<HTMLButtonElement>}
                        className="h-8 w-[120px]"
                        onKeyDown={(e) => onCellKeyDown(e, rowIdx, "statut")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUT_ORDER.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUT_LABEL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  {/* Code 5XXX — éditable conditionnel (v0.29.1) */}
                  <td className="px-2 py-1 font-mono text-xs">
                    {row.signed_affaire_numero && row.signed_affaire_id ? (
                      <Link
                        to="/affaires/$affaireId"
                        params={{ affaireId: row.signed_affaire_id }}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {row.signed_affaire_numero}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : code5xxxEditable ? (
                      <Code5xxxCell
                        ref={setRef("code_5xxx") as React.Ref<HTMLInputElement>}
                        onSign={(v) => handleSignFromCell(row, v)}
                        onKeyDown={(e) => onCellKeyDown(e, rowIdx, "code_5xxx")}
                        disabled={saving}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {/* Montage */}
                  <td className="px-2 py-1">
                    <Input
                      ref={setRef("date_montage") as React.Ref<HTMLInputElement>}
                      type="date"
                      value={row.date_montage ?? ""}
                      onChange={(e) =>
                        updateField(row, "date_montage", {
                          date_montage: e.target.value || null,
                        })
                      }
                      onKeyDown={(e) => onCellKeyDown(e, rowIdx, "date_montage")}
                      onBlur={() => flushSaveNow(row, "date_montage")}
                      disabled={!canEdit}
                      className="h-8 w-[140px]"
                    />
                  </td>
                  {/* Démontage */}
                  <td className="px-2 py-1">
                    <Input
                      ref={setRef("date_demontage") as React.Ref<HTMLInputElement>}
                      type="date"
                      value={row.date_demontage ?? ""}
                      onChange={(e) =>
                        updateField(row, "date_demontage", {
                          date_demontage: e.target.value || null,
                        })
                      }
                      onKeyDown={(e) => onCellKeyDown(e, rowIdx, "date_demontage")}
                      onBlur={() => flushSaveNow(row, "date_demontage")}
                      disabled={!canEdit}
                      className="h-8 w-[140px]"
                    />
                  </td>
                  {/* Commentaires */}
                  <td className="px-2 py-1">
                    <Textarea
                      ref={setRef("commentaires") as React.Ref<HTMLTextAreaElement>}
                      value={row.notes ?? ""}
                      onChange={(e) =>
                        updateField(row, "commentaires", { notes: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) return;
                        onCellKeyDown(e, rowIdx, "commentaires");
                      }}
                      onBlur={() => flushSaveNow(row, "commentaires")}
                      disabled={!canEdit}
                      maxLength={500}
                      rows={1}
                      placeholder="…"
                      className="h-8 min-h-[2rem] min-w-[200px] resize-none py-1"
                    />
                  </td>
                  {isAdminOrChef && (
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        {/* Indicateur discret de save en cours / réussi */}
                        <span className="inline-flex h-5 w-5 items-center justify-center">
                          {saving ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          ) : justSaved ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : null}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(row)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={addDraftRow}
              className="h-8 rounded-xl"
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter ligne
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            {filtered.length} opportunité{filtered.length > 1 ? "s" : ""}
          </span>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="h-8 w-8 p-0"
              aria-label="Page précédente"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums">
              Page {page + 1} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="h-8 w-8 p-0"
              aria-label="Page suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette opportunité&nbsp;?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.numero} — {deleteTarget?.client || "(sans client)"} sera
              définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * v0.29.1 — Cellule input dédiée à la saisie du Code 5XXX (signature).
 * Local state pour ne pas interférer avec l'overlay des autres champs.
 * Save sur Enter ou Blur si valide.
 */
interface Code5xxxCellProps {
  onSign: (code: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  disabled?: boolean;
}

const Code5xxxCell = forwardRef<HTMLInputElement, Code5xxxCellProps>(
  function Code5xxxCell({ onSign, onKeyDown, disabled }, ref) {
    const [val, setVal] = useState("");
    return (
      <Input
        ref={ref}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (val.trim()) onSign(val);
            return;
          }
          onKeyDown(e);
        }}
        onBlur={() => {
          if (val.trim() && isValidCode5XXX(val)) onSign(val);
        }}
        disabled={disabled}
        maxLength={4}
        placeholder="5XXX"
        className="h-7 w-20 font-mono text-xs"
      />
    );
  },
);

// Re-export TableurRow + helpers utilisés ailleurs (route, tests)
export { isDraftRowEmpty, TABLEUR_COLUMNS };
export type { TableurColumnKey };
