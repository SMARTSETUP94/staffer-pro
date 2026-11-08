import { describe, expect, it } from "vitest";
import { verifierLogo, verifierSvg, LOGO_MAX_BYTES } from "../logo-image";
import { champsPdfManquants } from "../pdf-avertissements";
import type { DevisClient } from "../pdf-client";
describe("logo entreprise", () => {
  it("accepte PNG JPG SVG", () => { for (const nom of ["logo.png", "logo.jpg", "logo.svg"]) expect(() => verifierLogo(nom, 100)).not.toThrow(); });
  it("refuse un autre format", () => { expect(() => verifierLogo("logo.html", 100)).toThrow(); });
  it("borne le poids à 5 Mo", () => { expect(() => verifierLogo("logo.png", LOGO_MAX_BYTES + 1)).toThrow(); });
  it("refuse scripts et ressources externes SVG", () => { for (const svg of ['<svg><script/></svg>', '<svg><image href="https://example.com/a"/></svg>', '<svg onload="alert(1)"></svg>']) expect(() => verifierSvg(svg)).toThrow(); });
});
describe("avertissements PDF", () => {
  it("liste les cinq informations manquantes", () => { expect(champsPdfManquants({} as DevisClient)).toEqual(["Signataire nommé et email", "Logo", "IBAN", "BIC", "CGV"]); });
  it("ne signale rien quand tout est rempli", () => { expect(champsPdfManquants({ signataire: { nom: "Prénom Nom", email: "nom@example.test" }, logo_storage_path: "entreprise-logo/image.png", mentions_legales: { iban: "test", bic: "test" }, cgv: "Conditions" } as DevisClient)).toEqual([]); });
});