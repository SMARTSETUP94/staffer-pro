/**
 * <CapabilityGuard cap="..." fallback={null}> — Rend ses enfants uniquement
 * si l'utilisateur courant possède la capability donnée.
 *
 * Pendant le chargement initial des caps, retourne `fallback` (par défaut `null`)
 * pour éviter un flash de contenu interdit.
 *
 * Usage typique : cacher un onglet/bouton/zone alors que la route reste
 * accessible. Pour bloquer toute la route, préférer `requireCapability` dans
 * le `beforeLoad` de la route (src/lib/capability-guard.ts).
 */
import type { ReactNode } from "react";
import { useCapability } from "@/hooks/use-capability";

interface Props {
  cap: string;
  fallback?: ReactNode;
  children: ReactNode;
}

export function CapabilityGuard({ cap, fallback = null, children }: Props) {
  const ok = useCapability(cap);
  if (!ok) return <>{fallback}</>;
  return <>{children}</>;
}
