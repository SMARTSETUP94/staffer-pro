import { createFileRoute } from '@tanstack/react-router';
import { requireCapability } from '@/lib/capability-guard';
import { useCapability } from '@/hooks/use-capability';
import { PlanningEquipes } from '@/components/logistique/PlanningEquipes';
import { ImportHistoriqueConsolide } from '@/components/logistique/ImportHistoriqueConsolide';
import { HistoriqueAffectationsExport } from '@/components/logistique/HistoriqueAffectationsExport';

export const Route = createFileRoute('/_app/logistique/equipes')({
  beforeLoad: () => requireCapability('dispos.view'),
  head: () => ({ meta: [
    { title: 'Planning équipes terrain — Setup Paris' },
    { name: 'description', content: 'Affectations nominatives et historique des équipes logistiques Setup Paris.' },
    { property: 'og:title', content: 'Planning équipes terrain — Setup Paris' },
    { property: 'og:description', content: 'Planning hebdomadaire des équipes par étape et par personne.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  component: EquipesPage,
});
function EquipesPage() {
  const edit = useCapability('dispos.edit');
  return <div className="space-y-8 p-4 sm:p-6">{edit && <div className="flex justify-end"><HistoriqueAffectationsExport /></div>}<PlanningEquipes />{edit && <ImportHistoriqueConsolide />}</div>;
}