import { ProposerImagesDialog } from "./ProposerImagesDialog";
import { Link, useNavigate } from "@tanstack/react-router";
import { trierRacines } from "@/lib/devis/arbre";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, PanelLeft, CheckCircle2, Circle, Maximize2, Minimize2, Eye, FileDown, Mail, Library, MessageSquarePlus, PenLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useDevisClaude, BadgeClaude } from "@/components/devis/RedactionClaude";
import { NoteDevis, HistoriqueTextes, STATUTS_TEXTE_EDITABLES } from "./NoteDevis";
import { DevisStatutBadge } from "@/components/devis/DevisStatutBadge";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ClientCombobox } from "@/components/clients/ClientCombobox";
import { calculerDevis } from "@/lib/devis/calcul";
import { CoutsBloc } from "./CoutsBloc";
import { SignerOpportuniteDialog } from "@/components/opportunites/SignerOpportuniteDialog";
import type { TypologieFuture } from "@/lib/typologie-future";
import { DevisArbre } from "./DevisArbre";
import { ObjetPanel } from "./ObjetPanel";
import { DevisVueClient } from "./DevisVueClient";
import { DevisChantierSignataire } from "@/components/devis/DevisChantierSignataire";
import { ExportPdfDialog, EnvoiEmailDialog } from "@/components/devis/DevisPdfEnvoi";
import { ProgbatExportDialog, EnregistrerTransfertDialog } from "@/components/devis/ProgbatTransfert";
import { libelleNumeroProgbat, libelleStatutDevis, NUMERO_PROGBAT_PROVISOIRE_RE } from "@/lib/devis/progbat-export";
import { BibliothequeDialog } from "./BibliothequeDialog";
import { SupprimerDevisDialog, SUPPRESSION_REFUSEE, devisSupprimable } from "@/components/devis/SupprimerDevis";
import { useAutosave } from "./useAutosave";
import { ancrePoste as ancreDe } from "@/lib/devis/editeur-lisibilite";
import { listeControle, type CibleControle } from "@/lib/devis/editeur-lisibilite";
import { venteUnitaireLibre, venteUnitaireMateriau } from "@/lib/devis/calcul";
import {
  STATUT_LABEL, TYPE_LABEL, eur, useDevis, useDevisRpc, usePatchCache, type Ligne,
} from "./api";

const DATES: { key: string; label: string; affaire: boolean }[] = [
  { key: "date_visite_technique", label: "Visite technique", affaire: true },
  { key: "date_montage", label: "Montage", affaire: true },
  { key: "date_evenement_debut", label: "Événement — début", affaire: true },
  { key: "date_evenement_fin", label: "Événement — fin", affaire: true },
  { key: "date_demontage", label: "Démontage", affaire: true },
];

export function DevisEditeur({ affaireId, devisId }: { affaireId: string | null; devisId: string }) {
  const navigate = useNavigate();
  const q = useDevis(devisId);
  const call = useDevisRpc(devisId);
  const patch = usePatchCache(devisId);
  const save = useAutosave(devisId);
  const [selected, setSelected] = useState<string | null>(null);
  const [rename, setRename] = useState<Ligne | null>(null);
  const [del, setDel] = useState<Ligne | null>(null);
  const [delCible, setDelCible] = useState<string>("");
  const [corbeille, setCorbeille] = useState(false);
  const [vueClient, setVueClient] = useState(false);
  const [biblio, setBiblio] = useState(false);
  const [askMajClient, setAskMajClient] = useState<{ id: string | null } | null>(null);
  const [modeleDlg, setModeleDlg] = useState(false);
  const [modele, setModele] = useState({ nom: "", categorie: "", description: "" });
  const [envoiDlg, setEnvoiDlg] = useState(false);
  const [pdfDlg, setPdfDlg] = useState(false);
  const [pgDlg, setPgDlg] = useState(false);
  const [trDlg, setTrDlg] = useState(false);
  const [mailDlg, setMailDlg] = useState(false);
  const [envoiDate, setEnvoiDate] = useState("");
  const [supprDlg, setSupprDlg] = useState(false);
  const [pleinEcran, setPleinEcran] = useState(false);
  const [clientFinalOuvert, setClientFinalOuvert] = useState(false);
  const [datesOuvertes, setDatesOuvertes] = useState<Set<string>>(new Set());
  // Largeur de l'arbre réglable à la souris, mémorisée dans le navigateur.
  const [arbreW, setArbreW] = useState(320);
  const [onglet, setOnglet] = useState<"structure" | "totaux" | "heures" | "couts">("structure");
  const [panneauMobile, setPanneauMobile] = useState(false);
  useEffect(() => { const v = Number(localStorage.getItem("devis-arbre-largeur")); if (v >= 220 && v <= 640) setArbreW(v); }, []);
  const redimArbre = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = arbreW;
    let w = w0;
    const move = (ev: PointerEvent) => { w = Math.min(640, Math.max(220, w0 + ev.clientX - x0)); setArbreW(w); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); try { localStorage.setItem("devis-arbre-largeur", String(w)); } catch { /* stockage indisponible */ } };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  useEffect(() => {
    if (!pleinEcran) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setPleinEcran(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [pleinEcran]);
  const [signOpp, setSignOpp] = useState<{ id: string; code: string; client: string | null; typologie: TypologieFuture | null } | null>(null);

  const [histComm, setHistComm] = useState<string | null>(null);
  const d = q.data;
  const claude = useDevisClaude([devisId]);
  const infoClaude = claude.data?.get(devisId);
  const peutSupprimer = useQuery({
    queryKey: ["devis-peut-supprimer", devisId, d?.devis.statut_redaction],
    enabled: !!d && !d.devis.est_modele && d.droits.ecrire,
    queryFn: async () => !!(await supabase.rpc("devis_peut_supprimer", { _devis_id: devisId })).data,
  });
  const contacts = useQuery({
    queryKey: ["client-contacts", d?.devis.client_id],
    enabled: !!d?.devis.client_id,
    queryFn: async () => (await supabase.from("client_contacts").select("id,nom,prenom,email").eq("client_id", d!.devis.client_id!).eq("actif", true).order("nom")).data ?? [],
  });

  useEffect(() => {
    if (d && !selected) setSelected(d.lignes.find((l) => l.type === "objet")?.id ?? d.lignes[0]?.id ?? null);
  }, [d, selected]);

  const taux = useQuery({
    queryKey: ["devis-taux"],
    queryFn: async () => { const { data, error } = await supabase.rpc("devis_taux_lister"); if (error) throw error; return data ?? []; },
  });
  const posteMetier = useMemo(() => new Map((taux.data ?? []).map((p) => [p.poste_id, p.metier_id] as [string, number])), [taux.data]);

  const calc = useMemo(() => {
    if (!d) return null;
    return calculerDevis(
      d.lignes.map((l) => ({ ...l, quantite: Number(l.quantite) })),
      d.heures.map((h) => ({ ...h, heures: Number(h.heures), taux_vente: Number(h.taux_vente), montant_force: h.montant_force == null ? null : Number(h.montant_force), cout_revient: h.cout_revient == null ? null : Number(h.cout_revient) })),
      d.materiaux.map((m) => ({ ...m, quantite: Number(m.quantite), prix_achat: m.prix_achat === undefined ? null : Number(m.prix_achat ?? 0), coefficient: Number(m.coefficient ?? 1), prix_vente_unitaire: m.prix_vente_unitaire == null ? null : Number(m.prix_vente_unitaire) })),
      d.libres.map((f) => ({ ...f, quantite: Number(f.quantite), prix_achat: f.prix_achat == null ? null : Number(f.prix_achat), prix_forfait: f.prix_forfait == null ? null : Number(f.prix_forfait), coefficient: Number(f.coefficient ?? 1), prix_vente_unitaire: f.prix_vente_unitaire == null ? null : Number(f.prix_vente_unitaire),
        heures_info: f.heures_info == null ? null : Number(f.heures_info), metier_info_id: f.poste_info_id ? posteMetier.get(f.poste_info_id) ?? null : null })),
      Number(d.calcul.tva_pct ?? 20),
      { mode: d.devis.remise_mode ?? "aucune", valeur: d.devis.remise_valeur == null ? null : Number(d.devis.remise_valeur) },
    );
  }, [d, posteMetier]);

  if (q.isLoading) return <p className="p-6 text-sm text-muted-foreground">Chargement…</p>;
  if (q.error || !d || !calc) return <p className="p-6 text-sm text-destructive">{(q.error as Error)?.message ?? "Devis introuvable"}</p>;

  const st = d.devis.statut_redaction;
  const readOnly = st !== "brouillon" || !d.droits.ecrire;
  const texteEditable = d.droits.ecrire && STATUTS_TEXTE_EDITABLES.includes(st);
  const ligneSel = d.lignes.find((l) => l.id === selected) ?? null;

  const ajouter = async (type: Ligne["type"], extra: Record<string, unknown> = {}) => {
    let parent: string | null = null;
    if (type === "objet" || type === "commentaire") {
      if (ligneSel) parent = ligneSel.type === "commentaire" ? ligneSel.parent_id : ligneSel.type === "objet" && type === "objet" ? ligneSel.parent_id : ligneSel.id;
    }
    const id = await call<string>("devis_ligne_enregistrer", { _devis_id: devisId, _l: { type, parent_id: parent, libelle: type === "commentaire" ? null : `${TYPE_LABEL[type]}`, ...extra } });
    if (id) setSelected(id);
  };

  const supprimer = async (l: Ligne, mode: "avec_contenu" | "deplacer", cible: string | null) => {
    const g = await call<string>("devis_ligne_supprimer", { _ligne_id: l.id, _mode: mode, _cible: cible });
    setDel(null);
    if (g) {
      if (selected === l.id) setSelected(null);
      toast(`« ${l.libelle || TYPE_LABEL[l.type]} » supprimé`, { duration: 8000, action: { label: "Annuler", onClick: () => void call("devis_corbeille_restaurer", { _devis_id: devisId, _groupe: g }) } });
    }
  };

  const changerStatut = async (statut: string) => {
    const ok = await call("devis_statut_changer", { _devis_id: devisId, _statut: statut });
    if (ok !== null) toast.success(`Statut : ${STATUT_LABEL[statut as keyof typeof STATUT_LABEL]}`);
  };

  const signer = async (demander = true) => {
    if (demander && !window.confirm("Le client a signé ce devis ? Les objets de fabrication et leurs heures par métier vont être créés.")) return;
    const res = await call<{ deja_fait: boolean; objets: number; prefixe: string | null; photos?: { objet_id: string; affaire_id: string; storage_path: string; legende: string | null; mime: string | null }[] }>(
      "devis_signer_vers_fabrication", { _devis_id: devisId });
    if (!res) return;
    if (res.deja_fait) return toast.info("La fabrication a déjà été créée depuis ce devis.");
    let copiees = 0;
    const { data: u } = await supabase.auth.getUser();
    for (const p of res.photos ?? []) {
      const { data: blob } = await supabase.storage.from("devis-photos").download(p.storage_path);
      if (!blob) continue;
      const dest = `${p.affaire_id}/${p.objet_id}/${p.storage_path.split("/").pop()}`;
      const up = await supabase.storage.from("fabrication-photos").upload(dest, blob, { contentType: p.mime ?? undefined });
      if (up.error) continue;
      const ins = await supabase.from("fabrication_objets_photos").insert({ objet_id: p.objet_id, affaire_id: p.affaire_id, storage_path: dest, commentaire: p.legende, uploaded_by: u.user?.id });
      if (!ins.error) copiees++;
    }
    toast.success(`${res.objets} objet(s) de fabrication créé(s)${res.prefixe ? ` (références préfixées ${res.prefixe})` : ""}${copiees ? `, ${copiees} photo(s) copiée(s)` : ""}.`);
  };

  /** « Client signé » : version signée → signature de l'opportunité (parcours existant) → fabrication. */
  const clientSigne = async () => {
    if (!d.devis.affaire_id) return;
    if (!window.confirm(`Le client a signé le devis ${d.devis.numero} ?\n\n1. Cette version devient la version signée (les autres versions ouvertes sont refusées).\n2. L'opportunité est signée (code affaire à saisir si besoin).\n3. La fabrication est créée.`)) return;
    const { data: a, error } = await supabase.from("affaires").select("id, phase, statut_opportunite, numero, code_opportunite, typologie_future, clients(nom)").eq("id", d.devis.affaire_id).single();
    if (error || !a) return toast.error("Opportunité introuvable", { description: error?.message });
    if (a.phase === "opportunite" && a.statut_opportunite !== "gagne") {
      const up = await supabase.from("affaires").update({ statut_opportunite: "gagne" }).eq("id", a.id);
      if (up.error) return toast.error("Passage en « Gagné » impossible", { description: up.error.message });
    }
    if (st !== "signe") {
      const ok = await call("devis_marquer_signe", { _devis_id: devisId });
      if (ok === null) return;
    }
    if (a.phase === "opportunite") {
      setSignOpp({ id: a.id, code: a.code_opportunite ?? a.numero ?? "", client: (a.clients as { nom: string } | null)?.nom ?? null, typologie: (a.typologie_future ?? null) as TypologieFuture | null });
      return;
    }
    await signer(false);
  };

  const nouvelleVersion = async () => {
    const id = await call<string>("devis_nouvelle_version", { _devis_id: devisId }, { refresh: false });
    if (id && affaireId) navigate({ to: "/affaires/$affaireId/devis-staffing/$devisId", params: { affaireId, devisId: id } });
  };

  const setEntete = (patchObj: Record<string, unknown>, majAffaire = false) =>
    call("devis_entete_modifier", { _devis_id: devisId, _patch: patchObj, _maj_affaire_client: majAffaire });

  const dates = d.devis.dates_snapshot ?? (d.affaire as unknown as Record<string, string | null> | null) ?? {};
  const clientManque = d.client && (!d.client.adresse || !d.client.siret);
  // Liste de contrôle avant validation (non bloquante).
  const chapitreIds = new Set<string>();
  const estDansChapitre = (id: string | null): boolean => {
    let cur = d.lignes.find((l) => l.id === id);
    while (cur) { if (cur.type.startsWith("chapitre")) return true; cur = d.lignes.find((l) => l.id === cur!.parent_id); }
    return false;
  };
  d.lignes.forEach((l) => { if (estDansChapitre(l.id)) chapitreIds.add(l.id); });
  const objets = d.lignes.filter((l) => l.type === "objet" && !chapitreIds.has(l.id));
  const lignesZero = [
    ...d.materiaux.filter((m) => Number(m.quantite) * venteUnitaireMateriau({ prix_achat: m.prix_achat === undefined ? null : Number(m.prix_achat ?? 0), coefficient: Number(m.coefficient ?? 1), prix_vente_unitaire: m.prix_vente_unitaire }) === 0)
      .map((m) => ({ ligneId: m.ligne_id, designation: m.designation ?? "Matériau" })),
    ...d.libres.filter((f) => venteUnitaireLibre({ prix_forfait: f.prix_forfait == null ? null : Number(f.prix_forfait), prix_achat: f.prix_achat == null ? null : Number(f.prix_achat), coefficient: Number(f.coefficient ?? 1), prix_vente_unitaire: f.prix_vente_unitaire }) === 0)
      .map((f) => ({ ligneId: f.ligne_id, designation: f.designation ?? "Ligne libre" })),
  ];
  const controle = listeControle({
    contactId: d.devis.contact_id, client: d.client, dates: dates as Record<string, string | null>, lignesZero,
    objetsSansPhoto: objets.filter((o) => !d.photos.some((p) => p.ligne_id === o.id)).map((o) => ({ ligneId: o.id, libelle: o.libelle ?? "" })),
    nbObjets: objets.length, coutsManquants: d.droits.couts ? calc.couts_manquants.length : null,
  });
  const allerA = (c: CibleControle) => {
    if (c.kind === "ligne") { setSelected(c.ligneId); document.getElementById("devis-fiche")?.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
    if (c.kind === "taux") { const m = calc.couts_manquants.find((x) => x.type === "heures"); if (!m) { const lib = calc.couts_manquants[0]; const f = lib && d.libres.find((x) => x.designation === lib.libelle); if (f) allerA({ kind: "ligne", ligneId: f.ligne_id }); return; }
      void navigate({ to: "/parametres/devis-taux", hash: ancreDe(m.libelle) }); return; }
    if (c.kind === "dates") setDatesOuvertes(new Set(DATES.map((x) => x.key)));
    if (c.kind === "client" && d.client && (!d.client.adresse || !d.client.siret)) { window.open(`/clients/${d.client.id}`, "_blank", "noopener"); return; }
    document.getElementById(`devis-${c.kind}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    (document.getElementById(`devis-${c.kind}`)?.querySelector("select,input,button") as HTMLElement | null)?.focus();
  };
  const lienLibre = (designation: string) => {
    const f = d.libres.find((x) => x.designation === designation);
    return f ? <button type="button" className="font-medium underline" onClick={() => allerA({ kind: "ligne", ligneId: f.ligne_id })} title="Aller à la ligne pour saisir son coût">{designation.toLowerCase()}</button> : <span>{designation.toLowerCase()}</span>;
  };
  const zonesCibles = del ? d.lignes.filter((l) => l.id !== del.id && ["zone", "option"].includes(l.type) && !l.parent_id) : [];

  return (
    <div className={pleinEcran ? "devis-editeur fixed inset-0 z-50 space-y-4 overflow-auto bg-background p-4" : "devis-editeur space-y-4"}>
      {/* Bandeau compact : l'essentiel du devis, toujours visible */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-card px-3 py-2 shadow-sm">
        {affaireId && !pleinEcran && <Link to="/affaires/$affaireId/devis-staffing" params={{ affaireId }} className="flex items-center text-xs text-muted-foreground hover:underline"><ArrowLeft className="mr-1 h-3 w-3" />Devis</Link>}
        <span className="font-mono text-base font-bold text-foreground">{d.devis.est_modele ? `Modèle — ${d.devis.modele_nom ?? ""}` : d.devis.numero}</span>
        {d.client && <span className="max-w-64 truncate text-sm text-foreground" title={d.client.nom}>{d.client.nom}</span>}
        <DevisStatutBadge statut={st} label={libelleStatutDevis(st, d.devis.numero_progbat, d.devis.date_envoi, STATUT_LABEL)} />{infoClaude && <BadgeClaude />}
        <span className="ml-auto text-sm text-muted-foreground">Total HT <strong className="text-base tabular-nums text-foreground">{eur(calc.remise !== 0 ? calc.net_ht : calc.total_ht)}</strong>{calc.remise !== 0 && <span className="text-xs"> (net)</span>}</span>
        <Button size="sm" variant="outline" onClick={() => setPleinEcran((p) => !p)} title={pleinEcran ? "Quitter le plein écran (Échap)" : "Plein écran"}>
          {pleinEcran ? <Minimize2 className="mr-1 h-3.5 w-3.5" /> : <Maximize2 className="mr-1 h-3.5 w-3.5" />}{pleinEcran ? "Quitter" : "Plein écran"}
        </Button>
      </div>
      <NoteDevis devisId={devisId} statut={st} peutEcrire={d.droits.ecrire} />
      <HistoriqueTextes devisId={devisId} cible="commentaire" ligneId={histComm} open={!!histComm} onOpenChange={(o) => { if (!o) setHistComm(null); }} peutRestaurer={texteEditable} onRestaure={() => void q.refetch()} />
      {/* En-tête */}
      <Card>
        <CardContent className="flex flex-wrap items-start gap-4 p-4">
          <div className="min-w-48">
            <h1 className="sr-only">{d.devis.est_modele ? `Modèle — ${d.devis.modele_nom ?? ""}` : d.devis.numero}</h1>
            <p className="text-xs text-muted-foreground">
              {d.affaire ? `${d.affaire.numero ?? d.affaire.code_opportunite ?? ""} ${d.affaire.nom ?? ""}` : ""}
              {d.modele_origine && ` · modèle : ${d.modele_origine}`}
            </p>
            {d.devis.numero_progbat && <p className="mt-1 text-xs">Réf. <strong>{libelleNumeroProgbat(d.devis.numero_progbat)}</strong>{d.devis.transfere_progbat_le ? ` · transféré le ${new Date(d.devis.transfere_progbat_le).toLocaleDateString("fr-FR")}` : ""}</p>}
          </div>
          {!d.devis.est_modele && (
            <>
              <div className="w-64 space-y-1" id="devis-client">
                <p className="text-xs text-muted-foreground">Client facturé</p>
                <ClientCombobox value={d.client?.nom ?? null} clientId={d.devis.client_id} disabled={readOnly} allowClear={false}
                  onChange={async (id) => { await setEntete({ client_id: id }); if (d.affaire) setAskMajClient({ id }); }} />
                {clientManque && <p className="flex items-center gap-1 text-xs text-foreground"><AlertTriangle className="h-3 w-3 shrink-0 text-warning" />
                  Fiche client incomplète ({[!d.client!.adresse && "adresse", !d.client!.siret && "SIRET"].filter(Boolean).join(", ")}) —{" "}
                  <Link to="/clients/$clientId" params={{ clientId: d.client!.id }} className="underline">compléter</Link></p>}
              </div>
              <div className="w-56 space-y-1" id="devis-contact">
                <p className="text-xs text-muted-foreground">Contact</p>
                <select disabled={readOnly || !d.devis.client_id} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={d.devis.contact_id ?? ""}
                  onChange={(e) => void setEntete({ contact_id: e.target.value || null })}>
                  <option value="">—</option>
                  {(contacts.data ?? []).map((c) => <option key={c.id} value={c.id}>{[c.prenom, c.nom].filter(Boolean).join(" ") || c.email}</option>)}
                </select>
              </div>
              {d.devis.client_final_id || clientFinalOuvert ? (
                <div className="w-56 space-y-1">
                  <p className="text-xs text-muted-foreground">Client final (facultatif)</p>
                  <ClientCombobox value={d.client_final?.nom ?? null} clientId={d.devis.client_final_id} disabled={readOnly}
                    onChange={(id) => void setEntete({ client_final_id: id })} />
                </div>
              ) : !readOnly && (
                <button type="button" className="self-end pb-2 text-xs font-medium text-primary hover:underline" onClick={() => setClientFinalOuvert(true)}>+ ajouter un client final</button>
              )}
            </>
          )}
          {d.devis.est_modele && (
            <div className="grid flex-1 gap-2 md:grid-cols-3">
              <Input defaultValue={d.devis.modele_nom ?? ""} placeholder="Nom" disabled={readOnly} onBlur={(e) => void setEntete({ modele_nom: e.target.value })} />
              <Input defaultValue={d.devis.modele_categorie ?? ""} placeholder="Catégorie" disabled={readOnly} onBlur={(e) => void setEntete({ modele_categorie: e.target.value })} />
              <Input defaultValue={d.devis.modele_description ?? ""} placeholder="Description d'usage" disabled={readOnly} onBlur={(e) => void setEntete({ modele_description: e.target.value })} />
            </div>
          )}
        </CardContent>
      </Card>

      {!d.devis.est_modele && <DevisChantierSignataire devisId={devisId} disabled={readOnly} enregistrer={setEntete} />}
      {/* Dates clés */}
      {!d.devis.est_modele && (
        <div id="devis-dates" className="space-y-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-start">
        <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-6">
          <DateCase label="Opportunité" value={d.affaire?.created_at?.slice(0, 10) ?? null} disabled />
          <DateCase label="Date du devis" value={d.devis.date_devis} disabled={readOnly} onChange={(v) => void setEntete({ date_devis: v })} />
          <div>
            <DateCase label="Valable jusqu'au" value={(d.devis.dates_snapshot as Record<string, string | null> | null)?.date_validite ?? d.devis.date_validite ?? null}
              disabled={readOnly} onChange={(v) => void setEntete({ date_validite: v ?? "" })} />
            {!readOnly && (d.devis.date_validite_manuelle
              ? <button type="button" className="mt-0.5 text-[11px] text-primary underline" onClick={() => void setEntete({ date_validite: "" })}>Revenir au calcul auto</button>
              : <p className="mt-0.5 text-[11px] text-muted-foreground">Auto : date du devis + {d.devis.validite_jours ?? 30} j</p>)}
          </div>
          {DATES.filter((x) => (dates as Record<string, string | null>)[x.key] || datesOuvertes.has(x.key)).map((x) => (
            <DateCase key={x.key} label={x.label} value={(dates as Record<string, string | null>)[x.key] ?? null} disabled={readOnly}
              onChange={(v) => void call("devis_dates_modifier", { _devis_id: devisId, _patch: { [x.key]: v ?? "" } }).then(() => window.dispatchEvent(new Event("affaire-updated")))} />
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-3 rounded-md border bg-card px-3 py-2 tabular-nums md:ml-auto">
          <div className="text-right leading-tight">
            <p className="text-xs text-foreground/75">Total HT <strong className="text-base text-foreground">{eur(calc.remise !== 0 ? calc.net_ht : calc.total_ht)}</strong></p>
            <p className="text-xs text-foreground/75">Total TTC <strong className="text-base text-foreground">{eur(calc.ttc)}</strong></p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setPdfDlg(true)}><FileDown className="mr-1 h-4 w-4" />PDF client</Button>
        </div>
        </div>
        {(() => {
          const vides = DATES.filter((x) => !(dates as Record<string, string | null>)[x.key] && !datesOuvertes.has(x.key));
          if (!vides.length) return null;
          return readOnly
            ? <p className="text-xs text-muted-foreground">À déterminer : {vides.map((x) => x.label.toLowerCase()).join(", ")}</p>
            : <div className="flex flex-wrap gap-x-3 gap-y-1">{vides.map((x) => (
                <button key={x.key} type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setDatesOuvertes((s) => new Set(s).add(x.key))}>+ ajouter {x.label.toLowerCase()}</button>
              ))}</div>;
        })()}
        </div>
      )}

      {(() => {
        const ONGLETS = [["structure", "Structure"], ["totaux", "Totaux"], ["heures", "Heures"], ...(d.droits.couts ? [["couts", "Coûts"]] : [])] as [typeof onglet, string][];
        const ong = onglet === "couts" && !d.droits.couts ? "structure" : onglet;
        const panneau = (
          <div className="space-y-3 text-sm">
            <div role="tablist" className="grid gap-0.5 rounded-md bg-muted p-0.5" style={{ gridTemplateColumns: `repeat(${ONGLETS.length}, minmax(0, 1fr))` }}>
              {ONGLETS.map(([k, lbl]) => (
                <button key={k} type="button" role="tab" aria-selected={ong === k} onClick={() => setOnglet(k)}
                  className={`rounded px-1 py-1 text-xs font-medium ${ong === k ? "bg-background text-foreground shadow-sm" : "text-foreground/75 hover:text-foreground"}`}>{lbl}</button>
              ))}
            </div>
            {/* Bande fixe : le total reste toujours visible */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md border bg-card px-2 py-1.5 tabular-nums">
              <span className="text-xs text-foreground/75">HT <strong className="text-sm text-foreground">{eur(calc.remise !== 0 ? calc.net_ht : calc.total_ht)}</strong></span>
              <span className="text-xs text-foreground/75">TTC <strong className="text-sm text-foreground">{eur(calc.ttc)}</strong></span>
              {d.droits.couts && <span className="text-xs text-foreground/75" title={calc.cout_complet ? undefined : "Marge incomplète : des coûts manquent"}>Marge <strong className="text-sm text-foreground">{calc.marge_pct == null ? "—" : `${String(calc.marge_pct).replace(".", ",")} %`}</strong>{!calc.cout_complet && <AlertTriangle className="ml-0.5 inline h-3 w-3 text-warning" />}</span>}
            </div>
            {ong === "structure" && <div className="space-y-3">
            {!readOnly && (
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => void ajouter("zone")}><Plus className="mr-1 h-3.5 w-3.5" />Zone</Button>
                <Button size="sm" variant="outline" onClick={() => void ajouter("objet")}><Plus className="mr-1 h-3.5 w-3.5" />Objet</Button>
                <Button size="sm" variant="outline" onClick={() => void ajouter("commentaire", { texte: "" })}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" />Commentaire</Button>
                <Button size="sm" variant="outline" onClick={() => setBiblio(true)}><Library className="mr-1 h-3.5 w-3.5" />Bibliothèque</Button>
                {d.devis.affaire_id && !d.devis.est_modele && <ProposerImagesDialog devisId={devisId} affaireId={d.devis.affaire_id} lignes={d.lignes} />}
                <select className="h-8 rounded-md border bg-background px-1 text-xs" value="" onChange={(e) => e.target.value && void ajouter(e.target.value as Ligne["type"])}>
                  <option value="">+ Chapitre…</option>
                  <option value="chapitre_suivi">Suivi et plans</option><option value="chapitre_pose">Pose</option>
                  <option value="chapitre_depose">Dépose</option><option value="option">Option</option>
                </select>
              </div>
            )}
            <DevisArbre lignes={d.lignes} montants={calc.lignes} racines={calc.racines} selected={selected} readOnly={readOnly}
              commentaires={{ peut: texteEditable, historique: setHistComm, enregistrer: async (id, texte) => {
                patch((x) => ({ ...x, lignes: x.lignes.map((l) => (l.id === id ? { ...l, texte } : l)) }));
                const { error } = await supabase.rpc("devis_texte_modifier", { _devis_id: devisId, _cible: "commentaire", _ligne_id: id, _texte: texte, _mode: "remplacer" });
                if (error) { toast.error("Commentaire non enregistré", { description: error.message }); void q.refetch(); }
              } }}
              actions={{
                select: (id) => { setSelected(id); setPanneauMobile(false); },
                move: (id, parentId, ordre) => {
                  patch((x) => ({ ...x, lignes: x.lignes.map((l) => (l.id === id ? { ...l, parent_id: parentId, ordre } : l)) }));
                  void call("devis_ligne_deplacer", { _ligne_id: id, _parent_id: parentId, _ordre: ordre });
                },
                rename: setRename,
                duplicate: (id) => void call<string>("devis_ligne_dupliquer", { _ligne_id: id }).then((n) => n && setSelected(n)),
                remove: (l) => {
                  const hasKids = d.lignes.some((k) => k.parent_id === l.id);
                  if (hasKids) { setDel(l); setDelCible(""); } else void supprimer(l, "avec_contenu", null);
                },
              }} />
            {d.lignes.length === 0 && <p className="text-sm text-muted-foreground">Commencez par ajouter une zone.</p>}
            {!readOnly && d.corbeille.length + (d.corbeille_elements?.length ?? 0) > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setCorbeille(true)}><Trash2 className="mr-1 h-3.5 w-3.5" />Corbeille ({d.corbeille.length + (d.corbeille_elements?.length ?? 0)})</Button>
            )}
            </div>}
            {ong === "totaux" && <div className="space-y-3">
            <div className="space-y-1">
              <Row label="Total HT" value={eur(calc.total_ht)} strong={calc.remise === 0} />
              <RemiseBloc mode={d.devis.remise_mode ?? "aucune"} valeur={d.devis.remise_valeur ?? null} readOnly={readOnly} totalHt={calc.total_ht}
                onChange={(mode, valeur) => {
                  patch((x) => ({ ...x, devis: { ...x.devis, remise_mode: mode, remise_valeur: valeur } }));
                  save("remise", () => call("devis_remise_modifier", { _devis_id: devisId, _mode: mode, _valeur: valeur }, { refresh: false }));
                }} />
              {calc.remise !== 0 && <Row label="Remise" value={eur(calc.remise)} />}
              {calc.remise !== 0 && <Row label="Total net HT" value={eur(calc.net_ht)} strong />}
              <Row label={`TVA ${Number(d.calcul.tva_pct)} %`} value={eur(calc.tva)} />
              <Row label="Total TTC" value={eur(calc.ttc)} strong />
              {calc.options_ht > 0 && <Row label="Options (hors total)" value={eur(calc.options_ht)} />}
            </div>
            <div className="space-y-1 border-t pt-2">
              {trierRacines(d.lignes.filter((l) => !l.parent_id && l.type !== "commentaire")).map((z) => (
                <Row key={z.id} label={`${z.libelle || TYPE_LABEL[z.type]}`} value={eur(calc.racines[z.id] ?? 0)} />
              ))}
            </div>
            {!d.devis.est_modele && (st === "brouillon" || st === "a_valider") && (
              <div className="border-t pt-2">
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Avant de valider</p>
                <ul className="space-y-0.5">
                  {controle.map((c) => (
                    <li key={c.cle}>
                      <button type="button" onClick={() => allerA(c.cible)} disabled={c.ok} title={c.ok ? undefined : "Aller corriger"}
                        className="flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left text-xs enabled:hover:bg-muted">
                        {c.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />}
                        <span className={c.ok ? "text-muted-foreground" : "text-foreground"}>{c.libelle}{c.detail && <span className="block text-[11px] text-foreground/75">{c.detail}</span>}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col gap-2 border-t pt-3">
              {st === "brouillon" && d.droits.ecrire && !d.devis.est_modele && <Button variant="outline" onClick={() => void changerStatut("a_valider")}>Soumettre à validation</Button>}
              {st === "a_valider" && d.droits.ecrire && <Button variant="ghost" onClick={() => void changerStatut("brouillon")}>Repasser en brouillon</Button>}
              {(st === "brouillon" || st === "a_valider") && d.droits.valider && !d.devis.est_modele && <Button onClick={() => void changerStatut("valide")}>Valider</Button>}
              {!d.devis.est_modele && st !== "brouillon" && d.droits.ecrire && <Button variant="outline" onClick={() => void nouvelleVersion()}>Nouvelle version</Button>}
              {(st === "valide" || (st === "transfere" && !!d.devis.numero_progbat && !d.devis.date_envoi)) && d.droits.valider && !d.devis.est_modele && d.devis.affaire_id && (
                <Button onClick={() => { setEnvoiDate(new Date().toISOString().slice(0, 10)); setEnvoiDlg(true); }}>Marquer envoyé au client</Button>
              )}
              {st === "transfere" && NUMERO_PROGBAT_PROVISOIRE_RE.test(d.devis.numero_progbat ?? "") && d.droits.valider && !d.devis.est_modele && (
                <Button variant="outline" onClick={() => setTrDlg(true)}>Numéro définitif ProGBat…</Button>
              )}
              {st === "transfere" && d.devis.date_envoi && <p className="text-xs text-muted-foreground">Envoyé le {new Date(d.devis.date_envoi).toLocaleDateString("fr-FR")}</p>}
              {["valide", "transfere"].includes(st) && d.droits.valider && !d.devis.est_modele && d.devis.affaire_id && !d.devis.signe_vers_fabrication_le && (
                <Button onClick={() => void clientSigne()}><PenLine className="mr-1 h-4 w-4" />Client signé</Button>
              )}
              {["valide", "transfere", "signe"].includes(st) && d.droits.valider && !d.devis.est_modele && !d.devis.signe_vers_fabrication_le && (
                <Button variant={st === "signe" ? "default" : "outline"} onClick={() => void signer()}>Devis signé → créer la fabrication</Button>
              )}
              {["a_valider", "valide", "transfere"].includes(st) && d.droits.valider && <Button variant="ghost" className="text-destructive" onClick={() => void changerStatut("refuse")}>Marquer refusé</Button>}
              <Button variant="outline" onClick={() => setVueClient(true)}><Eye className="mr-1 h-4 w-4" />Vue client</Button>
              {!d.devis.est_modele && <Button variant="outline" onClick={() => setPdfDlg(true)}><FileDown className="mr-1 h-4 w-4" />Exporter en PDF</Button>}
              {!d.devis.est_modele && d.droits.valider && d.devis.affaire_id && (
                <Button variant="outline" disabled={!["valide", "transfere"].includes(st)} title={!["valide", "transfere"].includes(st) ? "Réservé aux devis validés ; sur un brouillon, seul le PDF « PROJET » est disponible" : undefined}
                  onClick={() => setMailDlg(true)}><Mail className="mr-1 h-4 w-4" />Envoyer par email</Button>
              )}
              {!d.devis.est_modele && d.droits.parametres && <Button variant="ghost" onClick={() => { setModele({ nom: d.devis.libelle ?? "", categorie: "", description: "" }); setModeleDlg(true); }}>Enregistrer comme modèle</Button>}
              {!d.devis.est_modele && d.devis.affaire_id && (
                <Button variant="outline" disabled={!["valide", "transfere"].includes(st)} title={!["valide", "transfere"].includes(st) ? "Réservé aux devis validés" : undefined}
                  onClick={() => setPgDlg(true)}><FileDown className="mr-1 h-4 w-4" />Vers ProGBat</Button>
              )}
              {!d.devis.est_modele && d.droits.ecrire && (
                <>
                  <Button variant="ghost" className="text-destructive" disabled={!devisSupprimable(st) || !peutSupprimer.data}
                    onClick={() => setSupprDlg(true)}><Trash2 className="mr-1 h-4 w-4" />Supprimer le devis</Button>
                  {!devisSupprimable(st) ? <p className="text-xs text-muted-foreground">{SUPPRESSION_REFUSEE}</p>
                    : peutSupprimer.data === false && <p className="text-xs text-muted-foreground">Suppression réservée à l'auteur du devis, au chargé d'affaires ou à un admin.</p>}
                </>
              )}
            </div>
            </div>}
            {ong === "heures" && <HeuresMetier hm={calc.heures_metier} />}
            {ong === "couts" && d.droits.couts && <CoutsBloc dec={calc.decomposition} net={calc.net_ht} manquants={calc.couts_manquants} compact lienLibre={lienLibre} />}
          </div>
        );
        return (
          <>
            <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setPanneauMobile(true)}><PanelLeft className="mr-1 h-4 w-4" />Structure / Totaux</Button>
            <Sheet open={panneauMobile} onOpenChange={setPanneauMobile}>
              <SheetContent side="left" className="w-[92vw] max-w-md overflow-y-auto p-3 lg:hidden">
                <SheetHeader><SheetTitle>Devis {d.devis.numero}</SheetTitle></SheetHeader>
                <div className="mt-2">{panneauMobile && panneau}</div>
              </SheetContent>
            </Sheet>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[var(--arbre-w)_minmax(0,1fr)]" style={{ ["--arbre-w" as string]: `${arbreW}px` }}>
              <Card className="relative hidden min-w-0 self-start lg:block">
                <div role="separator" aria-orientation="vertical" aria-label="Régler la largeur de la colonne" title="Glisser pour régler la largeur"
                  onPointerDown={redimArbre} onDoubleClick={() => { setArbreW(320); try { localStorage.setItem("devis-arbre-largeur", "320"); } catch { /* */ } }}
                  className="absolute -right-2.5 top-0 z-10 h-full w-2 cursor-col-resize rounded hover:bg-primary/30" />
                <CardContent className="p-3">{!panneauMobile && panneau}</CardContent>
              </Card>
              <Card id="devis-fiche" className="scroll-mt-16 min-w-0">
                <CardContent className="p-4">
            {ligneSel ? <ObjetPanel key={ligneSel.id} data={d} ligne={ligneSel} montants={calc.lignes} calc={calc} readOnly={readOnly} call={call} patch={patch} save={save} onSelect={setSelected} />
              : <p className="text-sm text-muted-foreground">Sélectionnez un élément dans l'arbre.</p>}
                </CardContent>
              </Card>
            </div>
          </>
        );
      })()}

      <SupprimerDevisDialog devis={{ id: devisId, numero: d.devis.numero }} open={supprDlg} onOpenChange={setSupprDlg}
        onDone={() => navigate(affaireId ? { to: "/affaires/$affaireId/devis-staffing", params: { affaireId } } : { to: "/devis-staffing" })} />
      {/* Renommer */}
      <Dialog open={!!rename} onOpenChange={(o) => !o && setRename(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Renommer</DialogTitle></DialogHeader>
          <Input autoFocus defaultValue={rename?.libelle ?? rename?.texte ?? ""} id="rename-input"
            onKeyDown={(e) => { if (e.key === "Enter") (document.getElementById("rename-ok") as HTMLButtonElement)?.click(); }} />
          <DialogFooter><Button id="rename-ok" onClick={() => {
            const v = (document.getElementById("rename-input") as HTMLInputElement).value;
            if (rename) void call("devis_ligne_enregistrer", { _devis_id: devisId, _l: { id: rename.id, [rename.type === "commentaire" ? "texte" : "libelle"]: v } });
            setRename(null);
          }}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supprimer une zone avec contenu */}
      <Dialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer « {del?.libelle || (del && TYPE_LABEL[del.type])} »</DialogTitle>
            <DialogDescription>Cet élément contient des objets ou commentaires. Que faire de son contenu ?</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>Déplacer le contenu vers :</p>
            <select className="h-9 w-full rounded-md border bg-background px-2" value={delCible} onChange={(e) => setDelCible(e.target.value)}>
              <option value="">Racine du devis</option>
              {zonesCibles.map((z) => <option key={z.id} value={z.id}>{TYPE_LABEL[z.type]} · {z.libelle}</option>)}
            </select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => del && void supprimer(del, "deplacer", delCible || null)}>Déplacer puis supprimer</Button>
            <Button variant="destructive" onClick={() => del && void supprimer(del, "avec_contenu", null)}>Supprimer aussi le contenu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Changer le client : proposer de mettre à jour l'opportunité */}
      <Dialog open={!!askMajClient} onOpenChange={(o) => !o && setAskMajClient(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mettre aussi à jour l'opportunité ?</DialogTitle>
            <DialogDescription>Le client facturé du devis a changé. Voulez-vous l'appliquer aussi à l'affaire ?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAskMajClient(null)}>Non, le devis seulement</Button>
            <Button onClick={async () => { await setEntete({}, true); setAskMajClient(null); window.dispatchEvent(new Event("affaire-updated")); toast.success("Opportunité mise à jour"); }}>Oui, mettre à jour</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Corbeille */}
      <Sheet open={corbeille} onOpenChange={setCorbeille}>
        <SheetContent>
          <SheetHeader><SheetTitle>Corbeille du devis</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-2">
            {d.corbeille.map((c) => (
              <div key={c.groupe} className="flex items-center justify-between rounded border p-2 text-sm">
                <div><p>{(c.libelles ?? []).join(", ") || "Élément"}</p><p className="text-xs text-muted-foreground">{new Date(c.supprime_le).toLocaleString("fr-FR")}</p></div>
                <Button size="sm" variant="outline" onClick={() => void call("devis_corbeille_restaurer", { _devis_id: devisId, _groupe: c.groupe })}>Restaurer</Button>
              </div>
            ))}
            {(d.corbeille_elements ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <div><p>{c.libelle}</p><p className="text-xs text-muted-foreground">{{ heure: "Heures", materiau: "Matériau", libre: "Ligne libre" }[c.kind]} · {new Date(c.supprime_le).toLocaleString("fr-FR")}</p></div>
                <Button size="sm" variant="outline" onClick={() => void call("devis_element_supprimer", { _kind: c.kind, _id: c.id, _restaurer: true })}>Restaurer</Button>
              </div>
            ))}
            {d.corbeille.length + (d.corbeille_elements?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Vide.</p>}
          </div>
        </SheetContent>
      </Sheet>

      {/* Enregistrer comme modèle */}
      <Dialog open={modeleDlg} onOpenChange={setModeleDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enregistrer comme modèle</DialogTitle>
            <DialogDescription>Le client, les dates et l'affaire sont retirés ; toute la structure est copiée.</DialogDescription></DialogHeader>
          <Input placeholder="Nom du modèle" value={modele.nom} onChange={(e) => setModele({ ...modele, nom: e.target.value })} />
          <Input placeholder="Catégorie (décor événementiel, plateau TV, stand, location seule…)" value={modele.categorie} onChange={(e) => setModele({ ...modele, categorie: e.target.value })} />
          <Input placeholder="Description d'usage" value={modele.description} onChange={(e) => setModele({ ...modele, description: e.target.value })} />
          <DialogFooter><Button disabled={!modele.nom.trim()} onClick={async () => {
            const id = await call<string>("devis_modele_enregistrer", { _devis_id: devisId, _nom: modele.nom.trim(), _categorie: modele.categorie || null, _description: modele.description || null }, { refresh: false });
            if (id) { setModeleDlg(false); toast.success("Modèle enregistré", { action: { label: "Ouvrir", onClick: () => navigate({ to: "/parametres/devis-modeles/$devisId", params: { devisId: id } }) } }); }
          }}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={envoiDlg} onOpenChange={setEnvoiDlg}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marquer envoyé au client</DialogTitle>
            <DialogDescription>L'opportunité passe en « Envoyé » si elle n'est pas plus avancée. Le CA estimé reprend le total net HT, et l'action est ajoutée à l'historique.</DialogDescription>
          </DialogHeader>
          <Input type="date" value={envoiDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setEnvoiDate(e.target.value)} />
          <DialogFooter><Button disabled={!envoiDate} onClick={async () => {
            const r = await call("devis_marquer_envoye", { _devis_id: devisId, _date: envoiDate });
            setEnvoiDlg(false);
            if (r !== null) { toast.success("Devis marqué envoyé"); window.dispatchEvent(new Event("affaire-updated")); }
          }}>Confirmer l'envoi</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <DevisVueClient open={vueClient} onOpenChange={setVueClient} devisId={devisId} />
      <ExportPdfDialog open={pdfDlg} onOpenChange={setPdfDlg} devisId={devisId} />
      <ProgbatExportDialog open={pgDlg} onOpenChange={setPgDlg} devisId={devisId} peutTransferer={st === "valide" && d.droits.valider} onTransfert={() => setTrDlg(true)} />
      <EnregistrerTransfertDialog open={trDlg} onOpenChange={setTrDlg} devisId={devisId} netHt={calc?.net_ht ?? 0} numeroActuel={d.devis.numero_progbat ?? null}
        onDone={() => { void q.refetch(); window.dispatchEvent(new Event("affaire-updated")); }} />
      <EnvoiEmailDialog open={mailDlg} onOpenChange={setMailDlg} devisId={devisId} onSent={() => void q.refetch()} />
      <BibliothequeDialog open={biblio} onOpenChange={setBiblio} devisId={devisId}
        onInsert={async (srcId) => {
          const parent = ligneSel ? (ligneSel.type === "zone" || ligneSel.type === "option" || ligneSel.type.startsWith("chapitre") ? ligneSel.id : ligneSel.parent_id) : null;
          const id = await call<string>("devis_objet_inserer", { _devis_id: devisId, _parent_id: parent, _source_ligne_id: srcId });
          if (id) { setSelected(id); setBiblio(false); }
        }} />
      {signOpp && (
        <SignerOpportuniteDialog open={!!signOpp} onOpenChange={(o) => { if (!o) setSignOpp(null); }}
          affaireId={signOpp.id} oldCode={signOpp.code} clientLabel={signOpp.client} typologieFuture={signOpp.typologie}
          onSigned={() => { void signer(false); }} />
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between gap-2 border-b border-border/80 py-1 last:border-b-0 ${strong ? "text-base font-bold text-foreground" : ""}`}><span className="truncate">{label}</span><span className="tabular-nums">{value}</span></div>;
}

function HeuresMetier({ hm }: { hm: Record<string, number> }) {
  const metiers = useQuery({ queryKey: ["metiers-min"], queryFn: async () => (await supabase.from("metiers").select("id,libelle").order("ordre")).data ?? [] });
  const [tout, setTout] = useState(false);
  const pos = Object.entries(hm).filter(([, h]) => Number(h) > 0);
  const lignes: [string, number][] = tout ? (metiers.data ?? []).map((m) => [String(m.id), Number(hm[String(m.id)] ?? 0)] as [string, number]) : pos;
  return (
    <div className="space-y-1">
      {pos.length === 0 && !tout && <p className="text-xs text-muted-foreground">Aucune heure.</p>}
      {lignes.map(([k, h]) => <Row key={k} label={metiers.data?.find((m) => String(m.id) === k)?.libelle ?? "Sans métier"} value={`${String(h).replace(".", ",")} h`} />)}
      <button type="button" className="text-xs font-medium text-primary underline" onClick={() => setTout((t) => !t)}>{tout ? "Masquer les métiers à 0 h" : "tout afficher"}</button>
    </div>
  );
}

function DateCase({ label, value, onChange, disabled }: { label: string; value: string | null; onChange?: (v: string | null) => void; disabled?: boolean }) {
  return (
    <div className="rounded-md border p-2">
      <label className="block text-xs font-medium text-foreground/80">{label}
      {disabled ? <span className="block text-sm font-normal text-foreground">{value ? new Date(value).toLocaleDateString("fr-FR") : "À déterminer"}</span>
        : <Input type="date" className={`mt-0.5 h-8${value ? "" : " devis-champ-vide"}`} value={value ?? ""} onChange={(e) => onChange?.(e.target.value || null)} />}
      </label>
    </div>
  );
}

function RemiseBloc({ mode, valeur, readOnly, totalHt, onChange }: {
  mode: "aucune" | "montant" | "pct" | "net_cible"; valeur: number | null; readOnly: boolean; totalHt: number;
  onChange: (mode: "aucune" | "montant" | "pct" | "net_cible", valeur: number | null) => void;
}) {
  // Mode affiché localement : changer de mode n'enregistre rien tant que la valeur n'est pas validée.
  const [m, setM] = useState(mode);
  const [v, setV] = useState(valeur == null ? "" : String(valeur));
  useEffect(() => { setM(mode); setV(valeur == null ? "" : String(valeur)); }, [mode, valeur]);
  if (readOnly && mode === "aucune") return null;
  const commit = (mm: typeof mode, raw: string) => {
    if (mm === "aucune") { if (mode !== "aucune") onChange("aucune", null); return; }
    const n = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    if (n == null || Number.isNaN(n)) return;
    if (mm === mode && n === (valeur == null ? null : Number(valeur))) return;
    onChange(mm, n);
  };
  return (
    <div className="flex items-center gap-1 text-xs">
      <select aria-label="Type de remise" disabled={readOnly} className="h-7 rounded border bg-background px-1" value={m}
        onChange={(e) => {
          const nm = e.target.value as typeof mode;
          setM(nm);
          if (nm === "aucune") { setV(""); commit("aucune", ""); return; }
          // Total net souhaité : prérempli avec le total HT actuel (remise 0) ; autres modes : 0.
          setV(nm === "net_cible" ? String(totalHt) : "0");
        }}>
        <option value="aucune">Sans remise</option>
        <option value="montant">Remise en €</option>
        <option value="pct">Remise en %</option>
        <option value="net_cible">Total net souhaité</option>
      </select>
      {m !== "aucune" && (
        <input aria-label="Valeur de la remise" disabled={readOnly} inputMode="decimal" className="h-7 w-24 rounded border bg-background px-1 text-right"
          value={v} onChange={(e) => setV(e.target.value)} onBlur={() => commit(m, v)} onKeyDown={(e) => { if (e.key === "Enter") commit(m, v); }} />
      )}
    </div>
  );
}
