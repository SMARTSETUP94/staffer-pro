import { expect, it } from "vitest";
import {
  CHANTIER_SENS_DEFAUT,
  CHANTIER_TRI_DEFAUT,
  sortChantiers,
  type ChantierTriRow,
} from "../chantiers-tri";

const r = (numero: string, date_montage: string | null, extra: Partial<ChantierTriRow> = {}): ChantierTriRow => ({
  numero,
  nom: numero,
  client: null,
  statut: "en_cours",
  date_montage,
  date_demontage: null,
  ...extra,
});

it("ouvre la liste des chantiers du plus récent au plus ancien", () => {
  expect(CHANTIER_TRI_DEFAUT).toBe("montage");
  expect(CHANTIER_SENS_DEFAUT).toBe("desc");
});

it("place la date de montage la plus récente en tête", () => {
  const rows = [
    r("6037", "2026-09-22"),
    r("6082", "2026-11-03"),
    r("6085", "2027-01-18"),
    r("6080", "2026-11-28"),
    r("6660", "2026-11-15"),
  ];
  const ordonne = sortChantiers(rows, CHANTIER_TRI_DEFAUT, CHANTIER_SENS_DEFAUT).map((x) => x.numero);
  expect(ordonne).toEqual(["6085", "6080", "6660", "6082", "6037"]);
});

it("garde les chantiers sans date de montage en dernier, dans les deux sens", () => {
  const rows = [r("6001", null), r("6002", "2026-11-03"), r("6003", "2026-09-22")];
  expect(sortChantiers(rows, "montage", "desc").map((x) => x.numero)).toEqual(["6002", "6003", "6001"]);
  expect(sortChantiers(rows, "montage", "asc").map((x) => x.numero)).toEqual(["6003", "6002", "6001"]);
});

it("trie le démontage comme le montage, dates absentes en dernier", () => {
  const rows = [
    r("6100", "2026-11-01", { date_demontage: null }),
    r("6101", "2026-11-02", { date_demontage: "2026-11-05" }),
    r("6102", "2026-11-03", { date_demontage: "2026-12-20" }),
  ];
  expect(sortChantiers(rows, "demontage", "desc").map((x) => x.numero)).toEqual(["6102", "6101", "6100"]);
});
