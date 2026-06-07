/**
 * Persistance Marges chantiers — Phase 5 : Supabase = source de vérité, localStorage = cache.
 *
 * - `loadAppData(userId)` : tente Supabase, fallback localStorage si offline / erreur.
 *   Migration automatique localStorage → Supabase au 1er load post-Phase 5.
 * - `saveAppData(userId, data)` : upsert Supabase + sync cache localStorage.
 * - Les helpers JSON download/restore restent comme filet externe.
 *
 * Clé localStorage (cache) : `margeChantierApp_v1_<userId>`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AppData } from "./engine";
import { emptyApp } from "./engine";

const PREFIX = "margeChantierApp_v1_";

function mergeWithEmpty(parsed: Partial<AppData> | null | undefined): AppData {
  const base = emptyApp();
  if (!parsed) return base;
  return {
    ...base,
    ...parsed,
    meta: { ...base.meta, ...(parsed.meta ?? {}) },
  };
}

function loadFromLocalStorage(userId: string): AppData {
  try {
    const raw = localStorage.getItem(PREFIX + userId);
    if (!raw) return emptyApp();
    return mergeWithEmpty(JSON.parse(raw) as Partial<AppData>);
  } catch {
    return emptyApp();
  }
}

function saveToLocalStorage(userId: string, data: AppData): void {
  try {
    localStorage.setItem(PREFIX + userId, JSON.stringify(data));
  } catch (e) {
    console.warn("[marge-chantier] localStorage write failed (quota?):", e);
  }
}

function hasRealData(data: AppData): boolean {
  return (
    (data.rh?.length ?? 0) > 0 ||
    (data.devis?.length ?? 0) > 0 ||
    (data.heures?.length ?? 0) > 0 ||
    (data.registre?.length ?? 0) > 0
  );
}

export class MargeChantierSyncError extends Error {
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
  constructor(msg: string, opts: { code?: string; details?: string; hint?: string; status?: number } = {}) {
    super(msg);
    this.name = "MargeChantierSyncError";
    Object.assign(this, opts);
  }
}

function toSyncError(e: unknown, fallback: string): MargeChantierSyncError {
  if (e instanceof MargeChantierSyncError) return e;
  const anyE = e as { message?: string; code?: string; details?: string; hint?: string; status?: number } | null;
  return new MargeChantierSyncError(anyE?.message || fallback, {
    code: anyE?.code,
    details: anyE?.details,
    hint: anyE?.hint,
    status: anyE?.status,
  });
}

/**
 * Nettoie en profondeur toutes les chaînes pour retirer les caractères que
 * Postgres JSONB refuse :
 *  - `\u0000` (NUL) — interdit dans `jsonb`
 *  - lone surrogates (D800–DFFF non appariés) — fréquents dans les copier-coller Excel
 *  - autres caractères de contrôle C0 hors tab/newline (souvent du bruit)
 */
function sanitizeForJsonb<T>(value: T): T {
  const cleanStr = (s: string): string =>
    s
      .replace(/\u0000/g, "")
      .replace(/[\ud800-\udbff](?![\udc00-\udfff])/g, "")
      .replace(/(^|[^\ud800-\udbff])[\udc00-\udfff]/g, "$1")
      // C0 hors \t \n \r
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return cleanStr(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, vv] of Object.entries(v as Record<string, unknown>)) out[k] = walk(vv);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

async function upsertSupabase(userId: string, data: AppData): Promise<void> {
  const cleaned = sanitizeForJsonb(JSON.parse(JSON.stringify(data)));
  const { error } = await supabase
    .from("marge_chantier_workspace")
    .upsert(
      [{ user_id: userId, data: cleaned, updated_at: new Date().toISOString() }],
      { onConflict: "user_id" },
    );
  if (error) {
    console.error("[marge-chantier] save Supabase error:", error);
    throw new MargeChantierSyncError(error.message, {
      code: error.code,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
    });
  }
}

/**
 * Charge depuis Supabase (source de vérité). Fallback localStorage si offline.
 * Au 1er load post-Phase 5 : si Supabase vide mais localStorage rempli → migration auto.
 */
export async function loadAppData(userId: string): Promise<AppData> {
  if (!userId || userId === "anonymous") {
    return loadFromLocalStorage(userId);
  }

  const { data: row, error } = await supabase
    .from("marge_chantier_workspace")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[marge-chantier] load Supabase error:", error.message);
    return loadFromLocalStorage(userId);
  }

  if (row?.data) {
    const merged = mergeWithEmpty(row.data as Partial<AppData>);
    saveToLocalStorage(userId, merged); // sync cache
    return merged;
  }

  // Pas de ligne serveur — vérifier migration depuis localStorage
  const local = loadFromLocalStorage(userId);
  if (hasRealData(local)) {
    console.info("[marge-chantier] migration auto localStorage → Supabase");
    try {
      await upsertSupabase(userId, local);
    } catch {
      // On garde localStorage comme fallback ; prochaine sauvegarde retentera
    }
  }
  return local;
}

/**
 * Sauve vers Supabase + cache localStorage. À debounce 2s côté composant.
 */
export async function saveAppData(userId: string, data: AppData): Promise<void> {
  saveToLocalStorage(userId, data); // cache d'abord (offline-safe)
  if (!userId || userId === "anonymous") return;
  try {
    await upsertSupabase(userId, data);
  } catch (e) {
    throw toSyncError(e, "Échec de la sauvegarde serveur");
  }
}

/**
 * Best-effort synchrone : utilisé dans `beforeunload` (pas le temps d'attendre Supabase).
 * Cache localStorage uniquement.
 */
export function saveAppDataSync(userId: string, data: AppData): void {
  saveToLocalStorage(userId, data);
}

// === Save/Restore JSON externes (filet de sécurité, inchangés) ===

export function downloadAsJson(
  data: AppData,
  filename = `marge-chantier-${new Date().toISOString().slice(0, 10)}.json`,
): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function restoreFromJson(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Partial<AppData>;
        resolve(mergeWithEmpty(data));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
