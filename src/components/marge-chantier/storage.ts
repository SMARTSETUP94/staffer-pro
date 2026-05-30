/**
 * Persistance localStorage isolée par userId pour l'outil Marges chantiers.
 * Clé : `margeChantierApp_v1_<userId>`. Backup manuel via JSON download/upload.
 */
import type { AppData } from "./engine";
import { emptyApp } from "./engine";

const PREFIX = "margeChantierApp_v1_";

export function loadAppData(userId: string): AppData {
  try {
    const raw = localStorage.getItem(PREFIX + userId);
    if (!raw) return emptyApp();
    const parsed = JSON.parse(raw) as Partial<AppData>;
    // Garde-fou : fusion avec emptyApp pour tolérer un schéma ancien
    return { ...emptyApp(), ...parsed, meta: { ...emptyApp().meta, ...(parsed.meta ?? {}) } };
  } catch {
    return emptyApp();
  }
}

export function saveAppData(userId: string, data: AppData): void {
  try {
    localStorage.setItem(PREFIX + userId, JSON.stringify(data));
  } catch (e) {
    console.error("[marge-chantier] localStorage write failed:", e);
  }
}

export function downloadAsJson(data: AppData, filename = `marge-chantier-${new Date().toISOString().slice(0, 10)}.json`): void {
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
        const data = JSON.parse(String(reader.result)) as AppData;
        resolve({ ...emptyApp(), ...data, meta: { ...emptyApp().meta, ...(data.meta ?? {}) } });
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
