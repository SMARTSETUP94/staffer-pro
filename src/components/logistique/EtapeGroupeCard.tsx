import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, CircleDashed, Ban, Truck, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { ETAPE_CLASSES, ETAPE_LABELS, heureCourte } from "@/lib/logistique/etapes";
import { groupeDeplieParDefaut } from "@/lib/logistique/regroupement";
import {
  ETAPE_LOGISTIQUE_STATUT_LABELS, LOGISTIQUE_GROUPE_ANNULE, LOGISTIQUE_GROUPE_CONFLIT,
  LOGISTIQUE_GROUPE_DEPLIER, LOGISTIQUE_GROUPE_PROPOSE, LOGISTIQUE_GROUPE_REPLIER,
  LOGISTIQUE_REGROUPER_LABEL, logistiqueNbEtapesLabel,
} from "@/lib/labels";
import type { EtapeLogistique } from "@/hooks/use-etapes-logistiques";

const PREF_KEY = "logistique.regrouper-par-chantier";
const SESSION_KEY = "logistique.groupes-deplies";

/** Préférence « Regrouper par chantier » (activée par défaut, mémorisée). */
export function useRegrouperParChantier(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(true);
  useEffect(() => { if (localStorage.getItem(PREF_KEY) === "0") setV(false); }, []);
  return [v, (n) => { setV(n); localStorage.setItem(PREF_KEY, n ? "1" : "0"); }];
}

export function RegrouperToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <Switch checked={value} onCheckedChange={onChange} />
      {LOGISTIQUE_REGROUPER_LABEL}
    </label>
  );
}

function readSession(): Record<string, boolean> {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}"); } catch { return {}; }
}

function useDeplie(key: string, nb: number): [boolean, () => void] {
  const [open, setOpen] = useState(groupeDeplieParDefaut(nb));
  useEffect(() => { const s = readSession()[key]; if (s !== undefined) setOpen(s); }, [key]);
  return [open, () => setOpen((o) => {
    const s = readSession(); s[key] = !o; sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); return !o;
  })];
}

export function EtapeGroupeCard({ groupKey, etapes, plage, responsables, conflit, propose, annule, conflits, big, draggable, onEtapeClick }: {
  groupKey: string;
  etapes: EtapeLogistique[];
  plage: string | null;
  responsables: string[];
  conflit: boolean;
  propose: boolean;
  annule: boolean;
  conflits: Set<string>;
  big?: boolean;
  draggable?: boolean;
  onEtapeClick?: (e: EtapeLogistique) => void;
}) {
  const [open, toggle] = useDeplie(groupKey, etapes.length);
  const a = etapes[0].affaire;
  const sm = big ? "text-sm" : "text-[11px]";
  return (
    <div
      onClick={(ev) => ev.stopPropagation()}
      className={cn("rounded-md border border-border bg-background shadow-sm", conflit && "ring-2 ring-destructive", big ? "text-base" : "text-xs")}
    >
      <button type="button" onClick={toggle} aria-expanded={open}
        title={open ? LOGISTIQUE_GROUPE_REPLIER : LOGISTIQUE_GROUPE_DEPLIER}
        className="w-full rounded-t-md px-2 py-1 text-left hover:bg-muted/60">
        <div className="flex items-center gap-1 font-semibold">
          {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <span className="truncate">{a?.numero} · {a?.nom}</span>
          {conflit && <span title={LOGISTIQUE_GROUPE_CONFLIT} className="ml-auto shrink-0 text-destructive"><AlertTriangle className="h-3 w-3" /></span>}
          {propose && <span title={LOGISTIQUE_GROUPE_PROPOSE} className={cn("shrink-0 text-muted-foreground", !conflit && "ml-auto")}><CircleDashed className="h-3 w-3" /></span>}
          {annule && <span title={LOGISTIQUE_GROUPE_ANNULE} className={cn("shrink-0 text-muted-foreground", !conflit && !propose && "ml-auto")}><Ban className="h-3 w-3" /></span>}
        </div>
        <div className={cn("flex items-center gap-1 text-muted-foreground", sm)}>
          <span className="shrink-0 font-medium text-foreground">{logistiqueNbEtapesLabel(etapes.length)}</span>
          {plage && <span className="shrink-0 tabular-nums">· {plage}</span>}
          {responsables.length > 0 && <span className="truncate">· {responsables.join(", ")}</span>}
        </div>
        {!open && (
          <div className="mt-0.5 flex gap-0.5">
            {etapes.map((e) => <span key={e.id} className={cn("h-1.5 flex-1 rounded-full", ETAPE_CLASSES[e.type], e.statut === "annule" && "opacity-40")} />)}
          </div>
        )}
      </button>
      {open && (
        <div className="space-y-0.5 border-t border-border p-1">
          {etapes.map((e) => {
            const veh = e.vehicule?.immatriculation ?? e.vehicule?.nom ?? e.immatriculation_libre;
            const c = conflits.has(e.id);
            const libre = [e.horaire_libre, e.sens].filter(Boolean).join(" · ");
            return (
              <button key={e.id} type="button" draggable={draggable}
                onDragStart={(ev) => ev.dataTransfer.setData("text/etape", JSON.stringify({ id: e.id }))}
                onClick={(ev) => { ev.stopPropagation(); onEtapeClick?.(e); }}
                className={cn("flex w-full flex-col rounded px-1 py-0.5 text-left hover:bg-muted",
                  e.statut === "propose" && "outline-dashed outline-1 outline-muted-foreground",
                  c && "bg-destructive/10")}>
                <div className={cn("flex items-center gap-1", e.statut === "annule" && "line-through opacity-60")}>
                  <span className="w-9 shrink-0 tabular-nums font-medium">{heureCourte(e.heure_debut) ?? "—"}</span>
                  <span className={cn("shrink-0 rounded px-1 font-semibold", ETAPE_CLASSES[e.type])}>{ETAPE_LABELS[e.type]}</span>
                  {c && <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />}
                  <span className={cn("ml-auto shrink-0 text-muted-foreground", sm)}>{ETAPE_LOGISTIQUE_STATUT_LABELS[e.statut] ?? e.statut}</span>
                </div>
                {(libre || e.responsable || veh) && (
                  <div className={cn("flex items-center gap-1 truncate pl-10 text-muted-foreground", sm, e.statut === "annule" && "line-through")}>
                    {libre && <span className="truncate">{libre}</span>}
                    {e.responsable && <span className="flex shrink-0 items-center gap-0.5"><User className="h-3 w-3" />{e.responsable}</span>}
                    {veh && <span className="flex shrink-0 items-center gap-0.5"><Truck className="h-3 w-3" />{veh}</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
