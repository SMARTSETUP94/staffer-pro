/**
 * Garde de cohérence : un item de sidebar avec `cap: "X"` doit pointer vers
 * une route dont le `beforeLoad` appelle `requireCapability("X")` — sinon
 * l'utilisateur voit l'item, clique, et se prend un redirect "/" (puis
 * `resolvePostLoginTarget()` → `/aujourdhui`) parce que la cap fine de la
 * route ne fait pas partie de ses caps.
 *
 * Le test détecte 3 catégories d'erreur :
 *   1. `cap` sidebar !== `cap` route (mismatch direct)
 *   2. sidebar déclare un tableau `cap: ["a","b"]` mais AUCUN n'est la cap route
 *   3. sidebar pointe vers une URL dont la route n'existe pas
 *
 * Les routes sans `requireCapability` (page publique ou stub redirect) ne
 * sont PAS vérifiées : l'item est simplement traité comme "sans gating
 * route-level", ce qui est légitime (ex: `/aujourdhui`, stubs `/dashboard`).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROUTES_DIR = path.resolve(__dirname, "../../routes");
const SIDEBAR_FILE = path.resolve(__dirname, "../../components/AppSidebar.tsx");

type SidebarItem = { url: string; caps: string[] };

/** Extrait tous les `{ url: "/x", ..., cap: "y" | ["y","z"] }` de AppSidebar. */
function extractSidebarItems(): SidebarItem[] {
  const src = fs.readFileSync(SIDEBAR_FILE, "utf-8");
  // Regex tolérant : capte url puis cap (scalar ou array) dans la même décl objet.
  const re =
    /\burl:\s*"([^"]+)"[^}]*?\bcap:\s*(?:"([^"]+)"|\[\s*([^\]]+?)\s*\])/g;
  const items: SidebarItem[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const url = m[1];
    if (m[2]) {
      items.push({ url, caps: [m[2]] });
    } else if (m[3]) {
      const caps = m[3]
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
      items.push({ url, caps });
    }
  }
  return items;
}

/**
 * Convertit "/admin/utilisateurs" → liste des chemins candidats :
 *  - "_app.admin.utilisateurs.tsx"        (route feuille)
 *  - "_app.admin.utilisateurs.index.tsx"  (route layout + index)
 * Renvoie le premier qui existe, ou null.
 */
function resolveRouteFile(url: string): string | null {
  const seg = url.replace(/^\//, "").split("/").filter(Boolean).join(".");
  const candidates = [`_app.${seg}.tsx`, `_app.${seg}.index.tsx`];
  for (const c of candidates) {
    const p = path.join(ROUTES_DIR, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}


/** Renvoie la cap requise par le beforeLoad de la route, ou null si aucune. */
function extractRouteRequiredCap(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const src = fs.readFileSync(filePath, "utf-8");
  // Cherche le premier requireCapability("...") (les routes n'en ont qu'un).
  const m = /requireCapability\(\s*"([^"]+)"\s*\)/.exec(src);
  return m ? m[1] : null;
}

describe("Sidebar ↔ route capability coherence", () => {
  it("each sidebar item points to an existing route file", () => {
    const items = extractSidebarItems();
    expect(items.length).toBeGreaterThan(0);
    const missing: string[] = [];
    for (const { url } of items) {
      if (url.includes("$")) continue; // URL dynamique, skip
      const file = path.join(ROUTES_DIR, urlToRouteFile(url));
      if (!fs.existsSync(file)) {
        missing.push(`  • ${url}  →  ${urlToRouteFile(url)} introuvable`);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `Sidebar pointe vers ${missing.length} URL(s) sans route correspondante :\n${missing.join("\n")}`,
      );
    }
  });

  it("each sidebar item with a cap matches its route's requireCapability", () => {
    const items = extractSidebarItems();
    const mismatches: string[] = [];

    for (const { url, caps } of items) {
      if (url.includes("$")) continue;
      const file = path.join(ROUTES_DIR, urlToRouteFile(url));
      const required = extractRouteRequiredCap(file);
      // Pas de requireCapability route-side → rien à vérifier (legit).
      if (!required) continue;
      // Sidebar OK si la cap route fait partie des caps déclarées (OR logique).
      if (!caps.includes(required)) {
        mismatches.push(
          `  • ${url}\n      sidebar cap = [${caps.map((c) => `"${c}"`).join(", ")}]\n      route requireCapability = "${required}"  (${urlToRouteFile(url)})`,
        );
      }
    }

    if (mismatches.length > 0) {
      throw new Error(
        `${mismatches.length} item(s) de sidebar visibles avec une cap qui ne donne PAS accès à la route cible.\n` +
          `→ Symptôme utilisateur : l'item s'affiche mais cliquer redirige vers /aujourdhui.\n` +
          `→ Fix : aligner SOIT la cap dans AppSidebar.tsx, SOIT requireCapability() dans la route.\n\n` +
          mismatches.join("\n\n"),
      );
    }
  });
});
