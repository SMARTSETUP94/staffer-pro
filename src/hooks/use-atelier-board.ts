/**
 * LOT B3 — Chargement du tableau d'atelier.
 *
 * Lecture seule : objets actifs, étapes, heures prévues (`objet_heures_metier`,
 * source de vérité) et complétude via la RPC `etapes_pretes_batch` (source
 * unique SQL). Aucune écriture d'assignation, aucune écriture des colonnes
 * cache `heures_prevues_*`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  etapeCourante,
  heuresPourEtape,
  tamponsPour,
  type EtapeLite,
  type EtapeStatut,
  type EtapeType,
  type ObjetCarte,
} from "@/lib/atelier-board";

const CHUNK = 200;
function chunks<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface AtelierBoardData {
  cartes: ObjetCarte[];
  affaires: { id: string; numero: string; nom: string; prospect: boolean }[];
}

export const atelierBoardKey = ["atelier-board"] as const;

async function fetchAtelierBoard(): Promise<AtelierBoardData> {
  const { data: objetsRaw } = await supabase
    .from("fabrication_objets")
    .select(
      "id, reference, nom, affaire_id, affaires!inner(id, numero, nom, date_montage, statut, phase)",
    )
    .eq("archive", false);

  type ObjetRow = {
    id: string;
    reference: string | null;
    nom: string | null;
    affaire_id: string;
    affaires: {
      id: string;
      numero: string | null;
      nom: string | null;
      date_montage: string | null;
      statut: string | null;
      phase: string | null;
    } | null;
  };

  const objets = ((objetsRaw ?? []) as unknown as ObjetRow[]).filter(
    (o) => o.affaires && o.affaires.statut !== "termine" && o.affaires.statut !== "annule",
  );
  if (objets.length === 0) return { cartes: [], affaires: [] };

  const objetIds = objets.map((o) => o.id);

  const [metiersRes, heuresParts, preteParts] = await Promise.all([
    supabase.from("metiers").select("id, code"),
    Promise.all(
      chunks(objetIds).map((ids) =>
        supabase
          .from("objet_heures_metier")
          .select("objet_id, metier_id, heures_prevues")
          .in("objet_id", ids),
      ),
    ),
    Promise.all(
      chunks(objetIds).map((ids) => supabase.rpc("etapes_pretes_batch", { _objet_ids: ids })),
    ),
  ]);

  const metierCode = new Map<number, string>(
    ((metiersRes.data ?? []) as { id: number; code: string }[]).map((m) => [m.id, m.code]),
  );

  type HeureRow = { objet_id: string; metier_id: number; heures_prevues: number | null };
  const heuresByObjet = new Map<string, { metier_code: string; heures: number }[]>();
  for (const part of heuresParts) {
    for (const h of (part.data ?? []) as HeureRow[]) {
      const list = heuresByObjet.get(h.objet_id) ?? [];
      list.push({
        metier_code: metierCode.get(h.metier_id) ?? "",
        heures: Number(h.heures_prevues ?? 0),
      });
      heuresByObjet.set(h.objet_id, list);
    }
  }

  type PreteRow = {
    etape_id: string;
    objet_id: string;
    type_etape: EtapeType;
    statut: EtapeStatut;
    prete: boolean;
    manques: unknown;
  };
  const etapesByObjet = new Map<string, EtapeLite[]>();
  for (const part of preteParts) {
    for (const r of (part.data ?? []) as PreteRow[]) {
      const list = etapesByObjet.get(r.objet_id) ?? [];
      list.push({
        id: r.etape_id,
        objet_id: r.objet_id,
        type_etape: r.type_etape,
        statut: r.statut,
        prete: r.prete !== false,
        manques: Array.isArray(r.manques) ? (r.manques as string[]) : [],
      });
      etapesByObjet.set(r.objet_id, list);
    }
  }

  const cartes: ObjetCarte[] = [];
  const affaires = new Map<string, { id: string; numero: string; nom: string; prospect: boolean }>();

  for (const o of objets) {
    const a = o.affaires!;
    const etapes = etapesByObjet.get(o.id) ?? [];
    const courante = etapeCourante(etapes);
    affaires.set(a.id, {
      id: a.id,
      numero: a.numero ?? "—",
      nom: a.nom ?? "",
      prospect: a.phase === "opportunite" || a.statut === "prospect",
    });
    if (!courante) continue;

    cartes.push({
      objet_id: o.id,
      reference: o.reference ?? "—",
      nom: o.nom ?? "Sans nom",
      affaire_id: a.id,
      affaire_numero: a.numero ?? "—",
      affaire_nom: a.nom ?? "",
      date_montage: a.date_montage,
      etape: courante,
      heures: heuresPourEtape(heuresByObjet.get(o.id) ?? [], courante.type_etape),
      tampons: tamponsPour(etapes, courante.id),
    });
  }

  return {
    cartes,
    affaires: [...affaires.values()].sort((x, y) => x.numero.localeCompare(y.numero)),
  };
}

export function useAtelierBoard() {
  return useQuery({
    queryKey: atelierBoardKey,
    queryFn: fetchAtelierBoard,
    staleTime: 60_000,
  });
}

/** Validation d'étape — la RPC ne lève jamais, elle renvoie `{ ok, error }`. */
export function useValiderEtape() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (etapeId: string) => {
      const { data, error } = await supabase.rpc("valider_etape", { _etape_id: etapeId });
      if (error) return { ok: false, error: error.message };
      return (data ?? { ok: false, error: "Réponse vide" }) as { ok: boolean; error?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: atelierBoardKey });
    },
  });
}
