import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const TRAJET_CATEGORIE_LABEL: Record<string, string> = {
  pose: "Pose",
  depose: "Dépose",
  livraison_fourniture: "Livraison fourniture",
  recuperation_materiel: "Récupération matériel",
  autre: "Autre",
};

export interface TrajetForDevis {
  date: string; // YYYY-MM-DD
  heure_depart: string | null;
  categorie: string;
  adresse_depart: string;
  adresse_arrivee: string;
  notes: string | null;
}

export interface AffaireForDevis {
  numero: string;
  nom: string;
  client: string | null;
}

/**
 * Construit le texte d'une demande de devis sous-traitance pour un groupe de trajets.
 * Pure function — utilisée par /export/demandes-devis et testable unitairement.
 */
export function buildDemandeDevisTexte(
  affaire: AffaireForDevis | null,
  trajets: TrajetForDevis[],
): string {
  const lignes: string[] = [];
  lignes.push("Bonjour,");
  lignes.push("");
  if (affaire) {
    lignes.push(
      `Nous souhaitons obtenir un devis de transport pour l'affaire ${affaire.numero} — ${affaire.nom}${affaire.client ? ` (${affaire.client})` : ""}.`,
    );
  } else {
    lignes.push(
      "Nous souhaitons obtenir un devis de transport pour les trajets suivants :",
    );
  }
  lignes.push("");
  lignes.push("Trajets à réaliser :");
  trajets.forEach((t, idx) => {
    const dateFr = format(new Date(t.date + "T00:00:00"), "EEEE d MMMM yyyy", {
      locale: fr,
    });
    const heure = t.heure_depart ? ` à ${t.heure_depart.slice(0, 5)}` : "";
    const cat = TRAJET_CATEGORIE_LABEL[t.categorie] ?? t.categorie;
    lignes.push(`${idx + 1}. ${dateFr}${heure} — ${cat}`);
    lignes.push(`   • Départ : ${t.adresse_depart}`);
    lignes.push(`   • Arrivée : ${t.adresse_arrivee}`);
    if (t.notes) lignes.push(`   • Notes : ${t.notes}`);
  });
  lignes.push("");
  lignes.push(
    "Merci de nous transmettre votre meilleur devis dans les meilleurs délais.",
  );
  lignes.push("");
  lignes.push("Cordialement,");
  lignes.push("L'équipe Setup Paris");
  return lignes.join("\n");
}
