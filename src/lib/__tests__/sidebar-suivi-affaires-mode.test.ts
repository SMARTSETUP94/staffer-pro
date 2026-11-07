/**
 * Garde du mode menu « suivi des affaires » (`deploiement_suivi_affaires`).
 *
 * Ce mode est activé globalement et filtre la sidebar sur une liste blanche
 * d'URL (`SA_MODE_URLS`). Une page absente de cette liste disparaît du menu
 * pour tout le monde, y compris les rôles qui y ont droit.
 *
 * Règle vérifiée ici (décision Gabin, 7 nov. 2026) :
 *   « Planning équipes » (planning logistique/terrain) doit rester visible
 *   dans le menu pour tous les ayants droit (admin, logistique, chef d'équipe).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SIDEBAR_FILE = path.resolve(__dirname, "../../components/AppSidebar.tsx");

function readSidebar(): string {
  return fs.readFileSync(SIDEBAR_FILE, "utf-8");
}

/** URLs de la liste blanche du mode « suivi des affaires ». */
function extractSaModeUrls(): string[] {
  const src = readSidebar();
  const decl = /const SA_MODE_URLS = new Set\(\[([\s\S]*?)\]\)/.exec(src);
  if (!decl) throw new Error("SA_MODE_URLS introuvable dans AppSidebar.tsx");
  return Array.from(decl[1].matchAll(/"([^"]+)"/g)).map((m) => m[1]);
}

/** Cap déclarée dans la sidebar pour une URL donnée. */
function extractSidebarCap(url: string): string | null {
  const src = readSidebar();
  const re = new RegExp(`\\burl:\\s*"${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^}]*?\\bcap:\\s*"([^"]+)"`);
  const m = re.exec(src);
  return m ? m[1] : null;
}

describe("Mode menu « suivi des affaires » — planning terrain", () => {
  it("garde « Planning équipes » (/logistique/equipes) visible dans le menu", () => {
    const urls = extractSaModeUrls();
    expect(urls).toContain("/logistique/equipes");
  });

  it("« Planning équipes » reste gated par la cap dispos.view (admin, logistique, chef d'équipe)", () => {
    expect(extractSidebarCap("/logistique/equipes")).toBe("dispos.view");
  });
});
