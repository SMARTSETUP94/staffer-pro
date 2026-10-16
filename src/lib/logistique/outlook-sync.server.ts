/**
 * Synchronisation à sens unique : étapes logistiques → agenda Outlook partagé
 * « Planning logistique Setup » de log@setup.paris (Microsoft Graph, app-only).
 * L'application fait foi : toute modification faite dans Outlook est écrasée.
 */
import { getToken } from "@/lib/server-fns/shared-inbox-attachments.functions";
import { ETAPE_LABELS } from "@/lib/logistique/etapes";

const GRAPH = "https://graph.microsoft.com/v1.0";
const BOX = "log@setup.paris";
const CAL_NAME = "Planning logistique Setup";
const TZ = "Europe/Paris";
const APP_URL = "https://staffing.setup.paris";
const MAX_OPS = 150;

type Report = { created: number; updated: number; deleted: number; errors: string[] };

async function graph(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: `outlook.timezone="${TZ}"`, ...(init.headers ?? {}) },
  });
  return res;
}

async function ensureCalendar(token: string): Promise<string> {
  const base = `/users/${encodeURIComponent(BOX)}/calendars`;
  const r = await graph(token, `${base}?$select=id,name&$top=100`);
  if (!r.ok) throw new Error(`Agenda Outlook [${r.status}]: ${(await r.text()).slice(0, 300)}`);
  const list = ((await r.json()) as { value: { id: string; name: string }[] }).value;
  const found = list.find((c) => c.name === CAL_NAME);
  if (found) return found.id;
  const c = await graph(token, base, { method: "POST", body: JSON.stringify({ name: CAL_NAME }) });
  if (!c.ok) throw new Error(`Création agenda [${c.status}]: ${(await c.text()).slice(0, 300)}`);
  return ((await c.json()) as { id: string }).id;
}

function addDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildEvent(e: any) {
  const label = (ETAPE_LABELS as Record<string, string>)[e.type] ?? e.type;
  const aff = e.affaire ? `${e.affaire.numero} ${e.affaire.nom}` : "";
  const subject = `[${label}] ${aff}${e.nb_personnes ? ` — ${e.nb_personnes}p` : ""}`.trim();
  const fin = e.date_fin ?? e.date_debut;
  const hd = e.heure_debut?.slice(0, 5);
  const hf = e.heure_fin?.slice(0, 5);
  let start, end, isAllDay;
  if (hd) {
    start = { dateTime: `${e.date_debut}T${hd}:00`, timeZone: TZ };
    let endT = hf ?? `${String(Math.min(23, Number(hd.slice(0, 2)) + 2)).padStart(2, "0")}:${hd.slice(3)}`;
    if (fin === e.date_debut && endT <= hd) endT = "23:59";
    end = { dateTime: `${fin}T${endT}:00`, timeZone: TZ };
    isAllDay = false;
  } else {
    start = { dateTime: `${e.date_debut}T00:00:00`, timeZone: TZ };
    end = { dateTime: `${addDay(fin)}T00:00:00`, timeZone: TZ };
    isAllDay = true;
  }
  const lignes: [string, string | null | undefined][] = [
    ["Chantier", aff], ["Client", e.affaire?.client], ["Lieu", e.lieu_libre], ["Accès", e.acces],
    ["Responsable", e.responsable], ["Effectif", e.nb_personnes ? `${e.nb_personnes} personne(s)` : null],
    ["Véhicule", e.vehicule ? `${e.vehicule.nom}${e.vehicule.immatriculation ? ` (${e.vehicule.immatriculation})` : ""}` : e.immatriculation_libre],
    ["Horaire", e.horaire_libre], ["Note", e.note], ["Commentaire équipe", e.commentaire_equipe],
  ];
  const html = lignes.filter(([, v]) => v).map(([k, v]) => `<b>${k} :</b> ${esc(String(v)).replace(/\n/g, "<br>")}`).join("<br>")
    + `<br><br><a href="${APP_URL}/logistique">Ouvrir le planning logistique</a><br><i>Synchronisé depuis l'application — ne pas modifier ici.</i>`;
  return {
    subject, start, end, isAllDay, showAs: "free", isReminderOn: false,
    location: e.lieu_libre ? { displayName: e.lieu_libre } : undefined,
    body: { contentType: "HTML", content: html },
  };
}

export async function syncOutlookLogistique(supa: any): Promise<Report> {
  const rep: Report = { created: 0, updated: 0, deleted: 0, errors: [] };
  const token = await getToken();
  const calId = await ensureCalendar(token);
  const evBase = `/users/${encodeURIComponent(BOX)}/calendars/${encodeURIComponent(calId)}/events`;
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { data: etapes, error } = await supa
    .from("affaire_etapes_logistiques")
    .select("*, affaire:affaires(numero,nom,client), vehicule:vehicules(nom,immatriculation)")
    .or(`date_fin.gte.${from},and(date_fin.is.null,date_debut.gte.${from})`);
  if (error) throw new Error(error.message);

  let ops = 0;
  const keep = new Set<string>();
  for (const e of etapes ?? []) {
    if (ops >= MAX_OPS) break;
    try {
      if (e.statut === "annule") {
        if (e.outlook_event_id) {
          ops++;
          const d = await graph(token, `${evBase}/${encodeURIComponent(e.outlook_event_id)}`, { method: "DELETE" });
          if (d.ok || d.status === 404) {
            rep.deleted++;
            await supa.from("affaire_etapes_logistiques").update({ outlook_event_id: null, outlook_synced_at: null }).eq("id", e.id);
          }
        }
        continue;
      }
      if (e.outlook_event_id) keep.add(e.outlook_event_id);
      const dirty = !e.outlook_event_id || !e.outlook_synced_at || new Date(e.updated_at) > new Date(e.outlook_synced_at);
      if (!dirty) continue;
      ops++;
      const body = JSON.stringify(buildEvent(e));
      let id: string | null = e.outlook_event_id;
      if (id) {
        const p = await graph(token, `${evBase}/${encodeURIComponent(id)}`, { method: "PATCH", body });
        if (p.status === 404) id = null;
        else if (!p.ok) throw new Error(`[${p.status}] ${(await p.text()).slice(0, 200)}`);
        else rep.updated++;
      }
      if (!id) {
        const c = await graph(token, evBase, { method: "POST", body });
        if (!c.ok) throw new Error(`[${c.status}] ${(await c.text()).slice(0, 200)}`);
        id = ((await c.json()) as { id: string }).id;
        rep.created++;
      }
      keep.add(id!);
      // marge d'1 min : la mise à jour ci-dessous touche aussi updated_at
      await supa.from("affaire_etapes_logistiques")
        .update({ outlook_event_id: id, outlook_synced_at: new Date(Date.now() + 60000).toISOString() })
        .eq("id", e.id);
    } catch (err) {
      rep.errors.push(`${e.id.slice(0, 8)}: ${(err as Error).message}`);
    }
  }

  // Suppression des événements orphelins (étapes supprimées dans l'application)
  if (ops < MAX_OPS) {
    const to = new Date(Date.now() + 400 * 86400000).toISOString();
    let url: string | null = `${GRAPH}/users/${encodeURIComponent(BOX)}/calendars/${encodeURIComponent(calId)}/calendarView?startDateTime=${from}T00:00:00Z&endDateTime=${to}&$select=id&$top=200`;
    const orphans: string[] = [];
    while (url) {
      const r = await graph(token, url);
      if (!r.ok) { rep.errors.push(`liste [${r.status}]`); break; }
      const j = (await r.json()) as { value: { id: string }[]; "@odata.nextLink"?: string };
      for (const ev of j.value) if (!keep.has(ev.id)) orphans.push(ev.id);
      url = j["@odata.nextLink"] ?? null;
    }
    // Ne supprimer que si l'ensemble des étapes a pu être parcouru
    if (rep.errors.length === 0) {
      for (const id of orphans.slice(0, MAX_OPS - ops)) {
        const d = await graph(token, `${evBase}/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (d.ok || d.status === 404) rep.deleted++;
      }
    }
  }
  return rep;
}
