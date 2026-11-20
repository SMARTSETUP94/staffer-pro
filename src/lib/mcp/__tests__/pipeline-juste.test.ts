import { describe, it, expect, vi } from "vitest";
import { readData } from "../read-data";
import { estEnRetard } from "@/lib/pipeline-kanban";
import { devisPipelineAction } from "@/lib/devis/pipeline";
import { KANBAN_STATUT_ORDER } from "@/lib/opportunites";

function query(data: unknown[]) {
  const q: any = {};
  for (const k of ["select", "eq", "in", "order", "limit", "range"]) q[k] = () => q;
  q.then = (resolve: any) => Promise.resolve({ data, error: null }).then(resolve);
  return q;
}
const active = { id: "9543", numero: "9543", statut_opportunite: "envoye", next_action_due_le: "2026-11-01" };
const closed = { id: "perdue", numero: "9503", statut_opportunite: "perdu", next_action_due_le: "2026-11-01" };
const retained = { affaire_id: "9543", devis_id: "r3", numero: "9543-R3", version: 3, statut_redaction: "valide", net_ht: 39968.28, source_montant: "devis", montant_version: 3 };
function ctx(d = retained) {
  return { userId: "user", caps: new Set(["opportunites.read.all"]), db: {
    rpc: vi.fn((name: string) => query(name === "list_opportunites_active" ? [active] : name === "list_opportunites_closes" ? [closed] : [d])),
    from: vi.fn(() => query([{ id: "9543", ca_estime_ht: 100 }, { id: "perdue", ca_estime_ht: 900 }])),
  } } as any;
}
describe("Pipeline juste — règles Gabin du 20 novembre", () => {
  it("9543 retient 39 968,28 € de R3 et non le CA estimé", async () => {
    const r = await readData(ctx(), "pipeline_opportunites", { limit: 25, cursor: "0" });
    expect(r.rows[0]).toMatchObject({ montant_retenu_ht: 39968.28, devis_retenu: { numero: "9543-R3", version: 3, statut: "valide" }, source_montant: "devis" });
  });
  it("ne lit pas les clos par défaut", async () => {
    const c = ctx(); const r = await readData(c, "pipeline_opportunites", { limit: 25, cursor: "0" });
    expect(r.rows).toHaveLength(1); expect(c.db.rpc).not.toHaveBeenCalledWith("list_opportunites_closes");
  });
  it("inclure_clos expose les perdus sans urgence ni totalisation", async () => {
    const r = await readData(ctx(), "pipeline_opportunites", { inclure_clos: true, limit: 25, cursor: "0" });
    expect(r.rows[1]).toMatchObject({ montant_retenu_ht: 900, clos: true, totalisable: false, urgence: false });
  });
  it("conserve 900 € de la version précédente pendant le brouillon vide", async () => {
    const r = await readData(ctx({ ...retained, version: 2, net_ht: 900, source_montant: "version_precedente", montant_version: 1 }), "pipeline_opportunites", { limit: 25, cursor: "0" });
    expect(r.rows[0]).toMatchObject({ montant_retenu_ht: 900, montant_version: 1, source_montant: "version_precedente" });
  });
  it.each(["perdu", "gagne"])("%s ne crée pas d'urgence", statut_opportunite => {
    expect(estEnRetard({ id: "x", statut_opportunite, next_action_due_le: "2026-01-01" }, new Date("2026-11-20"))).toBe(false);
  });
  it("le Kanban ne compte que les quatre états actifs", () => expect(KANBAN_STATUT_ORDER).toEqual(["a_faire", "envoye", "a_l_etude", "presque_gagne"]));
  it("sans retenu, la version refusée est ouverte et jamais créée en R1", () => {
    expect(devisPipelineAction({ statut: "envoye", badge: { devis_id: "r1", version: 1, statut_redaction: "refuse" }, peutRediger: true, flag: true })).toBe("ouvrir");
  });
});