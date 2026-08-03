import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  QuiAbsence, QuiAffaire, QuiAffectation, QuiMetier, QuiPersonne, Slot,
} from "@/lib/qui-est-ou";

export interface QuiEstOuData {
  metiers: QuiMetier[];
  personnes: QuiPersonne[];
  affectations: QuiAffectation[];
  absences: QuiAbsence[];
  affaires: QuiAffaire[];
  /** Effectif prévisionnel anonyme sur la fenêtre (atelier_planning). */
  prevu: { metier_id: number; date: string; nb_pers: number }[];
}

export const quiEstOuKey = (from: string, to: string) => ["qui-est-ou", from, to] as const;

async function fetchQuiEstOu(from: string, to: string): Promise<QuiEstOuData> {
  const [metiersRes, empRes, assignRes, absRes, prevuRes] = await Promise.all([
    supabase.from("metiers").select("id, libelle, couleur, ordre").order("ordre"),
    supabase
      .from("employes")
      .select("id, nom, prenom, metier_principal_id")
      .eq("actif", true)
      .eq("non_staffing", false)
      .order("nom"),
    supabase
      .from("assignations")
      .select("id, employe_id, affaire_id, date, demi_journee")
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("absences")
      .select("id, employe_id, date_debut, date_fin, demi_journee, type")
      .eq("valide", true)
      .lte("date_debut", to)
      .gte("date_fin", from),
    supabase
      .from("atelier_planning")
      .select("metier_id, date, nb_pers")
      .gte("date", from)
      .lte("date", to)
      .gt("nb_pers", 0),
  ]);

  const affectations = ((assignRes.data ?? []) as {
    id: string; employe_id: string; affaire_id: string; date: string; demi_journee: Slot | null;
  }[]).map((a) => ({
    id: a.id,
    employe_id: a.employe_id,
    affaire_id: a.affaire_id,
    date: a.date,
    demi_journee: (a.demi_journee ?? "JOURNEE") as Slot,
  }));

  const affaireIds = [...new Set(affectations.map((a) => a.affaire_id))];
  let affaires: QuiAffaire[] = [];
  if (affaireIds.length > 0) {
    const CHUNK = 200;
    const parts: QuiAffaire[][] = [];
    for (let i = 0; i < affaireIds.length; i += CHUNK) {
      const { data } = await supabase
        .from("affaires")
        .select("id, numero, nom")
        .in("id", affaireIds.slice(i, i + CHUNK));
      parts.push(
        ((data ?? []) as { id: string; numero: string | null; nom: string | null }[]).map((a) => ({
          id: a.id,
          numero: a.numero ?? "—",
          nom: a.nom ?? "Sans nom",
        })),
      );
    }
    affaires = parts.flat().sort((a, b) => a.numero.localeCompare(b.numero));
  }

  return {
    metiers: (metiersRes.data ?? []) as QuiMetier[],
    personnes: (empRes.data ?? []) as QuiPersonne[],
    affectations,
    absences: (absRes.data ?? []) as QuiAbsence[],
    affaires,
    prevu: (prevuRes.data ?? []) as { metier_id: number; date: string; nb_pers: number }[],
  };
}

export function useQuiEstOu(from: string, to: string) {
  return useQuery({
    queryKey: quiEstOuKey(from, to),
    queryFn: () => fetchQuiEstOu(from, to),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
}
