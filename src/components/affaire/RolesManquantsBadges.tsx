import { AlertTriangle, UserPlus } from "lucide-react";
import { projetRoleLabel } from "@/lib/labels";
import { PRESQUE_GAGNE_ALERTE_JOURS, phasesFromList, presqueGagneEnRetard, rolesManquants, type AffaireEtat } from "@/lib/equipe-projet";
import { useTypologiePhases } from "@/hooks/use-equipe-projet";

/** Badges non bloquants « rôle à affecter » (fiche + carte Kanban). */
export function RolesManquantsBadges({ etat, typologie, affectes }: {
  etat: AffaireEtat; typologie: string | null; affectes: string[];
}) {
  const { data: phasesMap } = useTypologiePhases();
  const phases = phasesFromList(typologie ? phasesMap?.get(typologie) : []);
  const manquants = rolesManquants(etat, phases, affectes);
  if (manquants.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {manquants.map((r) => (
        <span key={r} className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800"
          title="Rôle à affecter (non bloquant)">
          <UserPlus className="h-2.5 w-2.5" /> {projetRoleLabel(r)} à affecter
        </span>
      ))}
    </div>
  );
}

export function PresqueGagneAlerte({ statut, depuis }: { statut: string | null | undefined; depuis: string | null | undefined }) {
  if (!presqueGagneEnRetard(statut, depuis)) return null;
  const jours = Math.floor((Date.now() - new Date(depuis!).getTime()) / 86_400_000);
  return (
    <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900"
      title={`En « Presque gagné » depuis plus de ${PRESQUE_GAGNE_ALERTE_JOURS} jours`}>
      <AlertTriangle className="h-2.5 w-2.5" /> Presque gagné depuis {jours} j
    </div>
  );
}
