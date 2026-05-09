import { describe, it, expect } from "vitest";
import {
  weekIndex,
  dateIndex,
  getMondayOfWeek,
  getFirstOfMonth,
  isBirthdayToday,
  toIsoDate,
} from "../dashboard-fun-helpers";
import { getSaintsForDate, normalizePrenom } from "../saints-fr";


describe("dashboard-fun-helpers", () => {
  it("weekIndex est stable sur 7 jours et incrémente le lundi suivant", () => {
    const monday = new Date(2026, 4, 4); // lundi 4 mai 2026
    const sunday = new Date(2026, 4, 10);
    const nextMonday = new Date(2026, 4, 11);
    expect(weekIndex(monday)).toBe(weekIndex(sunday));
    expect(weekIndex(nextMonday)).toBe(weekIndex(monday) + 1);
  });

  it("dateIndex change tous les jours", () => {
    const a = new Date(2026, 4, 5);
    const b = new Date(2026, 4, 6);
    expect(dateIndex(b)).toBe(dateIndex(a) + 1);
  });

  it("getMondayOfWeek renvoie un lundi", () => {
    const w = new Date(2026, 4, 7); // jeudi
    expect(getMondayOfWeek(w).getDay()).toBe(1);
  });

  it("getFirstOfMonth renvoie le 1er", () => {
    expect(getFirstOfMonth(new Date(2026, 4, 17)).getDate()).toBe(1);
  });

  it("isBirthdayToday match mois+jour", () => {
    expect(isBirthdayToday("1990-05-04", new Date(2026, 4, 4))).toBe(true);
    expect(isBirthdayToday("1990-05-05", new Date(2026, 4, 4))).toBe(false);
    expect(isBirthdayToday(null, new Date())).toBe(false);
  });

  it("toIsoDate format YYYY-MM-DD", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("rotation hebdo : weekIndex modulo N reste dans [0, N)", () => {
    const N = 15;
    const idx = weekIndex(new Date(2026, 4, 4)) % N;
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(N);
  });

  it("rotation journalière : dateIndex modulo N reste dans [0, N)", () => {
    const N = 20;
    const idx = dateIndex(new Date(2026, 4, 9)) % N;
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(N);
  });

  it("rotations sont déterministes (même date → même index)", () => {
    const d = new Date(2026, 4, 9);
    expect(dateIndex(d) % 20).toBe(dateIndex(new Date(2026, 4, 9)) % 20);
    expect(weekIndex(d) % 15).toBe(weekIndex(new Date(2026, 4, 9)) % 15);
  });
});

describe("saints-fr", () => {
  it("normalizePrenom enlève accents et casse", () => {
    expect(normalizePrenom("Hélène")).toBe("helene");
    expect(normalizePrenom("  JEAN  ")).toBe("jean");
  });

  it("getSaintsForDate trouve un saint connu", () => {
    expect(getSaintsForDate(new Date(2026, 3, 25))).toContain("marc");
    expect(getSaintsForDate(new Date(2026, 1, 14))).toContain("valentin");
  });

  it("getSaintsForDate retourne [] sur une date inconnue", () => {
    const r = getSaintsForDate(new Date(2026, 1, 17));
    expect(Array.isArray(r)).toBe(true);
  });
});

import { pickDailyQuizIds } from "../../components/dashboard/widgets/QuizDuJourWidget";

describe("pickDailyQuizIds", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `quiz-${String(i).padStart(2, "0")}`);

  it("renvoie 5 IDs distincts par jour", () => {
    const picked = pickDailyQuizIds(ids, new Date(2026, 4, 9));
    expect(picked).toHaveLength(5);
    expect(new Set(picked).size).toBe(5);
  });

  it("déterministe : même date → même résultat (tous les utilisateurs voient les mêmes quiz)", () => {
    const a = pickDailyQuizIds(ids, new Date(2026, 4, 9));
    const b = pickDailyQuizIds(ids, new Date(2026, 4, 9));
    expect(a).toEqual(b);
  });

  it("change le lendemain", () => {
    const a = pickDailyQuizIds(ids, new Date(2026, 4, 9));
    const b = pickDailyQuizIds(ids, new Date(2026, 4, 10));
    expect(a).not.toEqual(b);
  });

  it("renvoie tableau vide si aucun quiz", () => {
    expect(pickDailyQuizIds([], new Date())).toEqual([]);
  });

  it("renvoie nb dispo si moins de 5 quiz en base", () => {
    const small = ["a", "b", "c"];
    const picked = pickDailyQuizIds(small, new Date(2026, 4, 9));
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });
});
