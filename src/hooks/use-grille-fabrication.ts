import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type GrilleCell,
  type GrilleLot,
  type GrilleMetier,
  type GrilleObjet,
  type OrigineHeure,
} from "@/lib/grille-fabrication";

export interface GrilleData {
  metiers: GrilleMetier[];
  objets: GrilleObjet[];
  lots: GrilleLot[];
  cells: GrilleCell[];
  devisTotaux: Record<number, number>;
  etapesParObjet: Record<string, Record<string, string>>;
}

export const grilleQueryKey = (affaireId: string) => ["grille-fabrication", affaireId] as const;

async function fetchGrille(affaireId: string): Promise<GrilleData> {
  const [metiersRes, objetsRes, lotsRes, devisRes] = await Promise.all([
    supabase.from("metiers").select("id, code, libelle, ordre, couleur").order("ordre"),
    supabase
      .from("fabrication_objets")
      .select("id, reference, nom, ordre, lot_id")
      .eq("affaire_id", affaireId)
      .eq("archive", false)
      .order("ordre"),
    supabase
      .from("fabrication_lots")
      .select("id, nom, ordre, couleur")
      .eq("affaire_id", affaireId)
      .order("ordre"),
    supabase.from("devis").select("id").eq("affaire_id", affaireId).eq("archive", false),
  ]);

  const objets = (objetsRes.data ?? []) as GrilleObjet[];
  const objetIds = objets.map((o) => o.id);

  const [cellsRes, etapesRes, postesRes] = await Promise.all([
    objetIds.length
      ? supabase
          .from("objet_heures_metier")
          .select("id, objet_id, metier_id, heures_prevues, origine, note, sous_traitance")
          .in("objet_id", objetIds)
      : Promise.resolve({ data: [] as unknown[] }),
    objetIds.length
      ? supabase.from("fabrication_etapes").select("objet_id, type_etape, statut").in("objet_id", objetIds)
      : Promise.resolve({ data: [] as unknown[] }),
    (devisRes.data ?? []).length
      ? supabase
          .from("devis_postes")
          .select("metier_id, heures_prevues")
          .in("devis_id", (devisRes.data ?? []).map((d) => d.id))
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const devisTotaux: Record<number, number> = {};
  for (const p of (postesRes.data ?? []) as { metier_id: number; heures_prevues: number }[]) {
    devisTotaux[p.metier_id] = (devisTotaux[p.metier_id] ?? 0) + Number(p.heures_prevues ?? 0);
  }

  const etapesParObjet: Record<string, Record<string, string>> = {};
  for (const e of (etapesRes.data ?? []) as { objet_id: string; type_etape: string; statut: string }[]) {
    etapesParObjet[e.objet_id] = { ...(etapesParObjet[e.objet_id] ?? {}), [e.type_etape]: e.statut };
  }

  const cells = ((cellsRes.data ?? []) as GrilleCell[]).map((c) => ({
    ...c,
    heures_prevues: Number(c.heures_prevues ?? 0),
  }));

  return {
    metiers: (metiersRes.data ?? []) as GrilleMetier[],
    objets,
    lots: (lotsRes.data ?? []) as GrilleLot[],
    cells,
    devisTotaux,
    etapesParObjet,
  };
}

export function useGrilleFabrication(affaireId: string) {
  const qc = useQueryClient();
  const key = grilleQueryKey(affaireId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchGrille(affaireId),
    staleTime: 15_000,
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: key });
  }, [qc, key]);

  /** Écriture optimiste d'une cellule (upsert sur objet_heures_metier). */
  const setCell = useMutation({
    mutationFn: async (input: {
      objet_id: string;
      metier_id: number;
      heures_prevues?: number;
      note?: string | null;
      sous_traitance?: boolean;
      origine?: OrigineHeure;
      existing?: GrilleCell | null;
    }) => {
      const { existing, ...rest } = input;
      if (existing) {
        const patch: {
          heures_prevues?: number;
          note?: string | null;
          sous_traitance?: boolean;
          origine?: OrigineHeure;
        } = {};
        if (rest.heures_prevues !== undefined) patch.heures_prevues = rest.heures_prevues;
        if (rest.note !== undefined) patch.note = rest.note;
        if (rest.sous_traitance !== undefined) patch.sous_traitance = rest.sous_traitance;
        if (rest.origine !== undefined) patch.origine = rest.origine;
        const { error } = await supabase.from("objet_heures_metier").update(patch).eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("objet_heures_metier").insert({
        objet_id: rest.objet_id,
        metier_id: rest.metier_id,
        heures_prevues: rest.heures_prevues ?? 0,
        note: rest.note ?? null,
        sous_traitance: rest.sous_traitance ?? false,
        origine: rest.origine ?? "ajout",
      });
      if (error) throw error;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<GrilleData>(key);
      if (previous) {
        const idx = previous.cells.findIndex(
          (c) => c.objet_id === input.objet_id && c.metier_id === input.metier_id,
        );
        const cells = [...previous.cells];
        if (idx >= 0) {
          const current = cells[idx]!;
          cells[idx] = {
            ...current,
            heures_prevues: input.heures_prevues ?? current.heures_prevues,
            note: input.note !== undefined ? input.note : current.note,
            sous_traitance:
              input.sous_traitance !== undefined ? input.sous_traitance : current.sous_traitance,
            origine: input.origine ?? current.origine,
          };
        } else {
          cells.push({
            id: `optimistic-${input.objet_id}-${input.metier_id}`,
            objet_id: input.objet_id,
            metier_id: input.metier_id,
            heures_prevues: input.heures_prevues ?? 0,
            note: input.note ?? null,
            sous_traitance: input.sous_traitance ?? false,
            origine: input.origine ?? "ajout",
          });
        }
        qc.setQueryData<GrilleData>(key, { ...previous, cells });
      }
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: invalidate,
  });

  const renameObjet = useMutation({
    mutationFn: async ({ id, nom }: { id: string; nom: string }) => {
      const { error } = await supabase.from("fabrication_objets").update({ nom }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, nom }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<GrilleData>(key);
      if (previous) {
        qc.setQueryData<GrilleData>(key, {
          ...previous,
          objets: previous.objets.map((o) => (o.id === id ? { ...o, nom } : o)),
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: invalidate,
  });

  const createObjet = useMutation({
    mutationFn: async ({ nom, reference }: { nom: string; reference: string }) => {
      const { data, error } = await supabase
        .from("fabrication_objets")
        .insert({ affaire_id: affaireId, nom, reference, quantite: 1 })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSettled: invalidate,
  });

  const createLot = useMutation({
    mutationFn: async ({ nom, objetIds }: { nom: string; objetIds: string[] }) => {
      const { data, error } = await supabase
        .from("fabrication_lots")
        .insert({ affaire_id: affaireId, nom })
        .select("id")
        .single();
      if (error) throw error;
      const { error: e2 } = await supabase
        .from("fabrication_objets")
        .update({ lot_id: data.id })
        .in("id", objetIds);
      if (e2) throw e2;
    },
    onSettled: invalidate,
  });

  const setObjetLot = useMutation({
    mutationFn: async ({ objetId, lotId }: { objetId: string; lotId: string | null }) => {
      const { error } = await supabase
        .from("fabrication_objets")
        .update({ lot_id: lotId })
        .eq("id", objetId);
      if (error) throw error;
    },
    onSettled: invalidate,
  });

  const prefillFromDevis = useMutation({
    mutationFn: async (lines: { objet_id: string; metier_id: number; heures_prevues: number }[]) => {
      if (lines.length === 0) return;
      const { error } = await supabase
        .from("objet_heures_metier")
        .insert(lines.map((l) => ({ ...l, origine: "devis" as const })));
      if (error) throw error;
    },
    onSettled: invalidate,
  });

  return { query, setCell, renameObjet, createObjet, createLot, setObjetLot, prefillFromDevis, invalidate };
}

/** Mapping métier → étape fabrication (miroir SQL `etape_for_metier`). */
export const METIER_CODE_TO_ETAPE: Record<string, string | null> = {
  suivi_projet: "be",
  numerique: "usinage",
  construction: "respo_fab",
  metallerie: "respo_fab",
  peinture: "finition",
  tapisserie: "finition",
  logistique: "manutention",
  machiniste: null,
  impression_uv: null,
};

export const ETAPE_STATUT_LABELS: Record<string, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  termine: "Terminé",
  non_applicable: "N/A",
};
