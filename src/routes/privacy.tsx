import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Politique de confidentialité — Setup Paris" },
      {
        name: "description",
        content:
          "Politique de confidentialité Setup Paris : données collectées, finalités, durée de conservation et droits RGPD.",
      },
      { property: "og:title", content: "Politique de confidentialité — Setup Paris" },
      {
        property: "og:description",
        content: "Comment Setup Paris collecte et protège les données de ses collaborateurs.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">
        ← Retour
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Politique de confidentialité</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Mise à jour : avril 2026 — Setup Paris
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">1. Données collectées</h2>
        <ul className="list-disc pl-6 text-sm leading-relaxed">
          <li>
            <strong>Identité</strong> : nom, prénom, email, photo, date de naissance.
          </li>
          <li>
            <strong>Contact</strong> : téléphone mobile, adresse postale.
          </li>
          <li>
            <strong>Pro</strong> : métier, compétences, permis, matricule SILAE.
          </li>
          <li>
            <strong>Contact d'urgence</strong> : nom, téléphone, lien de parenté.
          </li>
          <li>
            <strong>Activité</strong> : heures saisies, affectations, absences, déplacements.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">2. Pourquoi ces données ?</h2>
        <ul className="list-disc pl-6 text-sm leading-relaxed">
          <li>Préparation des paies via SILAE.</li>
          <li>Planification des chantiers et missions.</li>
          <li>Joindre vos proches en cas d'urgence sur site.</li>
          <li>Affecter les bons profils aux bonnes missions.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">3. Durée de conservation</h2>
        <p className="text-sm leading-relaxed">
          Vos données sont conservées pendant la durée de votre contrat, puis 5 ans après votre
          départ — conformément à nos obligations légales (Code du travail, URSSAF).
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">4. Vos droits RGPD</h2>
        <p className="text-sm leading-relaxed">
          Vous pouvez à tout moment :
        </p>
        <ul className="list-disc pl-6 text-sm leading-relaxed">
          <li>Consulter les données vous concernant.</li>
          <li>Demander leur rectification.</li>
          <li>Demander leur suppression (sauf obligation légale de conservation).</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold">5. Contact</h2>
        <p className="text-sm leading-relaxed">
          Référent RGPD : Gabin —{" "}
          <a className="text-primary hover:underline" href="mailto:g.chaussegros@groupe-smart.fr">
            g.chaussegros@groupe-smart.fr
          </a>
        </p>
      </section>
    </div>
  );
}
