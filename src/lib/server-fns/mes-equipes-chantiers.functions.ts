/**
 * Bloc 9.6 bis — getMesEquipesChantiers
 *
 * Liste les chantiers actifs où l'utilisateur courant fait partie du casting
 * (affaire_equipe, toute phase confondue, non retirés). Pour chaque chantier,
 * renvoie l'équipe groupée par phase pour permettre au mobile de l'afficher
 * sans dépendre des assignations jour.
 *
 * RLS : la lecture de affaire_equipe est filtrée par les policies du projet
 * (membres du casting + chef/admin). On filtre côté SQL en deux temps :
 *   1) récupérer les affaire_id où l'employé est présent
 *   2) charger toutes les lignes équipe pour ces affaires
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EquipePhase =
  | "commercial_etude"
  | "fabrication"
  | "logistique"
  | "montage"
  | "demontage";

export interface EquipeChantierMembre {
  id: string;
  employe_id: string;
  nom: string;
  prenom: string;
  role_terrain: string | null;
  est_moi: boolean;
}

export interface EquipeChantierItem {
  affaire_id: string;
  numero: string;
  nom: string;
  client: string | null;
  lieu: string | null;
  statut: string | null;
  date_evenement_debut: string | null;
  date_evenement_fin: string | null;
  phases: Record<EquipePhase, EquipeChantierMembre[]>;
  total_membres: number;
}

const EMPTY_PHASES = (): Record<EquipePhase, EquipeChantierMembre[]> => ({
  commercial_etude: [],
  fabrication: [],
  logistique: [],
  montage: [],
  demontage: [],
});

export const getMesEquipesChantiers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: emp } = await supabase
      .from("employes")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    if (!emp) return { chantiers: [] as EquipeChantierItem[] };

    // 1) Affaires où l'employé est présent dans le casting
    const { data: mine, error: mineErr } = await supabase
      .from("affaire_equipe")
      .select("affaire_id")
      .eq("employe_id", emp.id)
      .is("removed_at", null);
    if (mineErr) throw new Error(mineErr.message);

    const affaireIds = Array.from(new Set((mine ?? []).map((r) => r.affaire_id)));
    if (affaireIds.length === 0) return { chantiers: [] as EquipeChantierItem[] };

    // 2) Affaires (filtre actives : on exclut annulees/terminees)
    const { data: affs, error: affErr } = await supabase
      .from("affaires")
      .select(
        "id, numero, nom, client, lieu, statut, date_evenement_debut, date_evenement_fin",
      )
      .in("id", affaireIds)
      .not("statut", "in", "(annule,termine)")
      .order("date_evenement_debut", { ascending: true, nullsFirst: false });
    if (affErr) throw new Error(affErr.message);

    if (!affs || affs.length === 0) return { chantiers: [] as EquipeChantierItem[] };

    const liveIds = affs.map((a) => a.id);

    // 3) Toutes les équipes des affaires retenues
    const { data: equipeRows, error: eqErr } = await supabase
      .from("affaire_equipe")
      .select(
        "id, affaire_id, employe_id, phase, role_terrain, added_at, employes!inner(nom, prenom)",
      )
      .in("affaire_id", liveIds)
      .is("removed_at", null)
      .order("added_at", { ascending: true });
    if (eqErr) throw new Error(eqErr.message);

    const byAffaire = new Map<string, Record<EquipePhase, EquipeChantierMembre[]>>();
    const totals = new Map<string, number>();

    for (const r of equipeRows ?? []) {
      const phase = r.phase as EquipePhase;
      let bucket = byAffaire.get(r.affaire_id);
      if (!bucket) {
        bucket = EMPTY_PHASES();
        byAffaire.set(r.affaire_id, bucket);
      }
      if (!(phase in bucket)) continue;
      // @ts-ignore relation typing
      const e = r.employes;
      bucket[phase].push({
        id: r.id,
        employe_id: r.employe_id,
        nom: e?.nom ?? "",
        prenom: e?.prenom ?? "",
        role_terrain: r.role_terrain ?? null,
        est_moi: r.employe_id === emp.id,
      });
      totals.set(r.affaire_id, (totals.get(r.affaire_id) ?? 0) + 1);
    }

    const chantiers: EquipeChantierItem[] = affs.map((a) => ({
      affaire_id: a.id,
      numero: a.numero,
      nom: a.nom,
      client: a.client,
      lieu: a.lieu,
      statut: a.statut ?? null,
      date_evenement_debut: a.date_evenement_debut,
      date_evenement_fin: a.date_evenement_fin,
      phases: byAffaire.get(a.id) ?? EMPTY_PHASES(),
      total_membres: totals.get(a.id) ?? 0,
    }));

    return { chantiers };
  });
