/**
 * v0.45 — Hook qui expose le scope d'accès du chef connecté.
 *
 * - `isGlobal` : admin OU chef_chantier → vue transverse (toutes affaires).
 * - `isScoped` : chef_metier_scoped → accès UI large mais RLS DB borne ce
 *   qu'il peut écrire à `current_user_is_chef_on_affaire(affaire_id)`.
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
