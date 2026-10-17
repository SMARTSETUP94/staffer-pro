// Recherche web via Firecrawl (connexion directe, clé fc-).
// Serveur uniquement : ne jamais importer depuis un composant.

type FirecrawlSearchResult = {
  url?: string;
  title?: string;
  description?: string;
  markdown?: string;
};

export async function firecrawlSearch(
  query: string,
  options?: { limit?: number },
): Promise<{ results: FirecrawlSearchResult[]; error: string | null }> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return { results: [], error: "Recherche web non configurée." };
  try {
    const response = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: options?.limit ?? 5,
        scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
      }),
    });
    const data = (await response.json().catch(() => null)) as {
      success?: boolean;
      error?: string;
      data?: { web?: FirecrawlSearchResult[] } | FirecrawlSearchResult[];
    } | null;
    if (!response.ok) {
      return { results: [], error: data?.error ?? `Recherche web indisponible (${response.status}).` };
    }
    const raw = Array.isArray(data?.data) ? data?.data : (data?.data as { web?: FirecrawlSearchResult[] } | undefined)?.web;
    return { results: (raw ?? []).filter((r) => r && typeof r.url === "string"), error: null };
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : "Recherche web indisponible." };
  }
}
