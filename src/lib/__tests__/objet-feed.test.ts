import { describe, it, expect } from "vitest";
import {
  mergeObjetFeed,
  dedupeObjetFeed,
  filterObjetFeed,
  groupPhotosByEtape,
  planTechniqueStatut,
  normalizePlanUrl,
  type RawPhoto,
} from "@/lib/objet-feed";

const photo = (over: Partial<RawPhoto>): RawPhoto => ({
  id: "p1",
  storage_path: "a/b.webp",
  thumb_path: null,
  commentaire: null,
  etape_id: null,
  uploaded_by: null,
  uploaded_at: "2026-01-01T10:00:00Z",
  width: null,
  height: null,
  size_bytes: null,
  ...over,
});

describe("mergeObjetFeed", () => {
  it("fusionne et trie du plus récent au plus ancien", () => {
    const feed = mergeObjetFeed({
      events: [
        {
          id: "e1",
          event_type: "etape_validee",
          occurred_at: "2026-01-02T08:00:00Z",
          actor_id: null,
          actor_label: "Alice",
          metier_id: null,
          etape_id: null,
          payload: null,
        },
      ],
      commentaires: [
        {
          id: "c1",
          content: "RAS",
          author_id: null,
          etape_id: null,
          created_at: "2026-01-03T08:00:00Z",
        },
      ],
      photos: [photo({ id: "p1", uploaded_at: "2026-01-01T08:00:00Z" })],
    });
    expect(feed.map((e) => e.key)).toEqual(["commentaire:c1", "event:e1", "photo:p1"]);
    expect(feed[0]!.kind).toBe("commentaire");
  });

  it("tolère une date invalide sans planter", () => {
    const feed = mergeObjetFeed({
      events: [],
      commentaires: [],
      photos: [photo({ uploaded_at: "pas-une-date" })],
    });
    expect(feed).toHaveLength(1);
  });
});

describe("dedupeObjetFeed", () => {
  it("masque l'événement auto-loggé quand la ressource est déjà dans le fil", () => {
    const feed = mergeObjetFeed({
      events: [
        {
          id: "e1",
          event_type: "commentaire",
          occurred_at: "2026-01-03T08:00:00Z",
          actor_id: null,
          actor_label: null,
          metier_id: null,
          etape_id: null,
          payload: null,
        },
      ],
      commentaires: [
        {
          id: "c1",
          content: "RAS",
          author_id: null,
          etape_id: null,
          created_at: "2026-01-03T08:00:00Z",
        },
      ],
      photos: [],
    });
    expect(dedupeObjetFeed(feed).map((e) => e.key)).toEqual(["commentaire:c1"]);
  });
});

describe("filterObjetFeed", () => {
  const feed = mergeObjetFeed({
    events: [
      {
        id: "e1",
        event_type: "plan_publie",
        occurred_at: "2026-01-02T08:00:00Z",
        actor_id: null,
        actor_label: null,
        metier_id: null,
        etape_id: null,
        payload: { mode: "lien" },
      },
    ],
    commentaires: [
      { id: "c1", content: "x", author_id: null, etape_id: null, created_at: "2026-01-01T08:00:00Z" },
    ],
    photos: [photo({})],
  });

  it("ne filtre rien avec 'all'", () => {
    expect(filterObjetFeed(feed, "all")).toHaveLength(3);
  });
  it("filtre sur le plan", () => {
    expect(filterObjetFeed(feed, "plan").map((e) => e.eventType)).toEqual(["plan_publie"]);
  });
  it("filtre sur les photos", () => {
    expect(filterObjetFeed(feed, "photos").map((e) => e.kind)).toEqual(["photo"]);
  });
});

describe("groupPhotosByEtape", () => {
  it("groupe par étape et place les photos sans étape en dernier", () => {
    const groups = groupPhotosByEtape([
      photo({ id: "a", etape_id: null }),
      photo({ id: "b", etape_id: "et-1" }),
      photo({ id: "c", etape_id: "et-1", uploaded_at: "2026-02-01T10:00:00Z" }),
    ]);
    expect(groups.map((g) => g.etapeId)).toEqual(["et-1", null]);
    expect(groups[0]!.photos.map((p) => p.id)).toEqual(["c", "b"]);
  });
});

describe("planTechniqueStatut", () => {
  it("signale un plan non publié sans bloquer", () => {
    const s = planTechniqueStatut(null, false);
    expect(s.publie).toBe(false);
    expect(s.mode).toBeNull();
  });
  it("détecte le lien externe", () => {
    const s = planTechniqueStatut(
      { plan_url: "https://teams.microsoft.com/x", plan_publie_le: "2026-01-01", plan_publie_par: null },
      false,
    );
    expect(s.mode).toBe("lien");
  });
  it("détecte le PDF déposé", () => {
    const s = planTechniqueStatut({ plan_url: null, plan_publie_le: null, plan_publie_par: null }, true);
    expect(s.mode).toBe("document");
  });
});

describe("normalizePlanUrl", () => {
  it("ajoute le schéma manquant", () => {
    expect(normalizePlanUrl("teams.microsoft.com/plan")).toBe("https://teams.microsoft.com/plan");
  });
  it("rejette une saisie vide ou invalide", () => {
    expect(normalizePlanUrl("   ")).toBeNull();
    expect(normalizePlanUrl("pas-une-url")).toBeNull();
    expect(normalizePlanUrl("javascript:alert(1)")).toBeNull();
  });
});
