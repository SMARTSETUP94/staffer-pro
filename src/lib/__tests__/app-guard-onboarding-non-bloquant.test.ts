/**
 * Garde-fou : l'AppGuard (src/routes/_app.tsx) ne doit JAMAIS forcer de
 * redirection vers /onboarding. La complétion du profil est optionnelle
 * (bandeau ProfileIncompleteBanner) — la redirection forcée bloquait des
 * connexions, notamment sur l'écran atelier. /onboarding reste accessible
 * manuellement.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const APP_GUARD = "src/routes/_app.tsx";

describe("onboarding non bloquant", () => {
  it("AppGuard ne redirige plus vers /onboarding", () => {
    const src = readFileSync(APP_GUARD, "utf8");
    expect(
      src,
      "Ne pas réintroduire shouldRedirectToOnboarding dans AppGuard — l'onboarding est optionnel.",
    ).not.toMatch(/shouldRedirectToOnboarding/);
    expect(
      src,
      "Ne pas réintroduire navigate({ to: \"/onboarding\" }) dans AppGuard.",
    ).not.toMatch(/to:\s*["']\/onboarding["']/);
  });
});
