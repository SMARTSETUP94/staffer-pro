import { CirclePlus } from "lucide-react";

/** Devis sur chantier 6XXX signé : icône discrète + infobulle (pas de marqueur à saisir). */
export const estChantierSigne6xxx = (numero?: string | null) => /^6\d{3}$/.test(String(numero ?? "").trim());
export function IconeSupplement() {
  const t = "Devis sur chantier signé (supplément)";
  return (
    <span title={t} aria-label={t} role="img" className="inline-flex shrink-0 text-warning">
      <CirclePlus className="h-3.5 w-3.5" />
    </span>
  );
}
