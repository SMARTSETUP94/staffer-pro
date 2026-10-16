/**
 * Classification IA des emails des boîtes partagées (log@ / devis@).
 * Partagé entre le releveur (poll-shared-inboxes) et la relance admin.
 * Server-only : utilise LOVABLE_API_KEY passé en paramètre.
 */
const AI_GW = "https://ai.gateway.lovable.dev/v1/chat/completions";
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
};

export type ClassifyInput = {
  fromName?: string | null;
  fromEmail?: string | null;
  subject?: string | null;
  body?: string | null;
  bodyContentType?: string | null;
  bodyPreview?: string | null;
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

export async function classifySharedEmail(key: string, input: ClassifyInput, source: SharedSource, exemples = ""): Promise<SharedCls> {
  const hint =
    source === "devis"
      ? "Cet email arrive sur devis@setup.paris, la boîte des demandes clients : privilégie 'opportunite' sauf évidence contraire. "
      : "Cet email arrive sur log@setup.paris, la boîte logistique : privilégie 'logistique' sauf évidence contraire. ";
  const sys =
    "Tu tries des emails entrants pour une société de scénographie événementielle (SETUP Paris). " +
    hint +
    "Catégories : 'candidature', 'opportunite' (demande de devis, projet client), 'logistique' (transport, livraison, enlèvement, accès site, horaires), 'pub', 'autre'. " +
    "Si candidature, devine le métier parmi : construction, métallerie, peinture, numérique, tapisserie, machiniste, logistique, suivi_projet. " +
    "Si l'email est un transfert, le vrai demandeur est l'expéditeur du message d'origine (bloc De :/From: le plus bas). " +
    "Pour les formulaires \"Setup client form\", lis les champs du formulaire. " +
    "Si opportunité, remplis les champs opp_* (client, projet, taille estimée : tres_petit <5k€, petit 5-20k€, moyen 20-80k€, gros 80-250k€, tres_gros >250k€, date YYYY-MM-DD, lieu, besoins), sinon mets-les à null. " +
    "opp_client = nom de la société cliente (marque, agence, chaîne TV, production), jamais SETUP ni un collègue SETUP, sans forme juridique (SAS, SARL). " +
    "opp_projet = nom de projet court et parlant (3 à 7 mots), au format « <Ouvrage/prestation> <Client ou événement> [<mois année>] », ex. « Stand Salon du Chocolat Nov 2026 », « Décor plateau 20h30 France 2 », « Cabine podcast NRJ ». " +
    "Ne recopie jamais l'objet de l'email, pas de préfixes TR:/RE:/Fw:, pas de « Demande de devis », pas de majuscules intégrales. " +
    "Si l'email mentionne des échéances de chantier (dates de livraison, montage, démontage, enlèvement, chargement, accès site, permanence...), liste-les dans echeances : " +
    "date au format YYYY-MM-DD, libelle court (ex. « Livraison plateau »), type parmi appro/emballage/chargement/livraison/tracage/montage/finitions/permanence/rotation/demontage/dechargement (null si incertain), " +
    "et affaire_numero si un numéro de chantier (4 à 5 chiffres, ex. 6034) ou d'opportunité (9XXX) est cité, sinon null. Tableau vide si aucune échéance. Réponds STRICTEMENT en JSON." + (source === "logistique" ? exemples : "");
  const text = bodyToPlainText(input.body, input.bodyContentType) || input.bodyPreview || "";
  const res = await fetch(AI_GW, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "raw-fetch" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: `Expéditeur: ${input.fromName ?? ""} <${input.fromEmail ?? ""}>\nSujet: ${input.subject ?? ""}\nCorps:\n${text}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "email_classification",
          strict: true,
          schema: {
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
                  },
                  required: ["date", "libelle", "type", "affaire_numero"],
                },
              },
            },
            required: ["categorie", "confiance", "metier", "poste_devine", "nom", "prenom", "resume", "opp_client", "opp_projet", "opp_taille", "opp_date_evenement", "opp_lieu", "opp_besoins", "echeances"],
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as SharedCls;
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
