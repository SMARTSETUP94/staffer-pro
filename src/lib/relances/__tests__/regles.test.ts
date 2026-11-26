import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DELAIS_DEFAUT, dimancheDeLaSemaine, lienOutlook, motifsRelance, prochaineActionParDefaut, texteAccueil, trierRelances, MAILTO_LIMITE_CORPS, type CasRelance } from "../regles";
import { contexteBrouillon } from "../brouillon";

const J = "2026-11-26"; // jeudi
const base: CasRelance = { statut: "a_faire", date_envoi: null, derniere_action_ouverte: null, derniere_action: null, statut_depuis: "2026-11-20", prochaine_echeance: "2026-12-01", validite_le: null, statut_devis: null };
const codes = (c: Partial<CasRelance>) => motifsRelance({ ...base, ...c }, J).map(m => m.code);

describe("motifs de relance (cas fictifs)", () => {
  it("devis envoyé il y a 8 jours sans action après l'envoi → sans réponse", () => {
    expect(codes({ statut: "envoye", date_envoi: "2026-11-18" })).toEqual(["envoye_sans_reponse"]);
  });
  it("envoyé il y a exactement 7 jours → pas encore", () => {
    expect(codes({ statut: "envoye", date_envoi: "2026-11-19" })).toEqual([]);
  });
  it("une action après l'envoi annule « sans réponse »", () => {
    expect(codes({ statut: "envoye", date_envoi: "2026-11-10", derniere_action_ouverte: "2026-11-12T10:00:00Z" })).toEqual([]);
  });
  it("prochaine action d'hier → en retard (1 j)", () => {
    expect(motifsRelance({ ...base, prochaine_echeance: "2026-11-25" }, J)).toEqual([{ code: "action_en_retard", priorite: 2, jours: 1 }]);
  });
  it("aucune prochaine action → sans prochaine action", () => {
    expect(codes({ prochaine_echeance: null })).toEqual(["sans_prochaine_action"]);
  });
  it("validité dans 7 jours d'un devis finalisé → validité proche ; dans 8 jours → non", () => {
    expect(codes({ validite_le: "2026-12-03", statut_devis: "valide" })).toEqual(["validite_proche"]);
    expect(codes({ validite_le: "2026-12-04", statut_devis: "valide" })).toEqual([]);
  });
  it("validité proche ignorée pour un brouillon", () => {
    expect(codes({ validite_le: "2026-11-28", statut_devis: "brouillon" })).toEqual([]);
  });
  it("« À l'étude » sans action depuis 14 jours → inactif ; 13 jours → non", () => {
    expect(codes({ statut: "a_l_etude", derniere_action: "2026-11-12T09:00:00Z" })).toEqual(["inactif"]);
    expect(codes({ statut: "a_l_etude", derniere_action: "2026-11-13T09:00:00Z" })).toEqual([]);
  });
  it("inactivité ne vaut pas pour « À faire »", () => {
    expect(codes({ statut: "a_faire", derniere_action: "2026-10-01T09:00:00Z" })).toEqual([]);
  });
  it("ordre retenu : validité proche avant inactivité", () => {
    expect(codes({ statut: "presque_gagne", derniere_action: "2026-11-01", validite_le: "2026-11-30", statut_devis: "transfere", prochaine_echeance: null }))
      .toEqual(["validite_proche", "inactif", "sans_prochaine_action"]);
  });
  it("délais paramétrés pris en compte", () => {
    expect(motifsRelance({ ...base, statut: "envoye", date_envoi: "2026-11-23" }, J, { ...DELAIS_DEFAUT, delai_envoi: 2 }).map(m => m.code)).toEqual(["envoye_sans_reponse"]);
  });
  it("tri : priorité puis montant décroissant", () => {
    const m = (p: number) => [{ code: "inactif" as const, priorite: p, jours: 1 }];
    const r = trierRelances([{ numero: "9001", motifs: m(4), montant_ht: 900 }, { numero: "9002", motifs: m(1), montant_ht: 10 }, { numero: "9003", motifs: m(4), montant_ht: 5000 }]);
    expect(r.map(x => x.numero)).toEqual(["9002", "9003", "9001"]);
  });
});

describe("dates", () => {
  it("ignorer cette semaine = jusqu'au dimanche", () => {
    expect(dimancheDeLaSemaine("2026-11-26")).toBe("2026-11-29");
    expect(dimancheDeLaSemaine("2026-11-29")).toBe("2026-11-29");
    expect(dimancheDeLaSemaine("2026-11-23")).toBe("2026-11-29");
  });
  it("prochaine action par défaut à J+7", () => { expect(prochaineActionParDefaut("2026-11-26")).toBe("2026-12-03"); });
  it("texte d'accueil", () => { expect(texteAccueil(1)).toBe("1 relance cette semaine"); expect(texteAccueil(4)).toBe("4 relances cette semaine"); });
});

describe("brouillon : aucun envoi possible", () => {
  it("le lien Outlook est un mailto prérempli, avec alerte au-delà de 1 800 caractères", () => {
    const court = lienOutlook({ a: "client@exemple.fr", objet: "Relance", corps: "Bonjour" });
    expect(court.href.startsWith("mailto:client@exemple.fr?")).toBe(true);
    expect(court.tronqueRisque).toBe(false);
    expect(MAILTO_LIMITE_CORPS).toBe(1800);
    expect(lienOutlook({ a: null, objet: "x", corps: "a".repeat(1801) }).tronqueRisque).toBe(true);
    expect(lienOutlook({ a: null, objet: "x", corps: "a".repeat(1800) }).tronqueRisque).toBe(false);
  });
  it("le montant n'est transmis à l'IA que s'il est coché", () => {
    const l = { affaire_id: "a", numero: "9999", titre: "Essai", client: "Client fictif", contact: null, charge_affaires_id: null, charge_affaires_nom: null, statut: "envoye" as const,
      devis_id: null, devis_numero: "9999-R1", version: 1, statut_redaction: "valide", date_envoi: "2026-11-10", validite_le: null, montant_ht: 12345.67, source_montant: "devis",
      motifs: [], derniere_action: null, jours_attente: 16, prochaine_action_due_le: null };
    expect(contexteBrouillon(l, { mentionnerMontant: false, historique: [], signataire: null })).not.toMatch(/12[\s ]?345/);
    expect(contexteBrouillon(l, { mentionnerMontant: true, historique: [], signataire: null })).toMatch(/12[\s  ]345,67/);
  });
  it("aucun code d'envoi de courrier dans le lot relances", () => {
    const fichiers = ["src/lib/relances/regles.ts", "src/lib/relances/brouillon.ts", "src/lib/server-fns/relances.functions.ts", "src/routes/_app.relances.tsx", "src/lib/mcp/tools/relances_a_faire.ts"];
    for (const f of fichiers) expect(readFileSync(f, "utf8")).not.toMatch(/sendMail|send_by_email|\/sendMail|createDraft|smtp|resend|nodemailer|send-email/i);
  });
  it("la cloche du lundi n'écrit que dans notifications, une fois par semaine et par personne", () => {
    const sql = readFileSync("drizzle/migrations/0155_relances_commerciales.sql", "utf8");
    const corps = sql.slice(sql.indexOf("FUNCTION public.relances_notifier_semaine"), sql.indexOf("cron.schedule"));
    expect(corps.match(/INSERT INTO (\w+)/g)).toEqual(["INSERT INTO notifications"]);
    expect(corps).not.toMatch(/net\.http|http_post|email|pg_net/i);
    expect(sql).toMatch(/UNIQUE INDEX notifications_relances_semaine_uniq ON public\.notifications \(user_id, \(metadata->>'relances_semaine'\)\)/);
    expect(sql).toMatch(/cron\.schedule\('relances-lundi','0 6 \* \* 1'/);
  });
});
