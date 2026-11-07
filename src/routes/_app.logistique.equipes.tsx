import { createFileRoute, redirect } from '@tanstack/react-router';

/** Ancienne page « Planning équipes » : devenue l'onglet Équipes du Planning logistique. */
export const Route = createFileRoute('/_app/logistique/equipes')({
  beforeLoad: () => { throw redirect({ to: '/logistique', search: { vue: 'equipes' }, replace: true }); },
  head: () => ({ meta: [
    { title: 'Planning équipes terrain — Setup Paris' },
    { name: 'description', content: 'Redirection vers l’onglet Équipes du Planning logistique.' },
    { property: 'og:title', content: 'Planning équipes terrain — Setup Paris' },
    { property: 'og:description', content: 'Planning hebdomadaire des équipes par étape et par personne.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
});
