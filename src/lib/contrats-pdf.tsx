/**
 * Tour 2 — Génération PDF contrats intermittents avec @react-pdf/renderer.
 *
 * 3 versions :
 *  v1 = vierge (généré à la création du contrat)
 *  v2 = signé employé (canvas employé incrusté)
 *  v3 = signé employeur (les 2 signatures)
 */
/* eslint-disable react-refresh/only-export-components */
// Polyfill Node Buffer in browser — @react-pdf/renderer's fetchImage needs it
import { Buffer } from "buffer";
if (typeof globalThis !== "undefined" && !(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer: typeof Buffer }).Buffer = Buffer;
}
import { Document, Page, Text, View, StyleSheet, Image, pdf } from "@react-pdf/renderer";
import Html from "react-pdf-html";
import type { ReactElement } from "react";
import { DEFAULT_CONTRAT_TEMPLATE_HTML, interpolateContratTemplate } from "./contrats-templates";

export interface ContratPdfData {
  numero_contrat?: string;
  employe_nom: string;
  employe_prenom: string;
  employe_adresse?: string | null;
  employe_email?: string | null;
  chantier_nom: string;
  chantier_numero: string;
  chantier_lieu?: string | null;
  date_debut: string; // ISO yyyy-mm-dd
  date_fin: string;
  heures_estimees?: number | null;
  taux_horaire_brut?: number | null;
  forfait: boolean;
  statut_contrat: string;
  signature_employe_url?: string | null;
  signature_employeur_url?: string | null;
  signed_at_employe?: string | null;
  signed_at_employeur?: string | null;
  hash_sha256?: string | null;
  template_html?: string | null;
  poste?: string | null;
  employeur_signataire?: string | null;
  convention_collective?: string | null;
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  header: { borderBottom: "2px solid #1a1a1a", paddingBottom: 10, marginBottom: 20 },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#555" },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", color: "#333" },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 130, color: "#555" },
  value: { flex: 1, fontWeight: 700 },
  paragraph: { lineHeight: 1.5, marginBottom: 8, textAlign: "justify" },
  htmlBody: { fontSize: 10, lineHeight: 1.45, marginBottom: 8 },
  signatureRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 30 },
  signatureBox: { width: "45%", borderTop: "1px solid #1a1a1a", paddingTop: 6 },
  sigImg: { height: 60, marginBottom: 4, objectFit: "contain" },
  sigPlaceholder: { height: 60, border: "1px dashed #aaa", marginBottom: 4 },
  meta: { fontSize: 8, color: "#666" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 7, color: "#888", textAlign: "center", borderTop: "1px solid #ddd", paddingTop: 6 },
});

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  } catch { return iso; }
}

function fmtNum(n?: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateShort(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return iso; }
}

function renderTemplateHtml(data: ContratPdfData): string {
  const interpolated = interpolateContratTemplate(data.template_html || DEFAULT_CONTRAT_TEMPLATE_HTML, {
    // Salarié
    employe_nom_complet: `${data.employe_nom.toUpperCase()} ${data.employe_prenom}`.trim(),
    employe_adresse_complete: data.employe_adresse ?? "—",
    employe_email: data.employe_email ?? "—",
    statut_contrat: data.statut_contrat,
    // Mission
    poste: data.poste && data.poste.trim() !== "" ? data.poste : "Technicien de plateau",
    chantier_numero: data.chantier_numero,
    chantier_libelle: data.chantier_nom,
    date_debut: fmtDateShort(data.date_debut),
    date_fin: fmtDateShort(data.date_fin),
    heures_estimees: data.heures_estimees == null ? "—" : String(data.heures_estimees),
    // Rémunération
    taux_horaire_brut: data.taux_horaire_brut == null ? "—" : `${fmtNum(data.taux_horaire_brut)} €`,
    // Métadonnées
    numero_contrat: data.numero_contrat ?? "—",
    date_signature_employe: fmtDateShort(data.signed_at_employe ?? null),
    date_signature_employeur: fmtDateShort(data.signed_at_employeur ?? null),
  });
  // Strip [[ZONE_*]] markers — les signatures réelles sont rendues par le wrapper PDF en bas de page.
  return interpolated.replace(/\[\[ZONE_[A-Z0-9_]+\]\]/g, "");
}


export function ContratIntermittentDocument({ data }: { data: ContratPdfData }): ReactElement {
  const isVierge = !data.signature_employe_url && !data.signature_employeur_url;
  const isV2 = data.signature_employe_url && !data.signature_employeur_url;
  const versionLabel = isVierge ? "Version 1 — vierge" : isV2 ? "Version 2 — signée employé" : "Version 3 — finale";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Contrat de travail intermittent — Setup Paris</Text>
          <Text style={styles.subtitle}>{versionLabel} {data.numero_contrat ? ` · N° ${data.numero_contrat}` : ""}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Salarié</Text>
          <View style={styles.row}><Text style={styles.label}>Nom / Prénom</Text><Text style={styles.value}>{data.employe_nom.toUpperCase()} {data.employe_prenom}</Text></View>
          {data.employe_adresse && <View style={styles.row}><Text style={styles.label}>Adresse</Text><Text style={styles.value}>{data.employe_adresse}</Text></View>}
          {data.employe_email && <View style={styles.row}><Text style={styles.label}>Email</Text><Text style={styles.value}>{data.employe_email}</Text></View>}
          <View style={styles.row}><Text style={styles.label}>Statut contrat</Text><Text style={styles.value}>{data.statut_contrat}</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mission</Text>
          <View style={styles.row}><Text style={styles.label}>Chantier</Text><Text style={styles.value}>{data.chantier_numero} — {data.chantier_nom}</Text></View>
          {data.chantier_lieu && <View style={styles.row}><Text style={styles.label}>Lieu</Text><Text style={styles.value}>{data.chantier_lieu}</Text></View>}
          <View style={styles.row}><Text style={styles.label}>Du</Text><Text style={styles.value}>{fmtDate(data.date_debut)}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Au</Text><Text style={styles.value}>{fmtDate(data.date_fin)}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Heures estimées</Text><Text style={styles.value}>{data.heures_estimees != null ? `${data.heures_estimees} h` : "—"}</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rémunération</Text>
          {data.forfait
            ? <Text style={styles.paragraph}>Mission rémunérée au forfait. Le détail du forfait fait l'objet d'un avenant écrit.</Text>
            : <View style={styles.row}><Text style={styles.label}>Taux horaire brut</Text><Text style={styles.value}>{fmtNum(data.taux_horaire_brut)} €</Text></View>
          }
        </View>

        <View style={styles.section}>
          <Html style={styles.htmlBody}>{renderTemplateHtml(data)}</Html>
        </View>

        <View style={styles.signatureRow}>
          <View style={styles.signatureBox}>
            <Text style={styles.meta}>Signature salarié</Text>
            {data.signature_employe_url
              ? <Image src={data.signature_employe_url} style={styles.sigImg} />
              : <View style={styles.sigPlaceholder} />
            }
            <Text style={styles.meta}>{data.employe_nom.toUpperCase()} {data.employe_prenom}</Text>
            {data.signed_at_employe && <Text style={styles.meta}>Signé le {fmtDate(data.signed_at_employe)}</Text>}
          </View>
          <View style={styles.signatureBox}>
            <Text style={styles.meta}>Signature employeur</Text>
            {data.signature_employeur_url
              ? <Image src={data.signature_employeur_url} style={styles.sigImg} />
              : <View style={styles.sigPlaceholder} />
            }
            <Text style={styles.meta}>Setup Paris</Text>
            {data.signed_at_employeur && <Text style={styles.meta}>Signé le {fmtDate(data.signed_at_employeur)}</Text>}
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>Setup Paris — Contrat intermittent {data.numero_contrat ?? "—"} — {versionLabel}</Text>
          {data.hash_sha256 && <Text>Hash SHA-256 : {data.hash_sha256}</Text>}
        </View>
      </Page>
    </Document>
  );
}

export async function generateContratPdfBlob(data: ContratPdfData): Promise<Blob> {
  const doc = <ContratIntermittentDocument data={data} />;
  return await pdf(doc).toBlob();
}

/** SHA-256 du contenu binaire (Web Crypto). */
export async function sha256OfBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
