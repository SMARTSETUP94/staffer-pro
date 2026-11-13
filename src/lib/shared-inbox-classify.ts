/**
 * Classification IA des emails des boîtes partagées (log@ / devis@).
 * Partagé entre le releveur (poll-shared-inboxes) et la relance admin.
 * Server-only : utilise LOVABLE_API_KEY passé en paramètre.
 */
import { lireGabaritLogistique } from "@/lib/logistique/gabarit-demande";

const MAX_BODY = 8000;

export type SharedSource = "logistique" | "devis";

export type SharedCls = {
  categorie: "candidature" | "opportunite" | "pub" | "logistique" | "autre";
  confiance: number;
  metier?: string | null;
  poste_devine?: string | null;
  nom?: string | null;
  prenom?: string | null;
  resume?: string | null;
  opp_client?: string | null;
  opp_projet?: string | null;
  opp_taille?: string | null;
  opp_date_evenement?: string | null;
  opp_lieu?: string | null;
  opp_besoins?: string | null;
  echeances?: EcheanceDetectee[] | null;
};

export type EcheanceDetectee = {
  date: string;
  libelle: string;
  type?: string | null;
  affaire_numero?: string | null;
  heure_debut?: string | null;
  heure_fin?: string | null;
  a_partir_de?: boolean | null;
  lieu?: string | null;
  contact_sur_place?: string | null;
  acces?: string | null;
  nb_personnes?: number | null;
  vehicule?: string | null;
  responsable?: string | null;
  commentaire?: string | null;
  source?: "gabarit" | "ia" | "formulaire";
};

export type ClassifyInput = {
  fromName?: string | null;
  fromEmail?: string | null;
  subject?: string | null;
  body?: string | null;
  bodyContentType?: string | null;
  bodyPreview?: string | null;
  receivedAt?: string | null;
};

/** HTML → texte brut, espaces compactés, tronqué à 8000 caractères. */
export function bodyToPlainText(content: string | null | undefined, contentType?: string | null): string {
  if (!content) return "";
  let t = content;
  const isHtml = (contentType ?? "").toLowerCase() === "html" || /<\/?[a-z][\s\S]*>/i.test(t);
  if (isHtml) {
    t = t
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h\d|table)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  }
  t = t.replace(/[ \t\f\v\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim();
  return t.slice(0, MAX_BODY);
}

export function construireClassification(input: ClassifyInput, source: SharedSource, exemples = "") {
  const hint =
    source === "devis"
      ? "Cet email arrive sur devis@setup.paris, la boîte des demandes clients : privilégie 'opportunite' sauf évidence contraire. "
      : "Cet email arrive sur log@setup.paris, la boîte logistique : privilégie 'logistique' sauf évidence contraire. ";
  const sys =
    "Tu tries des emails entrants pour une société de scénographie événementielle (SETUP Paris). " +
    hint +
    "Catégories : 'candidature', 'opportunite' (demande de devis, projet client), 'logistique' (transport, livraison, enlèvement, accès site, horaires), 'pub', 'autre'. " +
    "Si candidature, devine le métier parmi : construction, métallerie, peinture, numérique, tapisserie, machiniste, logistique, suivi_projet. " +
    "Si l'email est un transfert, le vrai demandeur est le premier expéditeur externe après les transferts internes. Les en-têtes Expéditeur et Sujet fournis ont priorité. Ignore les signatures des transmetteurs SETUP. " +
    "Pour les formulaires \"Setup client form\", lis les champs du formulaire. " +
    "Si opportunité, remplis les champs opp_* (client, projet, taille estimée : tres_petit <5k€, petit 5-20k€, moyen 20-80k€, gros 80-250k€, tres_gros >250k€, date YYYY-MM-DD, lieu, besoins), sinon mets-les à null. " +
    "opp_client = nom de la société cliente (marque, agence, chaîne TV, production), jamais SETUP ni un collègue SETUP, sans forme juridique (SAS, SARL). " +
    "opp_projet = nom de projet court et parlant (3 à 7 mots), au format « <Ouvrage/prestation> <Client ou événement> [<mois année>] », ex. « Stand Salon du Chocolat Nov 2026 », « Décor plateau 20h30 France 2 », « Cabine podcast NRJ ». " +
    "Ne recopie jamais l'objet de l'email, pas de préfixes TR:/RE:/Fw:, pas de « Demande de devis », pas de majuscules intégrales. " +
    "Si l'email mentionne des échéances de chantier (dates de livraison, montage, démontage, enlèvement, chargement, accès site, permanence...), liste-les dans echeances. " + "RÈGLES PLATEAU TV (planning de production d'émission) : SETUP assure une PERMANENCE (type permanence) chaque jour de TOURNAGE et chaque jour de « répétitions toutes équipes » ; une étape par date. Les encodages et les répétitions simples (sans « toutes équipes ») ne génèrent rien. Une liste « 4, 5 janvier 2027 » ou « 24, 25 et 30 novembre » = une date par jour cité, ne jamais en sauter. Une installation de nuit (ex. double fauteuil dans la nuit du jeudi au vendredi) = une étape montage à la date du jeudi, avec la précision en note. « Montage / démontage selon jalonnement » sans date = aucune étape (le jalonnement viendra à part). Un traçage daté = étape tracage. Mets dans le libellé/la note la séquence (ex. « Perm. tournage Blinds J2 », « Perm. répét. toutes équipes Battles »). Dates « en option » : garde-les avec « (option) » dans le libellé. " +
    "Format : " +
    "date au format YYYY-MM-DD, libelle court (ex. « Livraison plateau »), type parmi appro/emballage/chargement/livraison/tracage/montage/finitions/permanence/rotation/demontage/dechargement (null si incertain), " +
    "et affaire_numero si un numéro de chantier (4 à 5 chiffres, ex. 6034) ou d'opportunité (9XXX) est cité, sinon null. " +
    "Pour chaque échéance, remplis aussi heure_debut et heure_fin (HH:MM), a_partir_de (true si « à partir de »), lieu (adresse), contact_sur_place (nom + téléphone), acces, nb_personnes, vehicule (tel qu'écrit), responsable (chef d'équipe), commentaire : null si absent, n'invente rien. " +
    "IMPORTANT : seule la demande la plus récente (haut du mail, avant « De : / From: / Le … a écrit ») crée des échéances ; l'historique cité sert uniquement de contexte et ne génère aucune échéance. " +
    "Tableau vide si aucune échéance. Réponds STRICTEMENT en JSON." + (source === "logistique" ? exemples : "");
  const text = bodyToPlainText(input.body, input.bodyContentType) || input.bodyPreview || "";
  const recu = input.receivedAt ? ` (reçu le ${input.receivedAt.slice(0, 10)} : l'année des dates sans année se déduit de cette date de réception)` : "";
  const contenu = `Expéditeur: ${input.fromName ?? ""} <${input.fromEmail ?? ""}>\nSujet: ${input.subject ?? ""}${recu}\nCorps:\n${text}`;
  const schema = {
            type: "object",
            additionalProperties: false,
            properties: {
              categorie: { type: "string", enum: ["candidature", "opportunite", "pub", "logistique", "autre"] },
              confiance: { type: "number", minimum: 0, maximum: 1 },
              metier: { type: ["string", "null"] },
              poste_devine: { type: ["string", "null"] },
              nom: { type: ["string", "null"] },
              prenom: { type: ["string", "null"] },
              resume: { type: ["string", "null"] },
              opp_client: { type: ["string", "null"] },
              opp_projet: { type: ["string", "null"] },
              opp_taille: { type: ["string", "null"], enum: ["tres_petit", "petit", "moyen", "gros", "tres_gros", null] },
              opp_date_evenement: { type: ["string", "null"] },
              opp_lieu: { type: ["string", "null"] },
              opp_besoins: { type: ["string", "null"] },
              echeances: {
                type: ["array", "null"],
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    date: { type: "string" },
                    libelle: { type: "string" },
                    type: { type: ["string", "null"], enum: ["appro", "emballage", "chargement", "livraison", "tracage", "montage", "finitions", "permanence", "rotation", "demontage", "dechargement", null] },
                    affaire_numero: { type: ["string", "null"] },
                    heure_debut: { type: ["string", "null"] },
                    heure_fin: { type: ["string", "null"] },
                    a_partir_de: { type: ["boolean", "null"] },
                    lieu: { type: ["string", "null"] },
                    contact_sur_place: { type: ["string", "null"] },
                    acces: { type: ["string", "null"] },
                    nb_personnes: { type: ["integer", "null"] },
                    vehicule: { type: ["string", "null"] },
                    responsable: { type: ["string", "null"] },
                    commentaire: { type: ["string", "null"] },
                  },
                  required: ["date", "libelle", "type", "affaire_numero", "heure_debut", "heure_fin", "a_partir_de", "lieu", "contact_sur_place", "acces", "nb_personnes", "vehicule", "responsable", "commentaire"],
                },
              },
            },
            required: ["categorie", "confiance", "metier", "poste_devine", "nom", "prenom", "resume", "opp_client", "opp_projet", "opp_taille", "opp_date_evenement", "opp_lieu", "opp_besoins", "echeances"],
          },;
  return { systeme: sys, contenu, schema };
}

export async function classifySharedEmail(key: string, input: ClassifyInput, source: SharedSource, exemples = "", modele?: string): Promise<SharedCls> {
  const { appelerIAJson } = await import("@/lib/ai/fournisseur.server");
  const c = construireClassification(input, source, exemples);
  const r = await appelerIAJson<SharedCls>(key, { usage: source === "logistique" ? "extraction_logistique" : "tri_mails", systeme: c.systeme, contenu: c.contenu, schema: c.schema, nomSchema: "email_classification", modele });
  return appliquerGabarit(r.data, input, source);
}

/** Le gabarit lu sans IA est prioritaire sur les échéances de l'IA (log@ uniquement). */
export function appliquerGabarit(cls: SharedCls, input: ClassifyInput, source: SharedSource): SharedCls {
  if (source !== "logistique") return cls;
  const text = bodyToPlainText(input.body, input.bodyContentType) || input.bodyPreview || "";
  const g = lireGabaritLogistique(text, input.receivedAt ? new Date(input.receivedAt) : new Date());
  if (g) return { ...cls, categorie: "logistique", echeances: g };
  return { ...cls, echeances: (cls.echeances ?? []).map((e) => ({ ...e, source: "ia" as const })) };
}

export function clsToMetadata(cls: SharedCls) {
  return {
    metier: cls.metier ?? null,
    poste_devine: cls.poste_devine ?? null,
    nom: cls.nom ?? null,
    prenom: cls.prenom ?? null,
    resume: cls.resume ?? null,
    opp_client: cls.opp_client ?? null,
    opp_projet: cls.opp_projet ?? null,
    opp_taille: cls.opp_taille ?? null,
    opp_date_evenement: cls.opp_date_evenement ?? null,
    opp_lieu: cls.opp_lieu ?? null,
    opp_besoins: cls.opp_besoins ?? null,
    echeances: cls.echeances ?? [],
  };
}
