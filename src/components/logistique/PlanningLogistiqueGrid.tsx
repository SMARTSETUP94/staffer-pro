import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ETAPE_CLASSES, ETAPE_LABELS, etapeCouvreJour, heureCourte } from "@/lib/logistique/etapes";
import type { EtapeLogistique } from "@/hooks/use-etapes-logistiques";

interface Props {
  jours: string[];
  etapes: EtapeLogistique[];
  conflits: Set<string>;
  big?: boolean;
  onCardClick?: (e: EtapeLogistique) => void;
  onDayClick?: (day: string) => void;
  onMove?: (e: EtapeLogistique, deltaJours: number) => void;
}

export function EtapeCard({ e, conflit, big, onClick, draggable }: {
  e: EtapeLogistique; conflit: boolean; big?: boolean; onClick?: () => void; draggable?: boolean;
}) {
  const h = [heureCourte(e.heure_debut), heureCourte(e.heure_fin)].filter(Boolean).join("–");
  const veh = e.vehicule?.immatriculation ?? e.vehicule?.nom ?? e.immatriculation_libre;
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(ev) => ev.dataTransfer.setData("text/etape", JSON.stringify({ id: e.id }))}
      onClick={(ev) => { ev.stopPropagation(); onClick?.(); }}
      className={cn(
        "w-full rounded-md px-2 py-1 text-left shadow-sm transition hover:brightness-110",
        ETAPE_CLASSES[e.type],
        e.statut === "propose" && "opacity-70 outline-dashed outline-2 outline-offset-[-2px]",
        conflit && "ring-2 ring-destructive",
        big ? "text-base" : "text-xs",
      )}
    >
      <div className="flex items-center gap-1 font-semibold">
        {conflit && <AlertTriangle className="h-3 w-3 shrink-0" />}
        <span className="truncate">{ETAPE_LABELS[e.type]}{e.sens ? ` ${e.sens}` : ""}</span>
        {h && <span className="ml-auto shrink-0 tabular-nums">{h}</span>}
      </div>
      <div className={cn("truncate", big ? "text-sm" : "text-[11px]")}>
        {e.affaire?.numero} · {e.affaire?.nom}
      </div>
      {(veh || e.horaire_libre) && (
        <div className={cn("flex items-center gap-1 truncate opacity-90", big ? "text-sm" : "text-[11px]")}>
          {veh && <><Truck className="h-3 w-3 shrink-0" />{veh}</>}
          {e.horaire_libre && <span className="truncate">{veh ? " · " : ""}{e.horaire_libre}</span>}
        </div>
      )}
    </button>
  );
}

export function PlanningLogistiqueGrid({ jours, etapes, conflits, big, onCardClick, onDayClick, onMove }: Props) {
  const today = format(new Date(), "yyyy-MM-dd");
  const cols = jours.length <= 7 ? jours.length : 7;
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {jours.map((d) => {
        const dayEtapes = etapes.filter((e) => etapeCouvreJour(e, d));
        const date = parseISO(d);
        const weekend = date.getDay() === 0 || date.getDay() === 6;
        return (
          <div
            key={d}
            onClick={() => onDayClick?.(d)}
            onDragOver={(ev) => onMove && ev.preventDefault()}
            onDrop={(ev) => {
              const raw = ev.dataTransfer.getData("text/etape");
              if (!raw || !onMove) return;
              const { id } = JSON.parse(raw) as { id: string };
              const e = etapes.find((x) => x.id === id);
              if (!e) return;
              const delta = differenceInCalendarDays(date, parseISO(e.date_debut));
              if (delta !== 0) onMove(e, delta);
            }}
            className={cn(
              "flex min-h-32 flex-col gap-1 rounded-lg border border-border bg-card p-1.5",
              weekend && "bg-muted/50",
              d === today && "border-primary ring-1 ring-primary",
              onDayClick && "cursor-pointer",
            )}
          >
            <div className={cn("px-1 font-semibold capitalize", big ? "text-lg" : "text-xs", d === today ? "text-primary" : "text-muted-foreground")}>
              {format(date, big ? "EEEE d MMM" : "EEE d MMM", { locale: fr })}
            </div>
            {dayEtapes.map((e) => (
              <EtapeCard key={e.id} e={e} conflit={conflits.has(e.id)} big={big} draggable={!!onMove} onClick={onCardClick ? () => onCardClick(e) : undefined} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function LegendeEtapes() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(ETAPE_LABELS) as (keyof typeof ETAPE_LABELS)[]).map((t) => (
        <span key={t} className={cn("rounded px-2 py-0.5 text-xs font-medium", ETAPE_CLASSES[t])}>{ETAPE_LABELS[t]}</span>
      ))}
    </div>
  );
}
