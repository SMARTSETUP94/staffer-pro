// v0.35.x — Pré-vol : calcule l'impact d'un changement de slider/shift sur un step
// SANS appeler le serveur. Détecte 3 risques pour donner un feedback instantané au chef :
//   (a) DEBORD_LIVRAISON  — fin du step > date_fin_fab
//   (b) PIC_GLOBAL        — un jour atelier passe au-dessus du seuil PIC_ATELIER (12)
//   (c) VOLUME_INSUFFISANT — la nouvelle capacité (pers × span × h/j) ne couvre plus le besoin h
//
// Les 3 sont SOFT — on n'empêche pas le commit, on prévient simplement.

import { addDays, dateRange } from "./date-utils";
import { PIC_ATELIER } from "./types";
import type { PlanStep } from "./types";

export type ImpactKind = "debord" | "pic" | "volume";

export interface SliderImpact {
  kind: ImpactKind;
  message: string;
  /** Détail brut pour debug / tooltip */
  detail?: string;
}

interface SimulateInput {
  step: PlanStep;
  newPers?: number;
  newShift?: number;
  allSteps: PlanStep[];
  dailyLoad: Record<string, number>;
  dateFinFab: string;
}

/** Calcule (pers, span) en réancrant la fin sur l'ancienne fin (cohérent avec server.handler) */
function recomputeSpanKeepingEnd(step: PlanStep, newPers: number): { span: number; start: string } {
  const totalH = step.pers * step.h_par_jour * step.span_days;
  const newSpan = Math.max(1, Math.ceil(totalH / (newPers * step.h_par_jour)));
  const oldEnd = addDays(step.start_date, step.span_days - 1);
  const newStart = addDays(oldEnd, -(newSpan - 1));
  return { span: newSpan, start: newStart };
}

export function simulateStepChange(input: SimulateInput): SliderImpact[] {
  const { step, newPers, newShift, allSteps, dailyLoad, dateFinFab } = input;
  if (step.start_date === "TBD") return [];

  const persFinal = newPers ?? step.pers;
  let spanFinal = step.span_days;
  let startFinal = step.start_date;

  if (newPers !== undefined && newPers !== step.pers) {
    const r = recomputeSpanKeepingEnd(step, newPers);
    spanFinal = r.span;
    startFinal = r.start;
  }
  if (newShift !== undefined && newShift !== 0) {
    startFinal = addDays(startFinal, newShift);
  }

  const endFinal = addDays(startFinal, spanFinal - 1);
  const out: SliderImpact[] = [];

  // (a) débord livraison
  if (endFinal > dateFinFab) {
    const overDays = Math.round(
      (new Date(endFinal + "T00:00:00Z").getTime() -
        new Date(dateFinFab + "T00:00:00Z").getTime()) /
        86_400_000,
    );
    out.push({
      kind: "debord",
      message: `Débord livraison +${overDays}j (fin ${endFinal} > livraison ${dateFinFab})`,
    });
  }

  // (b) pic atelier — recalcule daily_load en retirant la contribution de l'ancien step et en ajoutant la nouvelle
  const oldDates = new Set(dateRange(step.start_date, step.span_days));
  const newDates = dateRange(startFinal, spanFinal);
  const persOld = step.pers;
  let maxPic = 0;
  let maxPicDate = "";
  for (const d of newDates) {
    let load = dailyLoad[d] ?? 0;
    if (oldDates.has(d)) load -= persOld;
    load += persFinal;
    if (load > maxPic) {
      maxPic = load;
      maxPicDate = d;
    }
  }
  if (maxPic > PIC_ATELIER) {
    out.push({
      kind: "pic",
      message: `Pic atelier ${maxPic} pers le ${maxPicDate} (seuil ${PIC_ATELIER})`,
    });
  }

  // (c) volume insuffisant — uniquement pertinent quand on RÉDUIT pers (pers < step.pers)
  // Le serveur réajuste span pour préserver totalH ; donc en pratique le besoin reste couvert.
  // En revanche, si l'utilisateur réduit pers ET le nouveau span sort de la fenêtre fabrication
  // (i.e. start_date < ancien dateDebutFab du plan), on alerte « volume serré ». On approxime :
  // si l'écart span_new - span_old > 50% de l'ancien span -> alerte.
  if (newPers !== undefined && newPers < step.pers) {
    const stretch = spanFinal - step.span_days;
    if (stretch > Math.max(2, Math.ceil(step.span_days * 0.5))) {
      const besoinH = step.pers * step.h_par_jour * step.span_days;
      const capa = newPers * step.h_par_jour * spanFinal;
      out.push({
        kind: "volume",
        message: `Étirement +${stretch}j : ${capa}h capacité pour ${besoinH}h besoin (binôme trop petit)`,
      });
    }
  }

  // Allusion sur la cohérence — pas de doublons
  return out;
}

/** Récap concat pour toast unique */
export function impactToastMessage(impacts: SliderImpact[]): string {
  if (impacts.length === 0) return "";
  if (impacts.length === 1) return impacts[0].message;
  return impacts.map((i) => `• ${i.message}`).join("\n");
}
