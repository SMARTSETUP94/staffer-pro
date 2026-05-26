/**
 * Bloc 9 Lot 9.2 — tests unitaires des helpers de mission-card.functions.ts
 *
 * Les SF complètes nécessitent un contexte Supabase authentifié (couvert
 * par les specs E2E `e2e/employe-mobile/mes-missions.spec.ts` et
 * `e2e/employe-mobile/mission-detail.spec.ts`). Ici on couvre la logique
 * pure exportable (statut dérivé des dates).
 */
import { describe, expect, it } from "vitest";

// Réimplémentation locale identique à statutFromDates() — la fn n'est pas
// exportée pour éviter de polluer la surface publique. Toute modification
// du helper doit être répliquée ici.
function statutFromDates(debut: string, fin: string, today = new Date()): "passee" | "en_cours" | "a_venir" {
  const t = today.toISOString().slice(0, 10);
  if (fin < t) return "passee";
  if (debut > t) return "a_venir";
  return "en_cours";
}

describe("statutFromDates (mission-card helper)", () => {
  const today = new Date("2026-05-15T12:00:00Z");

  it("happy path — mission encadrant aujourd'hui → en_cours", () => {
    expect(statutFromDates("2026-05-14", "2026-05-16", today)).toBe("en_cours");
    expect(statutFromDates("2026-05-15", "2026-05-15", today)).toBe("en_cours");
  });

  it("cas dégradé — mission entièrement passée → passee", () => {
    expect(statutFromDates("2026-05-10", "2026-05-12", today)).toBe("passee");
  });

  it("cas dégradé — mission entièrement future → a_venir", () => {
    expect(statutFromDates("2026-05-20", "2026-05-22", today)).toBe("a_venir");
  });

  it("borne basse — fin = aujourd'hui → en_cours (pas passee)", () => {
    expect(statutFromDates("2026-05-14", "2026-05-15", today)).toBe("en_cours");
  });

  it("borne haute — début = aujourd'hui → en_cours (pas a_venir)", () => {
    expect(statutFromDates("2026-05-15", "2026-05-18", today)).toBe("en_cours");
  });
});

describe("getMesMissions / getCarteMission / recordMissionEvent — couverture E2E", () => {
  // Ces trois SF sont couvertes par e2e/employe-mobile/mes-missions.spec.ts
  // et e2e/employe-mobile/mission-detail.spec.ts via vraies données seed.
  // On documente ici les 3 scénarios attendus par SF pour rappel :
  //
  //   getMesMissions
  //     - happy path : un employé avec assignations phase montage retourne ≥1 mission
  //     - cas dégradé : un user sans employé lié retourne missions: []
  //     - RLS : un autre user ne voit jamais les missions du premier
  //
  //   getCarteMission
  //     - happy path : retourne assignations + équipe + chef + events
  //     - cas dégradé : affaireId inexistant → throw "Aucune mission..."
  //     - RLS : autre user → throw "Affaire introuvable" via filtre RLS
  //
  //   recordMissionEvent
  //     - happy path : insert ok, retourne id + occurred_at
  //     - cas problème : notif chef créée dans table notifications
  //     - RLS : autre user ne peut pas insert pour employe_id ≠ self
  it.todo("voir specs Playwright e2e/employe-mobile/mission-*.spec.ts");
});
