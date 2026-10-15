import { describe, it, expect } from "vitest";
import { extractOriginalSender } from "@/lib/forwarded-email";

describe("extractOriginalSender", () => {
  it("retourne null sans corps", () => {
    expect(extractOriginalSender(null)).toBeNull();
    expect(extractOriginalSender("Bonjour, voici notre demande.")).toBeNull();
  });

  it("détecte l'expéditeur d'origine d'un transfert Outlook français", () => {
    const body = [
      "Merci de traiter cette demande.",
      "",
      "-----Message d'origine-----",
      "De : Marie Curie <marie.curie@client-exemple.fr>",
      "Envoyé : jeudi 10 octobre 2026 09:12",
      "À : Gabin <gabin@setup.paris>",
      "Objet : Demande de devis scénographie",
      "",
      "Bonjour, nous aurions besoin...",
    ].join("\n");
    const r = extractOriginalSender(body);
    expect(r?.email).toBe("marie.curie@client-exemple.fr");
    expect(r?.name).toBe("Marie Curie");
  });

  it("prend le bloc « From: » le plus bas (transferts imbriqués)", () => {
    const body = [
      "From: Collegue <collegue@setup.paris>",
      "De : Premier Client <premier@vrai-client.com>",
      "From: Second Client <second@autre-client.com>",
    ].join("\n");
    // Le bloc le plus bas = message d'origine.
    expect(extractOriginalSender(body)?.email).toBe("second@autre-client.com");
  });

  it("gère le HTML (bloc De dans du markup)", () => {
    const body =
      "<div>Transfert :</div><div>De : <b>Jean Dupont</b> &lt;jean@dupont.fr&gt;</div><p>Corps…</p>";
    const r = extractOriginalSender(body);
    expect(r?.email).toBe("jean@dupont.fr");
    expect(r?.name).toBe("Jean Dupont");
  });

  it("ligne « De : » sans nom → email seul", () => {
    const r = extractOriginalSender("De : contact@fonds-de-dotation.fr\nObjet : x");
    expect(r?.email).toBe("contact@fonds-de-dotation.fr");
    expect(r?.name).toBeNull();
  });
});
