import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, CalendarRange, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { matchesOpportunityKeywords } from "@/lib/opportunite-search";
import { PROJET_ROLE_LABELS, type ProjetRole } from "@/lib/labels";
import {
  ROLES_AVEC_PERIODE, chargeLabel, nomComplet, ordonnerCandidats, periodeProposee, phasesFromList,
  rolesVisibles, typologieEffective, type AffaireEtat, type OptionGroupe,
} from "@/lib/equipe-projet";
import {
  useAffaireRoles, useAffecterRole, useChargeRolesProjet, useEmployesActifs, useRoleReferents, useTypologiePhases,
} from "@/hooks/use-equipe-projet";
import { RolesManquantsBadges } from "./RolesManquantsBadges";

const GROUPE_LABEL: Record<OptionGroupe, string> = { principal: "Principaux", secondaire: "Secondaires", autre: "Autres employés actifs" };

type AffaireDates = {
  id: string; phase: string | null; statut_opportunite: string | null; typologie: string | null; typologie_future: string | null;
  date_debut_production: string | null; date_debut: string | null; date_demontage: string | null; date_fin_prevue: string | null; date_montage: string | null;
};

/** Bloc « Équipe projet » partagé entre fiche affaire et fiche opportunité. */
export function EquipeProjetBloc({ affaireId, canEdit }: { affaireId: string; canEdit: boolean }) {
  const { data: affaire } = useQuery({
    queryKey: ["affaire-equipe-projet-meta", affaireId],
    queryFn: async () => {
      const { data, error } = await supabase.from("affaires")
        .select("id,phase,statut_opportunite,typologie,typologie_future,date_debut_production,date_debut,date_demontage,date_fin_prevue,date_montage")
        .eq("id", affaireId).maybeSingle();
      if (error) throw error;
      return data as AffaireDates | null;
    },
  });
  const { data: roles = [] } = useAffaireRoles(affaireId);
  const { data: phasesMap } = useTypologiePhases();
  const typologie = affaire ? typologieEffective(affaire) : null;
  const phases = phasesFromList(typologie ? phasesMap?.get(typologie) : []);
  const visibles = rolesVisibles(phases);
  const etat: AffaireEtat = { phase: affaire?.phase ?? null, statut_opportunite: affaire?.statut_opportunite ?? null };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Équipe projet</h2>
      </div>
      <RolesManquantsBadges etat={etat} typologie={typologie} affectes={roles.map((r) => r.role)} />
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibles.map((role) => (
          <RoleLigne key={role} affaireId={affaireId} role={role} row={roles.find((r) => r.role === role)} affaire={affaire ?? null} canEdit={canEdit} />
        ))}
      </div>
    </section>
  );
}

function RoleLigne({ affaireId, role, row, affaire, canEdit }: {
  affaireId: string; role: ProjetRole; row: { employe_id: string; date_debut: string | null; date_fin: string | null } | undefined;
  affaire: AffaireDates | null; canEdit: boolean;
}) {
  const affecter = useAffecterRole();
  const [saving, setSaving] = useState(false);
  const avecPeriode = ROLES_AVEC_PERIODE.includes(role);

  async function save(args: { employeId: string | null; dateDebut?: string | null; dateFin?: string | null; remplacerDates?: boolean }) {
    setSaving(true);
    try {
      await affecter({ affaireId, role, ...args });
      toast.success(`${PROJET_ROLE_LABELS[role]} enregistré`);
    } catch (e) {
      toast.error("Affectation impossible", { description: e instanceof Error ? e.message : String(e) });
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-border/60 p-2.5">
      <p className="text-xs font-medium text-muted-foreground">{PROJET_ROLE_LABELS[role]}</p>
      <EmployeRoleCombobox role={role} value={row?.employe_id ?? null} disabled={!canEdit || saving}
        onChange={(id) => { if (id !== (row?.employe_id ?? null)) void save({ employeId: id }); }} />
      {avecPeriode && row && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Input type="date" aria-label={`Début ${PROJET_ROLE_LABELS[role]}`} className="h-8 w-36 text-xs" disabled={!canEdit || saving}
            value={row.date_debut ?? ""} onChange={(e) => void save({ employeId: row.employe_id, dateDebut: e.target.value || null, dateFin: row.date_fin, remplacerDates: true })} />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" aria-label={`Fin ${PROJET_ROLE_LABELS[role]}`} className="h-8 w-36 text-xs" disabled={!canEdit || saving}
            value={row.date_fin ?? ""} onChange={(e) => void save({ employeId: row.employe_id, dateDebut: row.date_debut, dateFin: e.target.value || null, remplacerDates: true })} />
          {canEdit && affaire && (
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={saving}
              onClick={() => { const p = periodeProposee(role, affaire); void save({ employeId: row.employe_id, dateDebut: p.date_debut, dateFin: p.date_fin, remplacerDates: true }); }}>
              <CalendarRange className="mr-1 h-3.5 w-3.5" /> Planifier
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function EmployeRoleCombobox({ role, value, onChange, disabled }: {
  role: ProjetRole; value: string | null; onChange: (id: string | null) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: employes = [], isLoading } = useEmployesActifs();
  const { data: referents = [] } = useRoleReferents();
  const { data: charges } = useChargeRolesProjet();
  const candidats = useMemo(() => ordonnerCandidats(employes, referents.filter((r) => r.role === role)), [employes, referents, role]);
  const selected = employes.find((e) => e.id === value);
  const groups: OptionGroupe[] = ["principal", "secondaire", "autre"];
  const label = (id: string, nom: string) => chargeLabel(nom, charges?.get(`${id}|${role}`));

  return (
    <Popover open={open} onOpenChange={(n) => { setOpen(n); if (n) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-label={PROJET_ROLE_LABELS[role]} aria-expanded={open}
          disabled={disabled || isLoading} className="h-9 w-full justify-between gap-2 font-normal">
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {selected ? label(selected.id, nomComplet(selected)) : value ? "Employé inactif" : "À affecter"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Rechercher une personne…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Aucune personne trouvée.</CommandEmpty>
            {!search && value && (
              <CommandGroup><CommandItem value="__clear__" onSelect={() => { onChange(null); setOpen(false); }}>Retirer l'affectation</CommandItem></CommandGroup>
            )}
            {groups.map((g) => {
              const items = candidats.filter((c) => c.groupe === g && matchesOpportunityKeywords([nomComplet(c.employe)], search));
              if (!items.length) return null;
              return (
                <CommandGroup key={g} heading={GROUPE_LABEL[g]}>
                  {items.map(({ employe }) => (
                    <CommandItem key={employe.id} value={employe.id} onSelect={() => { onChange(employe.id); setOpen(false); }}>
                      <Check className={cn("mr-2 h-4 w-4 shrink-0", value === employe.id ? "opacity-100" : "opacity-0")} />
                      <span className="break-words">{label(employe.id, nomComplet(employe))}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
