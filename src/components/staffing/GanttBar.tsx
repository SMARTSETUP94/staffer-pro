// v0.35.2 / Sprint 2.1 — GanttBar (barre individuelle d'une étape métier)
// v0.35.10 P1 #4 — drag horizontal pour shift au jour près (en plus des chevrons).
//                  Snap au jour, preview visuel via translation, commit au mouseup.
import { useRef, useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { METIER_COLOR } from "./gantt-helpers";
import type { PlanStep } from "@/lib/staffing/types";
import { METIER_KEY_BY_ID } from "@/lib/staffing/types";

interface Props {
  step: PlanStep;
  startCol: number;
  endCol: number;
  /** Largeur en px d'une colonne jour (utilisée pour snap drag). Si absente → pas de drag. */
  dayWidthPx?: number;
  isOverDeadline?: boolean;
  manualShift?: number;
  /** Indique un risque pré-vol détecté (toast déjà affiché) — entoure d'un ring orange */
  hasWarning?: boolean;
  /** v0.35.x audit UX #2 — modif locale en attente de flush (sliders / shift) */
  hasLocalEdit?: boolean;
  onShift?: (delta: number) => void;
  onResetShift?: () => void;
  disableShift?: boolean;
}

export function GanttBar({
  step,
  startCol,
  endCol,
  dayWidthPx,
  isOverDeadline,
  manualShift = 0,
  hasWarning,
  hasLocalEdit,
  onShift,
  onResetShift,
  disableShift,
}: Props) {
  const metierKey = METIER_KEY_BY_ID[step.metier_id] ?? "Manut";
  // v0.38.5 — Barres uniformes neutres (gris). Identification métier via pastille en début de ligne.
  // Garde rouge si dépassement deadline (signal critique).
  const bg = isOverDeadline ? "#dc2626" : undefined;
  const neutralClass = isOverDeadline ? "" : "bg-muted/70 border border-border/60";
  const textClass = isOverDeadline ? "text-white" : "text-foreground";
  // v0.37 — Manut splittée en 3 phases : badge visible à droite du libellé.
  const phaseLabel =
    metierKey === "Manut" && step.phase
      ? step.phase === "DEBUT"
        ? "DÉB"
        : step.phase === "TRANSFERT"
          ? "TRF"
          : "FIN"
      : null;

  // Drag state — pixels translation pendant drag, snap commit au mouseup
  const [dragDeltaPx, setDragDeltaPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<{
    startX: number;
    snappedDelta: number; // dernier delta en jours déjà snap
  } | null>(null);

  // v0.38.2 — détection overflow label (barre trop étroite → masque texte, tooltip prend le relai)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const [labelOverflow, setLabelOverflow] = useState(false);
  useEffect(() => {
    if (!containerRef.current || !labelRef.current) return;
    const measure = () => {
      const c = containerRef.current;
      const l = labelRef.current;
      if (!c || !l) return;
      // marge buttons (chevrons + croix ~60px) — on tolère un peu
      setLabelOverflow(l.scrollWidth > c.clientWidth - 8);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  });

  const canDrag = !!onShift && !disableShift && !!dayWidthPx && dayWidthPx > 0;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!canDrag) return;
      // Évite drag sur les boutons (chevrons / croix)
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      e.stopPropagation();
      dragStateRef.current = { startX: e.clientX, snappedDelta: 0 };
      setDragging(true);
      setDragDeltaPx(0);

      const onMove = (ev: MouseEvent) => {
        if (!dragStateRef.current || !dayWidthPx) return;
        const dx = ev.clientX - dragStateRef.current.startX;
        setDragDeltaPx(dx);
      };
      const onUp = (ev: MouseEvent) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (!dragStateRef.current || !dayWidthPx) {
          setDragging(false);
          setDragDeltaPx(0);
          return;
        }
        const dx = ev.clientX - dragStateRef.current.startX;
        const deltaDays = Math.round(dx / dayWidthPx);
        dragStateRef.current = null;
        setDragging(false);
        setDragDeltaPx(0);
        if (deltaDays !== 0 && onShift) onShift(deltaDays);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [canDrag, dayWidthPx, onShift],
  );

  // Calcul preview snap (jours arrondis pendant drag)
  const previewDays =
    dragging && dayWidthPx ? Math.round(dragDeltaPx / dayWidthPx) : 0;

  // Priorité visuelle : drag > warning > localEdit
  const ringClass = dragging
    ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
    : hasWarning && !isOverDeadline
      ? "ring-2 ring-amber-500/80 ring-offset-1 ring-offset-background"
      : hasLocalEdit
        ? "outline-dashed outline-2 outline-offset-1 outline-amber-500/90"
        : "";
  const shiftLabel = manualShift !== 0 ? `${manualShift > 0 ? "+" : ""}${manualShift}j` : null;
  const previewLabel =
    dragging && previewDays !== 0 ? `${previewDays > 0 ? "+" : ""}${previewDays}j` : null;
  const spanLabel = (() => {
    const demi = step.span_demi_jours ?? step.span_days * 2;
    if (demi === 1) return "½j";
    if (demi % 2 === 0) return `${demi / 2}j`;
    return `${Math.floor(demi / 2)}½j`;
  })();
  const compactLabel = `${step.pers}p × ${spanLabel}`;
  const tooltip =
    `${metierKey} · ${compactLabel} × ${step.h_par_jour}h` +
    (phaseLabel ? ` · ${phaseLabel}` : "") +
    (shiftLabel ? ` (décalé ${shiftLabel})` : "") +
    (canDrag ? " — glisser pour décaler, chevrons ±1j" : "") +
    (hasWarning ? " — risque détecté" : "") +
    (hasLocalEdit ? " — modif locale en attente (Ctrl+S pour enregistrer)" : "");

  // Snap visuel pendant drag : on translate par pas de jour, pas en continu
  const translatePx =
    dragging && dayWidthPx ? Math.round(dragDeltaPx / dayWidthPx) * dayWidthPx : 0;

  return (
    <div
      ref={containerRef}
      className={`group relative flex h-7 items-center rounded-md px-2 text-[11px] font-mono ${textClass} ${neutralClass} shadow-sm ${ringClass} ${
        canDrag ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
      }`}
      style={{
        gridColumnStart: startCol,
        gridColumnEnd: endCol,
        backgroundColor: bg,
        transform: translatePx ? `translateX(${translatePx}px)` : undefined,
        transition: dragging ? "none" : "transform 120ms ease",
        userSelect: dragging ? "none" : undefined,
        zIndex: dragging ? 20 : undefined,
      }}
      title={tooltip}
      data-testid="gantt-bar"
      data-label={compactLabel}
      onMouseDown={handleMouseDown}
    >
      {onShift && !disableShift && (
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-foreground/10"
          onClick={(e) => {
            e.stopPropagation();
            onShift(-1);
          }}
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
      )}
      <span
        ref={labelRef}
        className={`flex-1 truncate text-center ${labelOverflow ? "opacity-0" : ""}`}
        aria-hidden={labelOverflow}
      >
        {compactLabel}
        {phaseLabel && (
          <span className="ml-1 rounded bg-white/30 px-1 text-[9px] font-bold tracking-wider">
            {phaseLabel}
          </span>
        )}
        {shiftLabel && !dragging && (
          <span className="ml-1 rounded bg-white/25 px-1 text-[9px] font-bold">{shiftLabel}</span>
        )}
        {previewLabel && (
          <span className="ml-1 rounded bg-primary/80 px-1 text-[9px] font-bold ring-1 ring-white/60">
            {previewLabel}
          </span>
        )}
        {isOverDeadline && !dragging && <span className="ml-1 font-bold">OUT</span>}
      </span>
      {labelOverflow && (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-bold"
          aria-hidden
        >
          •••
        </span>
      )}
      {onResetShift && manualShift !== 0 && !disableShift && !dragging && (
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-foreground/10"
          onClick={(e) => {
            e.stopPropagation();
            onResetShift();
          }}
          title="Annuler décalage manuel"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
      {onShift && !disableShift && (
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-foreground/10"
          onClick={(e) => {
            e.stopPropagation();
            onShift(1);
          }}
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
