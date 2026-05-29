/**
 * v0.52 — Server functions pour la vue employé de /aujourdhui.
 *
 * Trois server fns dédiées au rendu user-friendly de la page d'accueil
 * pour les rôles « terrain » (poseur, peintre, métallier, menuisier, etc.) :
 *   - getMonPlanningSemaine : mes assignations de la semaine en cours
 *   - getMonEquipeChantier  : qui d'autre est sur ce chantier ce jour-là
 *   - getMesObjetsAtelier   : mes objets de fabrication en cours (vide pour poseurs)
 *
 * Toutes les RPC s'appuient sur le profile_id de l'utilisateur connecté
 * via le middleware Supabase. RLS sécurise tout en amont.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { startOfWeek, endOfWeek, format } from "date-fns";

export type DemiJourneeRow = "AM" | "PM" | "JOURNEE";

export interface PlanningSemaineItem {
  assignation_id: string;
  date: string; // YYYY-MM-DD
  demi_journee: DemiJourneeRow;
  heures: number;
  affaire_id: string;
  affaire_numero: string;
  affaire_nom: string;
  client: string | null;
  lieu: string | null;
  metier_libelle: string | null;
  metier_couleur: string | null;
  phase: string | null;
  statut_confirmation: string;
}

export const getMonPlanningSemaine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: PlanningSemaineItem[] }> => {
    const { supabase, userId } = context;

    const { data: emp } = await supabase
      .from("employes")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    if (!emp) return { items: [] };

    const now = new Date();
    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

    const { data, error } = await supabase
      .from("assignations")
      .select(
        "id, date, demi_journee, heures, phase, statut_confirmation, affaire_id, affaires(numero, nom, client, lieu), metiers(libelle, couleur)",
      )
      .eq("employe_id", emp.id)
      .gte("date", weekStart)
      .lte("date", weekEnd)
      .order("date", { ascending: true })
      .order("demi_journee", { ascending: true });
    if (error) throw new Error(error.message);

    const items: PlanningSemaineItem[] = (data ?? []).map((r) => {
      const aff = r.affaires as unknown as {
        numero: string; nom: string; client: string | null; lieu: string | null;
      } | null;
      const met = r.metiers as unknown as {
        libelle: string; couleur: string;
      } | null;
      return {
        assignation_id: r.id as string,
        date: r.date as string,
        demi_journee: r.demi_journee as DemiJourneeRow,
        heures: Number(r.heures ?? 0),
        affaire_id: r.affaire_id as string,
        affaire_numero: aff?.numero ?? "",
        affaire_nom: aff?.nom ?? "",
        client: aff?.client ?? null,
        lieu: aff?.lieu ?? null,
        metier_libelle: met?.libelle ?? null,
        metier_couleur: met?.couleur ?? null,
        phase: (r.phase as string | null) ?? null,
        statut_confirmation: (r.statut_confirmation as string) ?? "en_attente",
      };
    });

    return { items };
  });

// ---------------------------------------------------------------------------
// getMonEquipeChantier
// ---------------------------------------------------------------------------

export interface EquipeChantierJourMembre {
  employe_id: string;
  nom: string;
  prenom: string;
  metier_libelle: string | null;
  metier_couleur: string | null;
  demi_journee: DemiJourneeRow;
  telephone: string | null;
  est_moi: boolean;
}

export const getMonEquipeChantier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      affaireId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ data, context }): Promise<{
    affaire: { numero: string; nom: string; client: string | null; lieu: string | null } | null;
    membres: EquipeChantierJourMembre[];
  }> => {
    const { supabase, userId } = context;

    const [{ data: emp }, { data: aff }] = await Promise.all([
      supabase.from("employes").select("id").eq("profile_id", userId).maybeSingle(),
      supabase
        .from("affaires")
        .select("numero, nom, client, lieu")
        .eq("id", data.affaireId)
        .maybeSingle(),
    ]);

    const { data: rows, error } = await supabase
      .from("assignations")
      .select(
        "employe_id, demi_journee, employes!inner(nom, prenom, telephone, mobile), metiers(libelle, couleur)",
      )
      .eq("affaire_id", data.affaireId)
      .eq("date", data.date);
    if (error) throw new Error(error.message);

    const myId = emp?.id ?? null;
    const membres: EquipeChantierJourMembre[] = (rows ?? []).map((r) => {
      const e = r.employes as unknown as {
        nom: string; prenom: string; telephone: string | null; mobile: string | null;
      };
      const met = r.metiers as unknown as { libelle: string; couleur: string } | null;
      return {
        employe_id: r.employe_id as string,
        nom: e.nom,
        prenom: e.prenom,
        metier_libelle: met?.libelle ?? null,
        metier_couleur: met?.couleur ?? null,
        demi_journee: r.demi_journee as DemiJourneeRow,
        telephone: e.mobile ?? e.telephone ?? null,
        est_moi: r.employe_id === myId,
      };
    });

    // Dédupe (un même employé peut avoir AM+PM le même jour)
    const seen = new Set<string>();
    const deduped = membres.filter((m) => {
      const k = `${m.employe_id}-${m.demi_journee}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return {
      affaire: aff
        ? { numero: aff.numero, nom: aff.nom, client: aff.client, lieu: aff.lieu }
        : null,
      membres: deduped,
    };
  });

// ---------------------------------------------------------------------------
// getMesObjetsAtelier
// ---------------------------------------------------------------------------

export interface ObjetAtelierItem {
  objet_id: string;
  reference: string;
  nom: string;
  affaire_id: string;
  affaire_numero: string;
  affaire_nom: string;
  statut_chef: string | null;
}

export const getMesObjetsAtelier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: ObjetAtelierItem[] }> => {
    const { supabase, userId } = context;

    const { data: emp } = await supabase
      .from("employes")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();
    if (!emp) return { items: [] };

    const { data: foe, error: foeErr } = await supabase
      .from("fabrication_objet_equipe")
      .select("objet_id")
      .eq("employe_id", emp.id)
      .is("removed_at", null);
    if (foeErr) throw new Error(foeErr.message);

    const ids = Array.from(new Set((foe ?? []).map((r) => r.objet_id as string)));
    if (ids.length === 0) return { items: [] };

    const { data: objets, error } = await supabase
      .from("fabrication_objets")
      .select("id, reference, nom, statut_chef, affaire_id, affaires(numero, nom)")
      .in("id", ids)
      .eq("archive", false)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    const items: ObjetAtelierItem[] = (objets ?? []).map((o) => {
      const aff = o.affaires as unknown as { numero: string; nom: string } | null;
      return {
        objet_id: o.id as string,
        reference: (o.reference as string) ?? "",
        nom: (o.nom as string) ?? "",
        statut_chef: (o.statut_chef as string | null) ?? null,
        affaire_id: o.affaire_id as string,
        affaire_numero: aff?.numero ?? "",
        affaire_nom: aff?.nom ?? "",
      };
    });

    return { items };
  });
