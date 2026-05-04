// v0.39.2 — Greedy allocation utilities for nominative staffing (Vue 3 + bulk affaire).
//
// Règle : un ordre de priorité sur N personnes (P1..Pn). Pour chaque jour de la
// fenêtre, on remplit la capacité (nb_pers_cible) en prenant les premières
// personnes disponibles (non absentes ce jour-là). Garantit qu'on ne dépasse
// JAMAIS la capacité quotidienne, même si plus de N personnes ont été
// pré-sélectionnées.

export interface Person {
  id: string;
  /** Tier 1 (Principal) > 2 (Secondaire) > 3 (Découverte) > 4 (Indispo). */
  tier?: 1 | 2 | 3 | 4;
}

export interface Availability {
  /** Map<personId, Set<date ISO string>> des jours OÙ la personne EST absente. */
  absentByPerson: Map<string, Set<string>>;
}

export interface CapacityByDay {
  /** Map<date ISO, nb pers cible ce jour>. Manquant = 0. */
  cibleByDay: Map<string, number>;
}

export interface GreedyAssignment {
  personId: string;
  date: string;
}

export interface GreedyResult {
  assignments: GreedyAssignment[];
  /** Personnes-jours manquants (capacité non remplie ce jour). */
  shortfallByDay: Map<string, number>;
  /** Personnes pré-sélectionnées mais jamais utilisées. */
  unusedPersonIds: string[];
}

/**
 * Trie un tableau de personnes par tier croissant (P1 → P4), stable.
 * Utile pour le bouton "Re-trier par tier".
 */
export function sortByTier<T extends Person>(persons: ReadonlyArray<T>): T[] {
  return [...persons].sort((a, b) => (a.tier ?? 4) - (b.tier ?? 4));
}

/**
 * Allocation greedy : pour chaque jour, prend les personnes dans l'ordre fourni
 * jusqu'à atteindre la capacité.
 *
 * @param orderedPersons liste ordonnée P1..Pn (ordre = priorité absolue)
 * @param days jours ouvrés dans la fenêtre, ordonnés
 * @param capacity capacité par jour
 * @param availability absences par personne
 */
export function greedyAllocate(
  orderedPersons: ReadonlyArray<Person>,
  days: ReadonlyArray<string>,
  capacity: CapacityByDay,
  availability: Availability,
): GreedyResult {
  const assignments: GreedyAssignment[] = [];
  const shortfallByDay = new Map<string, number>();
  const usedPersons = new Set<string>();

  for (const date of days) {
    const cible = capacity.cibleByDay.get(date) ?? 0;
    if (cible <= 0) continue;
    let remaining = cible;
    for (const person of orderedPersons) {
      if (remaining === 0) break;
      const absent = availability.absentByPerson.get(person.id);
      if (absent && absent.has(date)) continue;
      assignments.push({ personId: person.id, date });
      usedPersons.add(person.id);
      remaining -= 1;
    }
    if (remaining > 0) shortfallByDay.set(date, remaining);
  }

  const unusedPersonIds = orderedPersons
    .filter((p) => !usedPersons.has(p.id))
    .map((p) => p.id);

  return { assignments, shortfallByDay, unusedPersonIds };
}

/**
 * Compteur "X / Y pers-j alloués" pour l'UI live.
 */
export function summarizeAllocation(
  result: GreedyResult,
  capacity: CapacityByDay,
): { allocated: number; target: number; pct: number } {
  const allocated = result.assignments.length;
  let target = 0;
  for (const v of capacity.cibleByDay.values()) target += v;
  const pct = target > 0 ? Math.round((allocated / target) * 100) : 0;
  return { allocated, target, pct };
}
