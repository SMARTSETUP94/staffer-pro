/**
 * Tour 2 — Helpers signature contrat (employé / employeur).
 *
 * Workflow :
 *  1. Upload PNG signature dans bucket privé `contrats-intermittents/{employee_id}/{contrat_id}/sig_{role}_{ts}.png`
 *  2. Génération PDF v2 (employé) ou v3 (employeur) avec signature(s) incrustée(s)
 *  3. Upload PDF dans `contrats-intermittents/{employee_id}/{contrat_id}/v{2|3}.pdf`
 *  4. Hash SHA-256 du PDF
 *  5. Appel RPC `signer_contrat_employe` ou `signer_contrat_employeur`
 *  6. Notification RH in-app via realtime sur `contrats_signatures`
 */
import { supabase } from "@/integrations/supabase/client";
import { generateContratPdfBlob, sha256OfBlob, type ContratPdfData } from "./contrats-pdf";

export interface FullContratRecord {
  id: string;
  employee_id: string;
  chantier_id: string;
  date_debut: string;
  date_fin: string;
  taux_horaire_brut: number | null;
  forfait: boolean;
  heures_estimees: number | null;
  pdf_v1_url: string | null;
  pdf_v2_url: string | null;
  pdf_v3_url: string | null;
  statut: string;
  template_version_id: string | null;
  // joins
  employes?: {
    nom: string;
    prenom: string;
    adresse: string | null;
    email: string | null;
    statut_contrat: string | null;
    poste_principal: string | null;
    est_cadre: boolean | null;
  } | null;
  affaires?: {
    numero: string;
    nom: string;
    lieu: string | null;
  } | null;
  contrat_templates?: {
    contenu_html: string;
  } | null;
  contrats_signatures?: Array<{
    role_signature: string;
    signature_image_url: string | null;
    signed_at: string;
  }>;
}

const BUCKET = "contrats-intermittents";

async function uploadBlob(path: string, blob: Blob, contentType: string): Promise<string> {
  console.log("[contrat-signature][upload:start]", { path, contentType, size: blob.size });
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType,
  });
  if (error) throw new Error(`Upload échec: ${error.message}`);
  // signed URL valide 1 an (privé)
  const { data, error: urlErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
  if (urlErr || !data) throw new Error(`URL signée échec: ${urlErr?.message}`);
  console.log("[contrat-signature][upload:ok]", { path, signedUrlLength: data.signedUrl.length });
  return data.signedUrl;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] ?? "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function buildPdfData(c: FullContratRecord, sigEmploye?: string | null, sigEmployeur?: string | null): ContratPdfData {
  const sigE = c.contrats_signatures?.find((s) => s.role_signature === "employe");
  const sigEr = c.contrats_signatures?.find((s) => s.role_signature === "employeur");
  return {
    numero_contrat: c.id.slice(0, 8).toUpperCase(),
    employe_nom: c.employes?.nom ?? "—",
    employe_prenom: c.employes?.prenom ?? "—",
    employe_adresse: c.employes?.adresse ?? null,
    employe_email: c.employes?.email ?? null,
    chantier_nom: c.affaires?.nom ?? "—",
    chantier_numero: c.affaires?.numero ?? "—",
    chantier_lieu: c.affaires?.lieu ?? null,
    date_debut: c.date_debut,
    date_fin: c.date_fin,
    heures_estimees: c.heures_estimees,
    taux_horaire_brut: c.taux_horaire_brut,
    forfait: c.forfait,
    statut_contrat: c.employes?.statut_contrat ?? "CDDU intermittent du spectacle",
    categorie_pro: c.employes?.est_cadre ? "Cadre" : "Non cadre",
    signature_employe_url: sigEmploye ?? sigE?.signature_image_url ?? null,
    signature_employeur_url: sigEmployeur ?? sigEr?.signature_image_url ?? null,
    signed_at_employe: sigE?.signed_at ?? null,
    signed_at_employeur: sigEr?.signed_at ?? null,
    template_html: c.contrat_templates?.contenu_html ?? null,
    // {{poste}} provient du POSTE PRINCIPAL pérenne de l'employé.
    // Fallback "Technicien de plateau" géré dans contrats-pdf.tsx si null/vide.
    poste: c.employes?.poste_principal ?? null,
  };
}

/** Génère et uploade la version vierge (v1). Appelé après création par /staffer-mobile. */
export async function generateContratV1(contratId: string): Promise<string> {
  const c = await fetchContratFull(contratId);
  const blob = await generateContratPdfBlob(buildPdfData(c));
  const url = await uploadBlob(`${c.employee_id}/${c.id}/v1.pdf`, blob, "application/pdf");
  await supabase.rpc("set_contrat_pdf_url", { p_contrat_id: contratId, p_version: 1, p_url: url });
  return url;
}

/** Workflow employé : signature PNG → upload → PDF v2 → RPC. */
export async function signContratAsEmploye(contratId: string, signatureDataUrl: string): Promise<void> {
  console.log("[contrat-signature][employe:start]", { contratId, signatureLength: signatureDataUrl.length });
  const c = await fetchContratFull(contratId);
  console.log("[contrat-signature][employe:contrat]", { id: c.id, employee_id: c.employee_id, statut: c.statut, signatures: c.contrats_signatures?.length ?? 0 });
  const ts = Date.now();

  // 1. Upload PNG signature
  const sigBlob = dataUrlToBlob(signatureDataUrl);
  const sigUrl = await uploadBlob(`${c.employee_id}/${c.id}/sig_employe_${ts}.png`, sigBlob, "image/png");

  // 2. Génère PDF v2 avec signature incrustée
  console.log("[contrat-signature][employe:pdf:start]");
  const pdfBlob = await generateContratPdfBlob(buildPdfData(c, sigUrl, null));
  console.log("[contrat-signature][employe:pdf:ok]", { size: pdfBlob.size });
  const pdfV2Url = await uploadBlob(`${c.employee_id}/${c.id}/v2.pdf`, pdfBlob, "application/pdf");
  const hash = await sha256OfBlob(pdfBlob);
  console.log("[contrat-signature][employe:hash]", { hash });

  // 3. Capture user-agent + IP (IP côté serveur via header X-Forwarded-For — laissé NULL ici)
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;

  // 4. RPC transaction atomique
  console.log("[contrat-signature][employe:rpc:start]", { contratId, hasSigUrl: !!sigUrl, hasPdfUrl: !!pdfV2Url, ua: !!ua });
  const { error } = await supabase.rpc("signer_contrat_employe", {
    p_contrat_id: contratId,
    p_signature_image_url: sigUrl,
    p_pdf_v2_url: pdfV2Url,
    p_pdf_hash_sha256: hash,
    p_client_ip: null as unknown as string | undefined,
    p_user_agent: (ua ?? null) as unknown as string | undefined,
  });
  console.log("[contrat-signature][employe:rpc:response]", { error });
  if (error) throw new Error(error.message);
}

export async function signContratAsEmployeur(contratId: string, signatureDataUrl: string): Promise<void> {
  console.log("[contrat-signature][employeur:start]", { contratId, signatureLength: signatureDataUrl.length });
  const c = await fetchContratFull(contratId);
  console.log("[contrat-signature][employeur:contrat]", { id: c.id, employee_id: c.employee_id, statut: c.statut, signatures: c.contrats_signatures?.length ?? 0 });
  const ts = Date.now();

  const sigBlob = dataUrlToBlob(signatureDataUrl);
  const sigUrl = await uploadBlob(`${c.employee_id}/${c.id}/sig_employeur_${ts}.png`, sigBlob, "image/png");

  const sigE = c.contrats_signatures?.find((s) => s.role_signature === "employe");
  console.log("[contrat-signature][employeur:pdf:start]", { hasEmployeSignature: !!sigE?.signature_image_url });
  const pdfBlob = await generateContratPdfBlob(buildPdfData(c, sigE?.signature_image_url ?? null, sigUrl));
  console.log("[contrat-signature][employeur:pdf:ok]", { size: pdfBlob.size });
  const pdfV3Url = await uploadBlob(`${c.employee_id}/${c.id}/v3.pdf`, pdfBlob, "application/pdf");
  const hash = await sha256OfBlob(pdfBlob);
  console.log("[contrat-signature][employeur:hash]", { hash });
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;

  console.log("[contrat-signature][employeur:rpc:start]", { contratId, hasSigUrl: !!sigUrl, hasPdfUrl: !!pdfV3Url, ua: !!ua });
  const { error } = await supabase.rpc("signer_contrat_employeur", {
    p_contrat_id: contratId,
    p_signature_image_url: sigUrl,
    p_pdf_v3_url: pdfV3Url,
    p_pdf_hash_sha256: hash,
    p_client_ip: null as unknown as string | undefined,
    p_user_agent: (ua ?? null) as unknown as string | undefined,
  });
  console.log("[contrat-signature][employeur:rpc:response]", { error });
  if (error) throw new Error(error.message);
}

async function fetchContratFull(contratId: string): Promise<FullContratRecord> {
  console.log("[contrat-signature][fetchContratFull:start]", { contratId });
  const { data, error } = await supabase
    .from("contrats_intermittents")
    .select(`
      id, employee_id, chantier_id, date_debut, date_fin,
      taux_horaire_brut, forfait, heures_estimees,
      pdf_v1_url, pdf_v2_url, pdf_v3_url, statut, template_version_id,
      employes:employee_id ( nom, prenom, adresse, email, statut_contrat, poste_principal ),
      affaires:chantier_id ( numero, nom, lieu ),
      contrat_templates:template_version_id ( contenu_html ),
      contrats_signatures ( role_signature, signature_image_url, signed_at )
    `)
    .eq("id", contratId)
    .single();
  console.log("[contrat-signature][fetchContratFull:response]", { hasData: !!data, error });
  if (error || !data) throw new Error(error?.message ?? "Contrat introuvable");
  return data as unknown as FullContratRecord;
}

