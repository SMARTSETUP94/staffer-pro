/**
 * v0.45 — Hook qui expose le scope d'accès du chef connecté.
 *
 * - `isGlobal` : admin OU chef_chantier → vue transverse (toutes affaires).
 * - `isScoped` : chef_metier_scoped → accès UI large mais RLS DB borne ce
 *   qu'il peut écrire à `current_user_is_chef_on_affaire(affaire_id)`.
 *
 * L3b1 — NOTE : ce hook reste basé sur l'enum de rôle (useAuth), et NON
 * sur `useCapabilityScope`, car la matrice `role_capabilities` accorde
 * `scope='all'` à tous les rôles chef pour les caps planning/staffing.
 * La discrimination chef_global vs chef_metier_scoped vit uniquement
 * dans l'enum `app_role` et dans la fonction SQL
 * `current_user_is_chef_on_affaire`. Migrer vers une cap dédiée
 * (`affaire.scope.global` ou `affaire.scope.metier`) est tracké dans
 * mem://debts/audit-requirecapability-toutes-routes.
 * TODO L3b2/L5 : ajouter une cap "affaires.scope.global" pour pouvoir
 * dériver isGlobal/isScoped sans toucher au bridge auth-context.
 */
import { useAuth } from "@/lib/auth-context";

export interface ChefScope {
  isAdmin: boolean;
  isGlobal: boolean;
  isScoped: boolean;
  isAnyChef: boolean;
}

export function useChefScope(): ChefScope {
  const { isAdmin, isChefGlobal, isChefMetierScoped, isAdminOrChef } = useAuth();
  return {
    isAdmin,
    isGlobal: isChefGlobal,
    isScoped: isChefMetierScoped && !isChefGlobal,
    isAnyChef: isAdminOrChef,
  };
}
