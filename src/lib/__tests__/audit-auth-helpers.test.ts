import { describe, it, expect } from "vitest";
import {
  AUTH_EVENT_TYPES,
  authEventLabel,
  authEventTone,
  computeInvitationStatut,
  invitationStatutLabel,
  csvEscape,
  eventsToCsv,
  presetRange,
} from "@/lib/audit-auth-helpers";

describe("audit-auth-helpers", () => {
  describe("AUTH_EVENT_TYPES", () => {
    it("contient les 10 types décidés v0.26.2", () => {
      expect(AUTH_EVENT_TYPES.length).toBe(10);
      expect(AUTH_EVENT_TYPES).toContain("login");
      expect(AUTH_EVENT_TYPES).toContain("login_failed");
      expect(AUTH_EVENT_TYPES).toContain("user_invited");
    });
  });

  describe("authEventLabel", () => {
    it("renvoie un libellé FR connu", () => {
      expect(authEventLabel("login")).toBe("Connexion");
      expect(authEventLabel("user_signedup")).toBe("Inscription");
      expect(authEventLabel("user_invited")).toBe("Invitation envoyée");
    });
    it("fallback sur la valeur brute si inconnu", () => {
      expect(authEventLabel("unknown_action")).toBe("unknown_action");
    });
    it("retourne — pour null/undefined", () => {
      expect(authEventLabel(null)).toBe("—");
      expect(authEventLabel(undefined)).toBe("—");
    });
  });

  describe("authEventTone", () => {
    it("succès pour login/signup", () => {
      expect(authEventTone("login")).toBe("success");
      expect(authEventTone("user_signedup")).toBe("success");
    });
    it("danger pour échecs", () => {
      expect(authEventTone("login_failed")).toBe("danger");
      expect(authEventTone("signup_failed")).toBe("danger");
    });
    it("info pour invitations/recovery", () => {
      expect(authEventTone("user_invited")).toBe("info");
      expect(authEventTone("user_recovery_requested")).toBe("info");
    });
    it("neutral par défaut", () => {
      expect(authEventTone("token_refreshed")).toBe("neutral");
      expect(authEventTone("inconnu")).toBe("neutral");
    });
  });

  describe("computeInvitationStatut", () => {
    const fixedNow = new Date("2026-04-29T12:00:00Z");

    it("'accepte' si last_sign_in_at non null", () => {
      expect(
        computeInvitationStatut({
          invitedAt: "2026-04-20T10:00:00Z",
          lastSignInAt: "2026-04-22T10:00:00Z",
          now: fixedNow,
        }),
      ).toBe("accepte");
    });

    it("'accepte' si status='actif'", () => {
      expect(
        computeInvitationStatut({
          invitedAt: "2026-04-20T10:00:00Z",
          lastSignInAt: null,
          status: "actif",
          now: fixedNow,
        }),
      ).toBe("accepte");
    });

    it("'expire' si invité depuis >7j et jamais connecté", () => {
      expect(
        computeInvitationStatut({
          invitedAt: "2026-04-15T10:00:00Z",
          lastSignInAt: null,
          now: fixedNow,
        }),
      ).toBe("expire");
    });

    it("'envoye' si invité récemment et jamais connecté", () => {
      expect(
        computeInvitationStatut({
          invitedAt: "2026-04-27T10:00:00Z",
          lastSignInAt: null,
          now: fixedNow,
        }),
      ).toBe("envoye");
    });

    it("'envoye' si pas d'invitedAt et jamais connecté", () => {
      expect(
        computeInvitationStatut({
          invitedAt: null,
          lastSignInAt: null,
          now: fixedNow,
        }),
      ).toBe("envoye");
    });
  });

  describe("invitationStatutLabel", () => {
    it("traduit les 3 statuts", () => {
      expect(invitationStatutLabel("envoye")).toBe("Envoyé");
      expect(invitationStatutLabel("accepte")).toBe("Accepté");
      expect(invitationStatutLabel("expire")).toBe("Expiré");
    });
  });

  describe("csvEscape", () => {
    it("retourne vide pour null/undefined", () => {
      expect(csvEscape(null)).toBe("");
      expect(csvEscape(undefined)).toBe("");
    });
    it("ne quote pas une chaîne sans caractères spéciaux", () => {
      expect(csvEscape("simple")).toBe("simple");
    });
    it("quote et échappe les guillemets internes", () => {
      expect(csvEscape('hello "world"')).toBe('"hello ""world"""');
    });
    it("quote si la chaîne contient virgule, point-virgule ou retour ligne", () => {
      expect(csvEscape("a,b")).toBe('"a,b"');
      expect(csvEscape("a;b")).toBe('"a;b"');
      expect(csvEscape("a\nb")).toBe('"a\nb"');
    });
  });

  describe("eventsToCsv", () => {
    it("génère un header + lignes correctes", () => {
      const csv = eventsToCsv([
        {
          created_at: "2026-04-29T12:00:00Z",
          action: "login",
          actor_email: "test@setup.paris",
          actor_name: "Test User",
          ip_address: "1.2.3.4",
          log_type: "account",
        },
      ]);
      const lines = csv.split("\n");
      expect(lines[0]).toBe("Date,Action,Email,Nom,IP,Type");
      expect(lines[1]).toContain("Connexion");
      expect(lines[1]).toContain("test@setup.paris");
    });

    it("renvoie juste le header si liste vide", () => {
      expect(eventsToCsv([])).toBe("Date,Action,Email,Nom,IP,Type");
    });
  });

  describe("presetRange", () => {
    const now = new Date("2026-04-29T15:00:00Z");

    it("today : from = minuit du jour", () => {
      const r = presetRange("today", now);
      expect(r.from.getHours()).toBe(0);
      expect(r.from.getMinutes()).toBe(0);
    });

    it("7d : from = now - 7 jours", () => {
      const r = presetRange("7d", now);
      const diffDays = (r.to.getTime() - r.from.getTime()) / (1000 * 60 * 60 * 24);
      expect(Math.round(diffDays)).toBe(7);
    });

    it("30d : from = now - 30 jours", () => {
      const r = presetRange("30d", now);
      const diffDays = (r.to.getTime() - r.from.getTime()) / (1000 * 60 * 60 * 24);
      expect(Math.round(diffDays)).toBe(30);
    });
  });
});
