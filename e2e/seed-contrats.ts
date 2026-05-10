/**
 * Seed E2E dédié module contrats intermittents (Tour 3 tests E2E).
 *
 * Crée/réactive 1 employé "TEST INTERMITTENT" idempotent avec :
 *  - statut_contrat = 'CDDU intermittent'
 *  - actif = true
 *  - taux_horaire_brut / taux_horaire_charge non-nuls
 *  - profile_id NULL (pas de compte auth — pure cible staffing)
 *
 * Évite la collision avec data prod en utilisant un nom unique (préfixe
 * "TEST " réservé) et un email synthétique.
 *
 * Usage : `bun run e2e/seed-contrats.ts`
 *
 * Variables d'env requises (mêmes que e2e/seed.ts) :
 *   E2E_SUPABASE_URL
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *
 * Optionnel :
 *   E2E_TEST_INTERMITTENT_NAME (défaut "TEST INTERMITTENT")
 */
import { createClient } from "@supabase/supabase-js";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[seed-contrats] env manquant : ${name}`);
  return v;
}

const url = req("E2E_SUPABASE_URL");
const serviceKey = req("E2E_SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FULL_NAME = process.env.E2E_TEST_INTERMITTENT_NAME ?? "TEST INTERMITTENT";
const [PRENOM, ...rest] = FULL_NAME.split(" ");
const NOM = rest.join(" ") || "INTERMITTENT";
const EMAIL = `e2e-test-intermittent@example.invalid`;

async function main() {
  // Métier par défaut
  const { data: metiers, error: mErr } = await admin
    .from("metiers")
    .select("id")
    .order("ordre")
    .limit(1);
  if (mErr) throw mErr;
  const metierId = metiers?.[0]?.id ?? 1;

  const { data: existing } = await admin
    .from("employes")
    .select("id")
    .eq("email", EMAIL)
    .maybeSingle();

  const payload = {
    prenom: PRENOM,
    nom: NOM,
    email: EMAIL,
    type_contrat: "Interim" as const,
    statut_contrat: "CDDU intermittent" as const,
    metier_principal_id: metierId,
    taux_horaire_brut: 18.5,
    taux_horaire_charge: 28.7,
    forfait: false,
    actif: true,
  };

  if (existing) {
    const { error } = await admin.from("employes").update(payload).eq("id", existing.id);
    if (error) throw error;
    console.log(`[seed-contrats] ${FULL_NAME} : update ${existing.id}`);
  } else {
    const { data, error } = await admin
      .from("employes")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    console.log(`[seed-contrats] ${FULL_NAME} : créé ${data.id}`);
  }
  console.log("[seed-contrats] OK");
}

main().catch((e) => {
  console.error("[seed-contrats] FAIL", e);
  process.exit(1);
});
