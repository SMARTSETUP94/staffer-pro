import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Eye, Library, MessageSquarePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ClientCombobox } from "@/components/clients/ClientCombobox";
import { calculerDevis } from "@/lib/devis/calcul";
import { DevisArbre } from "./DevisArbre";
import { ObjetPanel } from "./ObjetPanel";
import { DevisVueClient } from "./DevisVueClient";
import { BibliothequeDialog } from "./BibliothequeDialog";
import { useAutosave } from "./useAutosave";
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

  const d = q.data;
  const contacts = useQuery({
    queryKey: ["client-contacts", d?.devis.client_id],
    enabled: !!d?.devis.client_id,
    queryFn: async () => (await supabase.from("client_contacts").select("id,nom,prenom,email").eq("client_id", d!.devis.client_id!).eq("actif", true).order("nom")).data ?? [],
  });

  useEffect(() => {
    if (d && !selected) setSelected(d.lignes.find((l) => l.type === "objet")?.id ?? d.lignes[0]?.id ?? null);
  }, [d, selected]);

  const calc = useMemo(() => {
    if (!d) return null;
    return calculerDevis(
      d.lignes.map((l) => ({ ...l, quantite: Number(l.quantite) })),
      d.heures.map((h) => ({ ...h, heures: Number(h.heures), taux_vente: Number(h.taux_vente), cout_revient: h.cout_revient == null ? null : Number(h.cout_revient) })),
      d.materiaux.map((m) => ({ ...m, quantite: Number(m.quantite), prix_achat: Number(m.prix_achat ?? 0), coefficient: Number(m.coefficient) })),
      d.libres.map((f) => ({ ...f, quantite: Number(f.quantite), prix_achat: f.prix_achat == null ? null : Number(f.prix_achat), prix_forfait: f.prix_forfait == null ? null : Number(f.prix_forfait), coefficient: Number(f.coefficient) })),
      Number(d.calcul.tva_pct ?? 20),
    );
  }, [d]);

  if (q.isLoading) return <p className="p-6 text-sm text-muted-foreground">Chargement…</p>;
  if (q.error || !d || !calc) return <p className="p-6 text-sm text-destructive">{(q.error as Error)?.message ?? "Devis introuvable"}</p>;

  const st = d.devis.statut_redaction;
  const readOnly = st !== "brouillon" || !d.droits.ecrire;
  const ligneSel = d.lignes.find((l) => l.id === selected) ?? null;
  // Le calcul serveur est exact pour les droits ; la marge reste masquée sans le droit coûts.
  const marge = d.droits.couts ? calc.marge : null;

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

  const signer = async () => {
    if (!window.confirm("Le client a signé ce devis ? Les objets de fabrication et leurs heures par métier vont être créés.")) return;
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

  const nouvelleVersion = async () => {
    const id = await call<string>("devis_nouvelle_version", { _devis_id: devisId }, { refresh: false });
    if (id && affaireId) navigate({ to: "/affaires/$affaireId/devis-staffing/$devisId", params: { affaireId, devisId: id } });
  };

  const setEntete = (patchObj: Record<string, unknown>, majAffaire = false) =>
    call("devis_entete_modifier", { _devis_id: devisId, _patch: patchObj, _maj_affaire_client: majAffaire });

  const dates = d.devis.dates_snapshot ?? (d.affaire as unknown as Record<string, string | null> | null) ?? {};
  const clientManque = d.client && (!d.client.adresse || !d.client.siret);
  const zonesCibles = del ? d.lignes.filter((l) => l.id !== del.id && ["zone", "option"].includes(l.type) && !l.parent_id) : [];

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <Card>
        <CardContent className="flex flex-wrap items-start gap-4 p-4">
          <div className="min-w-48">
            {affaireId && <Link to="/affaires/$affaireId/devis-staffing" params={{ affaireId }} className="flex items-center text-xs text-muted-foreground hover:underline"><ArrowLeft className="mr-1 h-3 w-3" />Devis</Link>}
            <h1 className="text-xl font-semibold">{d.devis.est_modele ? `Modèle — ${d.devis.modele_nom ?? ""}` : d.devis.numero}</h1>
            <p className="text-xs text-muted-foreground">
              {d.affaire ? `${d.affaire.numero ?? d.affaire.code_opportunite ?? ""} ${d.affaire.nom ?? ""}` : ""}
              {d.modele_origine && ` · modèle : ${d.modele_origine}`}
            </p>
            <Badge className="mt-1">{STATUT_LABEL[st]}</Badge>
          </div>
          {!d.devis.est_modele && (
            <>
              <div className="w-64 space-y-1">
                <p className="text-xs text-muted-foreground">Client facturé</p>
                <ClientCombobox value={d.client?.nom ?? null} clientId={d.devis.client_id} disabled={readOnly} allowClear={false}
                  onChange={async (id) => { await setEntete({ client_id: id }); if (d.affaire) setAskMajClient({ id }); }} />
                {clientManque && <p className="flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3 w-3" />
                  Fiche client incomplète ({[!d.client!.adresse && "adresse", !d.client!.siret && "SIRET"].filter(Boolean).join(", ")}) —{" "}
                  <Link to="/clients/$clientId" params={{ clientId: d.client!.id }} className="underline">compléter</Link></p>}
              </div>
              <div className="w-56 space-y-1">
                <p className="text-xs text-muted-foreground">Contact</p>
                <select disabled={readOnly || !d.devis.client_id} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={d.devis.contact_id ?? ""}
                  onChange={(e) => void setEntete({ contact_id: e.target.value || null })}>
                  <option value="">—</option>
                  {(contacts.data ?? []).map((c) => <option key={c.id} value={c.id}>{[c.prenom, c.nom].filter(Boolean).join(" ") || c.email}</option>)}
                </select>
              </div>
              <div className="w-56 space-y-1">
                <p className="text-xs text-muted-foreground">Client final (facultatif)</p>
                <ClientCombobox value={d.client_final?.nom ?? null} clientId={d.devis.client_final_id} disabled={readOnly}
                  onChange={(id) => void setEntete({ client_final_id: id })} />
              </div>
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

      {/* Dates clés */}
      {!d.devis.est_modele && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
          <DateCase label="Opportunité" value={d.affaire?.created_at?.slice(0, 10) ?? null} disabled />
          <DateCase label="Date du devis" value={d.devis.date_devis} disabled={readOnly} onChange={(v) => void setEntete({ date_devis: v })} />
          {DATES.map((x) => (
            <DateCase key={x.key} label={x.label} value={(dates as Record<string, string | null>)[x.key] ?? null} disabled={readOnly}
              onChange={(v) => void call("devis_dates_modifier", { _devis_id: devisId, _patch: { [x.key]: v ?? "" } }).then(() => window.dispatchEvent(new Event("affaire-updated")))} />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr_260px]">
        {/* Arbre */}
        <Card>
          <CardContent className="space-y-3 p-3">
            {!readOnly && (
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => void ajouter("zone")}><Plus className="mr-1 h-3.5 w-3.5" />Zone</Button>
                <Button size="sm" variant="outline" onClick={() => void ajouter("objet")}><Plus className="mr-1 h-3.5 w-3.5" />Objet</Button>
                <Button size="sm" variant="outline" onClick={() => void ajouter("commentaire", { texte: "" })}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" />Commentaire</Button>
                <Button size="sm" variant="outline" onClick={() => setBiblio(true)}><Library className="mr-1 h-3.5 w-3.5" />Bibliothèque</Button>
                <select className="h-8 rounded-md border bg-background px-1 text-xs" value="" onChange={(e) => e.target.value && void ajouter(e.target.value as Ligne["type"])}>
                  <option value="">+ Chapitre…</option>
                  <option value="chapitre_suivi">Suivi et plans</option><option value="chapitre_pose">Pose</option>
                  <option value="chapitre_depose">Dépose</option><option value="option">Option</option>
                </select>
              </div>
            )}
            <DevisArbre lignes={d.lignes} montants={calc.lignes} racines={calc.racines} selected={selected} readOnly={readOnly}
              actions={{
                select: setSelected,
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
            {!readOnly && d.corbeille.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setCorbeille(true)}><Trash2 className="mr-1 h-3.5 w-3.5" />Corbeille ({d.corbeille.length})</Button>
            )}
          </CardContent>
        </Card>

        {/* Fiche */}
        <Card>
          <CardContent className="p-4">
            {ligneSel ? <ObjetPanel key={ligneSel.id} data={d} ligne={ligneSel} readOnly={readOnly} call={call} patch={patch} save={save} onSelect={setSelected} />
              : <p className="text-sm text-muted-foreground">Sélectionnez un élément dans l'arbre.</p>}
          </CardContent>
        </Card>

        {/* Synthèse */}
        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
            <div className="space-y-1">
              <Row label="Total HT" value={eur(calc.total_ht)} strong />
              <Row label={`TVA ${Number(d.calcul.tva_pct)} %`} value={eur(calc.tva)} />
              <Row label="TTC" value={eur(calc.ttc)} />
              {calc.options_ht > 0 && <Row label="Options (hors total)" value={eur(calc.options_ht)} />}
            </div>
            <div className="space-y-1 border-t pt-2">
              {d.lignes.filter((l) => !l.parent_id && l.type !== "commentaire").sort((a, b) => a.ordre - b.ordre).map((z) => (
                <Row key={z.id} label={`${z.libelle || TYPE_LABEL[z.type]}`} value={eur(calc.racines[z.id] ?? 0)} />
              ))}
            </div>
            <div className="space-y-1 border-t pt-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Heures par métier</p>
              <HeuresMetier hm={calc.heures_metier} />
            </div>
            {d.droits.couts && (
              <div className="border-t pt-2">
                <Row label="Marge interne" value={marge === "non_calculable" ? "non calculable" : eur(marge as number)} />
              </div>
            )}
            <div className="flex flex-col gap-2 border-t pt-3">
              {st === "brouillon" && d.droits.ecrire && !d.devis.est_modele && <Button variant="outline" onClick={() => void changerStatut("a_valider")}>Soumettre à validation</Button>}
              {st === "a_valider" && d.droits.ecrire && <Button variant="ghost" onClick={() => void changerStatut("brouillon")}>Repasser en brouillon</Button>}
              {(st === "brouillon" || st === "a_valider") && d.droits.valider && !d.devis.est_modele && <Button onClick={() => void changerStatut("valide")}>Valider</Button>}
              {!d.devis.est_modele && st !== "brouillon" && d.droits.ecrire && <Button variant="outline" onClick={() => void nouvelleVersion()}>Nouvelle version</Button>}
              {["valide", "transfere"].includes(st) && d.droits.valider && !d.devis.est_modele && (
                <Button onClick={() => void signer()}>Devis signé → créer la fabrication</Button>
              )}
              {["a_valider", "valide", "transfere"].includes(st) && d.droits.valider && <Button variant="ghost" className="text-destructive" onClick={() => void changerStatut("refuse")}>Marquer refusé</Button>}
              <Button variant="outline" onClick={() => setVueClient(true)}><Eye className="mr-1 h-4 w-4" />Vue client</Button>
              {!d.devis.est_modele && d.droits.parametres && <Button variant="ghost" onClick={() => { setModele({ nom: d.devis.libelle ?? "", categorie: "", description: "" }); setModeleDlg(true); }}>Enregistrer comme modèle</Button>}
              <Button variant="outline" disabled title="Lot 3">Vers ProGBat (lot 3)</Button>
            </div>
          </CardContent>
        </Card>
      </div>

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
            {d.corbeille.length === 0 && <p className="text-sm text-muted-foreground">Vide.</p>}
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

      <DevisVueClient open={vueClient} onOpenChange={setVueClient} devisId={devisId} />
      <BibliothequeDialog open={biblio} onOpenChange={setBiblio} devisId={devisId}
        onInsert={async (srcId) => {
          const parent = ligneSel ? (ligneSel.type === "zone" || ligneSel.type === "option" || ligneSel.type.startsWith("chapitre") ? ligneSel.id : ligneSel.parent_id) : null;
          const id = await call<string>("devis_objet_inserer", { _devis_id: devisId, _parent_id: parent, _source_ligne_id: srcId });
          if (id) { setSelected(id); setBiblio(false); }
        }} />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between gap-2 ${strong ? "text-base font-semibold" : ""}`}><span className="truncate">{label}</span><span className="tabular-nums">{value}</span></div>;
}

function HeuresMetier({ hm }: { hm: Record<string, number> }) {
  const metiers = useQuery({ queryKey: ["metiers-min"], queryFn: async () => (await supabase.from("metiers").select("id,libelle").order("ordre")).data ?? [] });
  const entries = Object.entries(hm);
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">Aucune heure.</p>;
  return <>{entries.map(([k, h]) => <Row key={k} label={metiers.data?.find((m) => String(m.id) === k)?.libelle ?? "Sans métier"} value={`${h} h`} />)}</>;
}

function DateCase({ label, value, onChange, disabled }: { label: string; value: string | null; onChange?: (v: string | null) => void; disabled?: boolean }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      {disabled ? <p className="text-sm">{value ? new Date(value).toLocaleDateString("fr-FR") : "À déterminer"}</p>
        : <Input type="date" className="h-8" value={value ?? ""} onChange={(e) => onChange?.(e.target.value || null)} />}
    </div>
  );
}
