import type { Absence, AbsenceType } from "@/hooks/use-planning-data";

export const ABSENCE_LABEL: Record<AbsenceType, string> = {
  conges: "Congés",
  formation: "Formation",
  arret_maladie: "Arrêt maladie",
  rtt: "RTT",
  autre: "Autre",
};

export const ABSENCE_ICON: Record<AbsenceType, string> = {
  conges: "🌴",
  formation: "🎓",
  arret_maladie: "🤒",
  rtt: "💤",
  autre: "📌",
};

/**
 * Renvoie la 1ʳᵉ absence "active" pour un employé sur une date+slot donné.
 * Une absence couvre toujours JOURNEE par défaut si demi_journee est null.
 */
export function findAbsence(
  absences: Absence[],
  employeId: string,
  dayStr: string,
  slot: "AM" | "PM" | "JOURNEE",
): Absence | null {
  for (const a of absences) {
    if (a.employe_id !== employeId) continue;
    if (dayStr < a.date_debut || dayStr > a.date_fin) continue;
    // demi_journee null = toute la période → couvre tous les slots
    if (a.demi_journee == null) return a;
    if (a.demi_journee === "JOURNEE") return a;
    if (slot === "JOURNEE") return a; // un slot AM/PM bloque une demande JOURNEE
    if (a.demi_journee === slot) return a;
  }
  return null;
}

/**
 * Renvoie toutes les absences couvrant ce jour pour cet employé (tous slots).
 */
export function absencesForDay(
  absences: Absence[],
  employeId: string,
  dayStr: string,
): Absence[] {
  return absences.filter(
    (a) => a.employe_id === employeId && dayStr >= a.date_debut && dayStr <= a.date_fin,
  );
}
