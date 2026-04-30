/**
 * v0.29.2 — Select dropdown pour choisir la typologie future d'une opportunité 9XXX.
 * Utilisé dans la vue Tableur (cellule éditable) et dans la modale Signer
 * (header informatif + override possible).
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AFFAIRE_TYPOLOGIES,
  AFFAIRE_TYPOLOGIE_LABELS,
  type AffaireTypologie,
} from "@/lib/affaire-typologie";

interface Props {
  value: AffaireTypologie | null;
  onChange: (next: AffaireTypologie | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

const NONE_VALUE = "__none__";

export function TypologieFutureSelect({
  value,
  onChange,
  disabled,
  placeholder = "Typologie cible…",
  className,
  ariaLabel,
}: Props) {
  return (
    <Select
      value={value ?? NONE_VALUE}
      onValueChange={(v) => onChange(v === NONE_VALUE ? null : (v as AffaireTypologie))}
      disabled={disabled}
    >
      <SelectTrigger className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>—</SelectItem>
        {AFFAIRE_TYPOLOGIES.map((t) => (
          <SelectItem key={t} value={t}>
            {AFFAIRE_TYPOLOGIE_LABELS[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
