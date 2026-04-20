/**
 * Wrapper léger autour de l'API publique Nominatim (OpenStreetMap).
 * Respect du rate-limit officiel : 1 requête / seconde max.
 *
 * IMPORTANT : selon la politique d'usage Nominatim, un User-Agent est
 * requis. Côté navigateur le header est imposé par le navigateur, donc on
 * n'a pas à le passer manuellement, mais on évite les rafales en
 * sérialisant les requêtes.
 */

export interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  place_id: number;
}

let lastCallAt = 0;
const MIN_INTERVAL_MS = 1100;

async function rateLimit() {
  const now = Date.now();
  const wait = Math.max(0, lastCallAt + MIN_INTERVAL_MS - now);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastCallAt = Date.now();
}

export async function searchAddress(
  query: string,
  signal?: AbortSignal,
): Promise<NominatimResult[]> {
  if (query.trim().length < 3) return [];
  await rateLimit();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "fr");
  url.searchParams.set("addressdetails", "0");
  try {
    const res = await fetch(url.toString(), {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as NominatimResult[];
    return json;
  } catch {
    return [];
  }
}

export async function geocodeOnce(query: string): Promise<{ lat: number; lon: number } | null> {
  const results = await searchAddress(query);
  if (results.length === 0) return null;
  return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
}
