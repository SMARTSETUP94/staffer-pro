import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, Clock, MapPin, Plus, Truck, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ETAPE_CLASSES, ETAPE_LABELS, etapeCouvreJour } from "@/lib/logistique/etapes";
import type { EtapeLogistique } from "@/hooks/use-etapes-logistiques";
import { regrouperEtapesJour } from "@/lib/logistique/regroupement";
import { EtapeGroupeCard } from "./EtapeGroupeCard";

/** Vue téléphone : sélecteur de jour + liste aérée des étapes du jour. */
export function PlanningJourMobile({ jours, etapes, conflits, onCardClick, onAdd, regrouper = true }: {
  regrouper?: boolean;
  jours: string[];
  etapes: EtapeLogistique[];
  conflits: Set<string>;
  onCardClick?: (e: EtapeLogistique) => void;
  onAdd?: (day: string) => void;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [day, setDay] = useState(jours.includes(today) ? today : jours[0]);
  useEffect(() => { if (!jours.includes(day)) setDay(jours.includes(today) ? today : jours[0]); }, [jours]); // eslint-disable-line react-hooks/exhaustive-deps

  const blocs = regrouperEtapesJour(etapes, day, conflits, regrouper);

  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {jours.map((d) => {
          const n = etapes.filter((e) => etapeCouvreJour(e, d)).length;
          const dt = parseISO(d);
          return (
            <button key={d} onClick={() => setDay(d)}
              className={cn("flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 text-xs",
                d === day ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                d === today && d !== day && "border-primary")}>
              <span className="capitalize">{format(dt, "EEE", { locale: fr })}</span>
              <span className="text-lg font-bold leading-tight">{format(dt, "d")}</span>
              <span className={cn("mt-0.5 h-1.5 w-1.5 rounded-full", n ? (d === day ? "bg-primary-foreground" : "bg-primary") : "bg-transparent")} />
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold capitalize">{format(parseISO(day), "EEEE d MMMM", { locale: fr })}</h2>
        {onAdd && <Button size="sm" variant="outline" onClick={() => onAdd(day)}><Plus className="mr-1 h-4 w-4" />Ajouter</Button>}
      </div>

      {blocs.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucune étape ce jour.</p>
      ) : blocs.map((b) => {
        if (b.kind === "groupe") return (
          <EtapeGroupeCard key={b.key} groupKey={b.key} etapes={b.etapes} plage={b.plage} responsables={b.responsables}
            conflit={b.conflit} propose={b.propose} annule={b.annule} conflits={conflits} big onEtapeClick={onCardClick} />
        );
        const e = b.etape;
        const t = e.type as keyof typeof ETAPE_LABELS;
        const h = [e.heure_debut?.slice(0, 5), e.heure_fin?.slice(0, 5)].filter(Boolean).join(" – ") || e.horaire_libre;
        return (
          <button key={e.id} onClick={() => onCardClick?.(e)} disabled={!onCardClick}
            className="w-full rounded-xl border bg-card p-3 text-left shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", ETAPE_CLASSES[t])}>{ETAPE_LABELS[t] ?? e.type}</span>
              <div className="flex items-center gap-2 text-sm">
                {conflits.has(e.id) && <AlertTriangle className="h-4 w-4 text-destructive" />}
                {e.nb_personnes ? <span className="flex items-center gap-1 font-semibold"><Users className="h-4 w-4" />{e.nb_personnes}p</span> : null}
              </div>
            </div>
            <div className="mt-2 font-semibold">{e.affaire ? `${e.affaire.numero} · ${e.affaire.nom}` : "—"}</div>
            {e.affaire?.client && <div className="text-xs text-muted-foreground">{e.affaire.client}</div>}
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              {h && <div className="flex items-center gap-2"><Clock className="h-4 w-4 shrink-0" />{h}</div>}
              {e.lieu_libre && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{e.lieu_libre}</span></div>}
              {e.responsable && <div className="flex items-center gap-2"><User className="h-4 w-4 shrink-0" />{e.responsable}</div>}
              {(e.vehicule || e.immatriculation_libre) && <div className="flex items-center gap-2"><Truck className="h-4 w-4 shrink-0" />{e.vehicule?.nom ?? e.immatriculation_libre}</div>}
              {e.date_fin && e.date_fin !== e.date_debut && <div className="text-xs">Du {format(parseISO(e.date_debut), "d MMM", { locale: fr })} au {format(parseISO(e.date_fin), "d MMM", { locale: fr })}</div>}
            </div>
            {(e.note || e.commentaire_equipe) && <p className="mt-2 line-clamp-2 text-xs">{e.commentaire_equipe || e.note}</p>}
          </button>
        );
      })}
    </div>
  );
}
