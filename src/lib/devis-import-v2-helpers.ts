/**
 * v0.23.1 FIX 1 — Helpers purs pour la fusion d'import devis (RH + Progbat).
 * Détection double-comptage machiniste + construction du payload RPC v2.
 */

export const MACHINISTE_METIER_ID = 6;

export interface PosteLite {
  metierId: number;
  heures: number;
}

/**
 * Reco B : warning visuel sans blocage si un poste machiniste est détecté
 * ET que les heures chantier (montage/démontage) sont aussi cochées en opt-in.
 */
export function detectMachinisteDoubleComptage(
  postes: PosteLite[],
  importMontage: boolean,
  importDemontage: boolean,
): boolean {
  const hasMachinistePoste = postes.some(
    (p) => p.metierId === MACHINISTE_METIER_ID && p.heures > 0,
  );
  return hasMachinistePoste && (importMontage || importDemontage);
}

export interface RpcV2Args {
  _affaire_id: string | null;
  _new_affaire: Record<string, unknown>;
  _date_montage: string | null;
  _date_demontage: string | null;
  _devis: Record<string, unknown>;
  _postes: unknown[];
  _objets_fab: unknown[];
  _heures_montage: number | null;
  _heures_demontage: number | null;
  _fichier_hash: string | null;
}

/** Liste des clés requises côté RPC v2 (utilisé en test contractuel). */
export const RPC_V2_REQUIRED_KEYS: (keyof RpcV2Args)[] = [
  "_affaire_id",
  "_new_affaire",
  "_date_montage",
  "_date_demontage",
  "_devis",
  "_postes",
  "_objets_fab",
  "_heures_montage",
  "_heures_demontage",
  "_fichier_hash",
];

export function isValidRpcV2Args(args: Record<string, unknown>): boolean {
  return RPC_V2_REQUIRED_KEYS.every((k) => k in args);
}
