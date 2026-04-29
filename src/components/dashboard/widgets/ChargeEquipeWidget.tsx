/**
 * v0.26.0 — Wrapper widget pour le bloc Charge équipe existant.
 * Calcule la semaine en cours à monter.
 */
import { ChargeEquipeBloc } from "@/components/dashboard/ChargeEquipeBloc";

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - day + 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  s.setDate(s.getDate() + 6);
  s.setHours(23, 59, 59, 999);
  return s;
}

export function ChargeEquipeWidget() {
  const today = new Date();
  const weekStart = startOfWeek(today).toISOString().slice(0, 10);
  const weekEnd = endOfWeek(today).toISOString().slice(0, 10);
  return <ChargeEquipeBloc weekStart={weekStart} weekEnd={weekEnd} />;
}
