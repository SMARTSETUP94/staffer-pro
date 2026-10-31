import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { LigneType } from "@/lib/devis/calcul";

export type DevisStatut = "brouillon" | "a_valider" | "valide" | "transfere" | "signe" | "refuse";

export interface Ligne {
  id: string; devis_id: string; parent_id: string | null; type: LigneType; ordre: number; libelle: string | null;
  quantite: number; descriptif_client: string | null; longueur_mm: number | null; largeur_mm: number | null; hauteur_mm: number | null;
  finition: string | null; texte: string | null; interne: boolean;
}
export interface Heure { id: string; ligne_id: string; poste_id: string; niveau: string; heures: number; par_unite: boolean;
  taux_vente: number; taux_grille: number | null; cout_revient?: number | null; ordre: number; poste_libelle: string; metier_id: number | null }
export interface Materiau { id: string; ligne_id: string; materiau_id: string | null; designation: string; fournisseur: string | null; ref: string | null;
  unite: string | null; quantite: number; aide_conversion: unknown; prix_achat?: number; date_tarif: string | null; coefficient: number;
  propose_catalogue: boolean; ordre: number }
export interface Libre { id: string; ligne_id: string; categorie: string; forfait_cle: string | null; designation: string; unite: string | null;
  quantite: number; prix_achat?: number | null; prix_forfait: number | null; coefficient: number; par_unite: boolean; ordre: number }
export interface Photo { id: string; ligne_id: string; storage_path: string; thumb_path: string | null; mime: string | null; legende: string | null; visible_client: boolean; ordre: number }

export interface DevisData {
  devis: {
    id: string; numero: string; version: number; statut_redaction: DevisStatut; affaire_id: string | null; libelle: string | null;
    client_id: string | null; contact_id: string | null; client_final_id: string | null; date_devis: string | null; date_validite?: string | null; date_validite_manuelle?: boolean; date_envoi?: string | null; numero_progbat: string | null;
    tva_pct: number | null; coef_materiaux_defaut: number | null; est_modele: boolean; modele_nom: string | null; modele_categorie: string | null;
    modele_description: string | null; modele_actif: boolean; dates_snapshot: Record<string, string | null> | null; version_precedente_id: string | null;
  };
  affaire: null | { id: string; numero: string | null; code_opportunite: string | null; nom: string | null; created_at: string;
    date_visite_technique: string | null; date_montage: string | null; date_evenement_debut: string | null; date_evenement_fin: string | null; date_demontage: string | null };
  client: null | { id: string; nom: string; siret: string | null; adresse: string | null; code_postal: string | null; ville: string | null; tva_intracom: string | null };
  client_final: null | { id: string; nom: string };
  contact: null | { id: string; nom: string | null; prenom: string | null; email: string | null };
  modele_origine: string | null;
  lignes: Ligne[]; heures: Heure[]; materiaux: Materiau[]; libres: Libre[]; photos: Photo[];
  corbeille: { groupe: string; supprime_le: string; libelles: string[] | null }[];
  calcul: { total_ht: number; tva: number; ttc: number; tva_pct: number; options_ht: number; marge: number | "non_calculable" | null;
    cout_total?: number | null; lignes: Record<string, number>; racines: Record<string, number>; heures_metier: Record<string, number> };
  droits: { couts: boolean; ecrire: boolean; valider: boolean; parametres: boolean };
  parametres: Record<string, number | null>;
}

export const devisKey = (id: string) => ["devis-staffing", id] as const;

export function useDevis(id: string) {
  return useQuery({
    queryKey: devisKey(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("devis_lire", { _devis_id: id });
      if (error) throw error;
      return data as unknown as DevisData;
    },
  });
}

/** Appel RPC + rafraîchissement du devis ; renvoie la donnée ou null (erreur affichée). */
export function useDevisRpc(id: string) {
  const qc = useQueryClient();
  return async function call<T = unknown>(fn: string, args: Record<string, unknown>, opts?: { silent?: boolean; refresh?: boolean }): Promise<T | null> {
    const { data, error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: T; error: { message: string } | null }>)(fn, args);
    if (error) {
      toast.error(error.message);
      await qc.invalidateQueries({ queryKey: devisKey(id) });
      return null;
    }
    if (opts?.refresh !== false) await qc.invalidateQueries({ queryKey: devisKey(id) });
    return data;
  };
}

/** Mise à jour optimiste d'un élément de la donnée en cache (recalcul local immédiat). */
export function usePatchCache(id: string) {
  const qc = useQueryClient();
  return (mut: (d: DevisData) => DevisData) => qc.setQueryData<DevisData>(devisKey(id), (d) => (d ? mut(d) : d));
}

export const STATUT_LABEL: Record<DevisStatut, string> = {
  brouillon: "Brouillon", a_valider: "À valider", valide: "Validé", transfere: "Envoyé", signe: "Signé", refuse: "Refusé",
};
export const TYPE_LABEL: Record<LigneType, string> = {
  zone: "Zone", objet: "Objet", commentaire: "Commentaire", chapitre_suivi: "Suivi et plans",
  chapitre_pose: "Pose", chapitre_depose: "Dépose", option: "Option",
};
export const eur = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
export const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("fr-FR") : "À déterminer");
