import { describe, it, expect } from "vitest";
import { computeHeuresFromTimes, parseTime, formatMinutes } from "../heures-calculator";

describe("parseTime", () => {
  it("parse HH:mm valides", () => {
    expect(parseTime("08:00")).toBe(480);
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("23:59")).toBe(23 * 60 + 59);
    expect(parseTime("9:30")).toBe(9 * 60 + 30);
  });

  it("rejette les invalides", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(parseTime("abc")).toBeNull();
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("12:60")).toBeNull();
  });
});

describe("computeHeuresFromTimes — shift de jour", () => {
  it("calcul simple sans pause : 8h-17h = 9h", () => {
    const r = computeHeuresFromTimes("08:00", "17:00", 0);
    expect(r).not.toBeNull();
    expect(r!.heuresReelles).toBe(9);
    expect(r!.heuresNuit).toBe(0);
  });

  it("avec pause déjeuner 1h : 8h-17h - 60min = 8h", () => {
    const r = computeHeuresFromTimes("08:00", "17:00", 60);
    expect(r!.heuresReelles).toBe(8);
    expect(r!.heuresNuit).toBe(0);
  });

  it("pause de 30 min : 9h-12h30 - 30min = 3h", () => {
    const r = computeHeuresFromTimes("09:00", "12:30", 30);
    expect(r!.heuresReelles).toBe(3);
  });

  it("pause clampée à la durée brute (impossible de descendre sous 0)", () => {
    const r = computeHeuresFromTimes("09:00", "10:00", 120); // 1h shift, 2h pause
    expect(r!.heuresReelles).toBe(0);
  });
});

describe("computeHeuresFromTimes — shift de nuit (overnight)", () => {
  it("20h → 04h sans pause = 8h dont 4h de nuit", () => {
    const r = computeHeuresFromTimes("20:00", "04:00", 0);
    expect(r).not.toBeNull();
    expect(r!.heuresReelles).toBe(8);
    expect(r!.heuresNuit).toBe(4); // 00h-04h
  });

  it("22h → 06h = 8h dont 6h de nuit (00h-06h)", () => {
    const r = computeHeuresFromTimes("22:00", "06:00", 0);
    expect(r!.heuresReelles).toBe(8);
    expect(r!.heuresNuit).toBe(6);
  });

  it("23h → 02h = 3h dont 2h de nuit", () => {
    const r = computeHeuresFromTimes("23:00", "02:00", 0);
    expect(r!.heuresReelles).toBe(3);
    expect(r!.heuresNuit).toBe(2);
  });

  it("18h → 03h avec pause 30min = 8h30 dont 3h de nuit", () => {
    const r = computeHeuresFromTimes("18:00", "03:00", 30);
    expect(r!.heuresReelles).toBe(8.5);
    expect(r!.heuresNuit).toBe(3); // 00h-03h
  });

  it("00h → 05h (full nuit) = 5h dont 5h de nuit", () => {
    const r = computeHeuresFromTimes("00:00", "05:00", 0);
    expect(r!.heuresReelles).toBe(5);
    expect(r!.heuresNuit).toBe(5);
  });

  it("03h → 09h = 6h dont 3h de nuit (03h-06h)", () => {
    const r = computeHeuresFromTimes("03:00", "09:00", 0);
    expect(r!.heuresReelles).toBe(6);
    expect(r!.heuresNuit).toBe(3);
  });
});

describe("computeHeuresFromTimes — cas limites", () => {
  it("retourne null si une heure est manquante", () => {
    expect(computeHeuresFromTimes(null, "17:00", 0)).toBeNull();
    expect(computeHeuresFromTimes("08:00", null, 0)).toBeNull();
    expect(computeHeuresFromTimes("", "", 0)).toBeNull();
  });

  it("retourne null si format invalide", () => {
    expect(computeHeuresFromTimes("abc", "17:00", 0)).toBeNull();
  });

  it("fin == début → considéré comme 24h (shift complet)", () => {
    const r = computeHeuresFromTimes("08:00", "08:00", 0);
    expect(r!.heuresReelles).toBe(24);
    expect(r!.heuresNuit).toBe(6); // 00-06h compris dans 24h
  });

  it("pause négative ignorée (clamp à 0)", () => {
    const r = computeHeuresFromTimes("08:00", "17:00", -30);
    expect(r!.heuresReelles).toBe(9);
  });
});

describe("formatMinutes", () => {
  it("formate correctement", () => {
    expect(formatMinutes(0)).toBe("00:00");
    expect(formatMinutes(60)).toBe("01:00");
    expect(formatMinutes(90)).toBe("01:30");
    expect(formatMinutes(60 * 23 + 59)).toBe("23:59");
  });
});
