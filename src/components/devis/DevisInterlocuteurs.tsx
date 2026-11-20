import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ClientCombobox } from "@/components/clients/ClientCombobox";
import { useIsMobile } from "@/hooks/use-mobile";
import { droitsEntete, grouperCharges, manquesClient, type ChoixCharge } from "@/lib/devis/entete-verrou";

type Client = { id: string; nom: string; adresse: string | null; code_postal: string | null; ville: string | null; siret: string | null; tva_intracom: string | null } | null;
type Panneau = "charge" | "client" | "contact" | "signataire" | "chantier" | "final" | null;
const nomDe = (p: { prenom?: string | null; nom?: string | null; email?: string | null }) => [p.prenom, p.nom].filter(Boolean).join(" ") || p.email || "Sans nom";

export function DevisInterlocuteurs(props: {
  devisId: string; affaireId: string | null; codeChantier: string; statut: string; peutEcrire: boolean;
  client: Client; contactId: string | null; clientFinal: { id: string; nom: string } | null;
  enregistrer: (patch: Record<string, unknown>) => Promise<unknown>;
  changerClient: (id: string) => Promise<void>; rafraichir: () => Promise<unknown>;
}) {
  const { devisId, client } = props;
  const mobile = useIsMobile();
  const qc = useQueryClient();
  const [ouvert, setOuvert] = useState<Panneau>(null);
  const charge = useQuery({ queryKey: ["devis-charge", devisId], queryFn: async () => {
    const { data, error } = await supabase.rpc("devis_charge_affaires_actuel", { _devis_id: devisId });
    if (error) throw error; return data?.[0] ?? null;
  } });
  const peutAffaire = useQuery({ queryKey: ["devis-charge-choix", devisId], queryFn: async () => {
    const { data, error } = await supabase.rpc("devis_charges_affaires_choix", { _devis_id: devisId });
    if (error) throw error; return (data ?? []) as ChoixCharge[];
  } });
  const contacts = useQuery({ queryKey: ["devis-contacts", devisId, client?.id], enabled: !!client, queryFn: async () => {
    const { data, error } = await supabase.rpc("devis_contacts_client", { _devis_id: devisId });
    if (error) throw error; return data ?? [];
  } });
  const email = useQuery({ queryKey: ["devis-client-email", devisId, client?.id], enabled: !!client, queryFn: async () => {
    const { data } = await supabase.rpc("devis_client_email", { _devis_id: devisId }); return (data as string | null) ?? null;
  } });
  const champs = useQuery({ queryKey: ["devis-entete-champs", devisId], queryFn: async () => {
    const { data, error } = await supabase.from("devis").select("signataire_prenom,signataire_nom,signataire_email,signataire_telephone,chantier_adresse,travaux_libelle,travaux_debut,travaux_duree_jours").eq("id", devisId).maybeSingle();
    if (error) throw error; return data;
  } });
  const droits = droitsEntete(props.statut, props.peutEcrire, (peutAffaire.data?.length ?? 0) > 0);
  const contact = (contacts.data ?? []).find((c) => c.id === props.contactId) ?? null;
  const manques = manquesClient(client, email.data);
  const s = champs.data;
  const signataire = s && [s.signataire_prenom, s.signataire_nom].filter(Boolean).join(" ");
  const tout = async () => { await Promise.all([props.rafraichir(), charge.refetch(), contacts.refetch(), email.refetch(), champs.refetch(), qc.invalidateQueries({ queryKey: ["devis-champs-client", devisId] })]); };

  const lignes: { k: Exclude<Panneau, null>; label: string; valeur: string; alerte?: string; modifiable: boolean }[] = [
    { k: "charge", label: "Chargé d'affaires", valeur: charge.data ? nomDe(charge.data) : "—", alerte: charge.data ? undefined : "aucun chargé d'affaires", modifiable: droits.charge },
    { k: "client", label: "Client facturé", valeur: client?.nom ?? "—", alerte: manques.length ? `${manques.join(", ")} manquant${manques.length > 1 ? "s" : ""}` : undefined, modifiable: droits.devis || (droits.fiches && !!client) },
    { k: "contact", label: "Contact", valeur: contact ? nomDe(contact) : "—", alerte: !client ? undefined : !contact ? "aucun contact choisi" : !contact.email && droits.fiches ? "e-mail manquant" : undefined, modifiable: !!client && (droits.devis || droits.fiches) },
    { k: "signataire", label: "Signataire", valeur: signataire || "—", alerte: signataire && !s?.signataire_email ? "e-mail manquant (non imprimé)" : undefined, modifiable: droits.devis },
    { k: "chantier", label: "Chantier", valeur: [s?.chantier_adresse, s?.travaux_libelle].filter(Boolean).join(" · ") || "—", modifiable: droits.devis },
    { k: "final", label: "Client final", valeur: props.clientFinal?.nom ?? "—", modifiable: droits.devis },
  ];

  return (
    <div className="w-full space-y-2" id="devis-client">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Client & interlocuteurs</h2>
        {droits.message && <p className="text-xs text-muted-foreground">{droits.message}</p>}
      </div>
      <ul className="divide-y rounded-md border md:grid md:grid-cols-3 md:divide-y-0 md:gap-px md:bg-border">
        {lignes.map((l) => (
          <li key={l.k} className="flex items-center gap-2 bg-card px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{l.label}</p>
              <p className="truncate text-sm font-medium">{l.valeur}</p>
              {l.alerte && <p className="flex items-center gap-1 text-xs"><AlertTriangle className="h-3 w-3 shrink-0 text-warning" />{l.alerte}</p>}
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 text-primary" onClick={() => setOuvert(l.k)}>{l.modifiable ? "Changer" : "Voir"}</Button>
          </li>
        ))}
      </ul>
      <Sheet open={!!ouvert} onOpenChange={(o) => { if (!o) setOuvert(null); }}>
        <SheetContent side={mobile ? "bottom" : "right"} className={mobile ? "max-h-[85vh] overflow-y-auto" : "w-full overflow-y-auto sm:max-w-md"}>
          <SheetHeader><SheetTitle>{lignes.find((l) => l.k === ouvert)?.label}</SheetTitle>
            <SheetDescription>{ouvert === "charge" ? `S'applique à tout le chantier ${props.codeChantier} et à ses autres devis.` : droits.message ?? "Enregistré sur ce devis."}</SheetDescription></SheetHeader>
          <div className="mt-4 space-y-4">
            {ouvert === "charge" && <PanneauCharge liste={peutAffaire.data ?? []} actuel={charge.data?.employe_id ?? null} modifiable={droits.charge} code={props.codeChantier}
              choisir={async (id) => {
                if (!props.affaireId) return;
                const { error } = await supabase.rpc("app_affecter_role_projet", { _affaire_id: props.affaireId, _role: "charge_affaires", _employe_id: id });
                if (error) { toast.error("Changement impossible", { description: error.message }); return; }
                toast.success("Chargé d'affaires mis à jour sur le chantier"); window.dispatchEvent(new Event("affaire-updated")); await tout(); setOuvert(null);
              }} />}
            {ouvert === "client" && <>
              {droits.devis && <div className="space-y-1"><Label>Client facturé</Label>
                <ClientCombobox value={client?.nom ?? null} clientId={client?.id ?? null} allowClear={false} onChange={async (id) => { if (id) { await props.changerClient(id); await tout(); } }} /></div>}
              {client && <FicheForm titre="Fiche client" disabled={!droits.fiches} valeurs={{ adresse: client.adresse, code_postal: client.code_postal, ville: client.ville, siret: client.siret, tva_intracom: client.tva_intracom, email: email.data ?? null }}
                libelles={{ adresse: "Adresse", code_postal: "Code postal", ville: "Ville", siret: "SIRET", tva_intracom: "TVA intracom", email: "E-mail" }}
                enregistrer={async (patch) => {
                  const { error } = await supabase.rpc("devis_client_completer", { _devis_id: devisId, _patch: patch });
                  if (error) { toast.error("Fiche non enregistrée", { description: error.message }); return; }
                  toast.success("Fiche client complétée"); await tout();
                }} />}
            </>}
            {ouvert === "contact" && <PanneauContact contacts={contacts.data ?? []} actuel={props.contactId} droitsDevis={droits.devis} droitsFiches={droits.fiches}
              choisir={async (id) => { await props.enregistrer({ contact_id: id }); await tout(); }}
              completer={async (id, patch) => {
                const { error } = await supabase.rpc("devis_contact_completer", { _devis_id: devisId, _contact_id: id, _patch: patch });
                if (error) { toast.error("Contact non enregistré", { description: error.message }); return; }
                toast.success("Contact complété"); await tout();
              }}
              creer={async (v) => {
                const { error } = await supabase.rpc("devis_contact_creer", { _devis_id: devisId, _prenom: v.prenom ?? "", _nom: v.nom ?? "", _email: v.email ?? "", _telephone: v.telephone ?? "" });
                if (error) { toast.error("Contact non créé", { description: error.message }); return false; }
                toast.success(droits.devis ? "Contact créé et choisi" : "Contact créé"); await tout(); return true;
              }} />}
            {ouvert === "signataire" && s && <PanneauSignataire disabled={!droits.devis} contact={contact} valeurs={s}
              enregistrer={async (patch) => { await props.enregistrer(patch); await tout(); }} />}
            {ouvert === "chantier" && s && <FicheForm titre="Chantier" disabled={!droits.devis}
              valeurs={{ chantier_adresse: s.chantier_adresse, travaux_libelle: s.travaux_libelle, travaux_debut: s.travaux_debut, travaux_duree_jours: s.travaux_duree_jours == null ? null : String(s.travaux_duree_jours) }}
              libelles={{ chantier_adresse: "Adresse du chantier", travaux_libelle: "Travaux", travaux_debut: "Début des travaux", travaux_duree_jours: "Durée (jours)" }}
              types={{ travaux_debut: "date", travaux_duree_jours: "number" }}
              enregistrer={async (patch) => { await props.enregistrer(patch); await tout(); }} />}
            {ouvert === "final" && <div className="space-y-1"><Label>Client final (facultatif)</Label>
              <ClientCombobox value={props.clientFinal?.nom ?? null} clientId={props.clientFinal?.id ?? null} disabled={!droits.devis}
                onChange={async (id) => { await props.enregistrer({ client_final_id: id }); await tout(); }} /></div>}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PanneauCharge({ liste, actuel, modifiable, code, choisir }: { liste: ChoixCharge[]; actuel: string | null; modifiable: boolean; code: string; choisir: (id: string) => Promise<void> }) {
  const [q, setQ] = useState("");
  const g = useMemo(() => grouperCharges(liste, q), [liste, q]);
  if (!modifiable) return <p className="text-sm text-muted-foreground">Vous ne pouvez pas modifier le chantier.</p>;
  const bloc = (titre: string, l: ChoixCharge[]) => l.length > 0 && <div><p className="mb-1 text-xs font-medium uppercase text-muted-foreground">{titre}</p>
    <ul className="space-y-1">{l.map((e) => <li key={e.id}><button type="button" disabled={e.id === actuel}
      className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-accent disabled:border-primary disabled:font-semibold"
      onClick={() => { if (window.confirm(`Nommer ${nomDe(e)} chargé d'affaires ?\n\nS'applique à tout le chantier ${code} et à ses autres devis.`)) void choisir(e.id); }}>
      {nomDe(e)}{e.id === actuel ? " · actuel" : ""}</button></li>)}</ul></div>;
  return <div className="space-y-3">
    <Input autoFocus placeholder="Rechercher un employé…" value={q} onChange={(e) => setQ(e.target.value)} />
    {bloc("Habituels", g.habituels)}{bloc("Autres employés", g.autres)}
    {!g.habituels.length && !g.autres.length && <p className="text-sm text-muted-foreground">Aucun employé actif trouvé.</p>}
  </div>;
}

type Contact = { id: string; prenom: string | null; nom: string | null; email: string | null; telephone: string | null };
function PanneauContact({ contacts, actuel, droitsDevis, droitsFiches, choisir, completer, creer }: {
  contacts: Contact[]; actuel: string | null; droitsDevis: boolean; droitsFiches: boolean;
  choisir: (id: string | null) => Promise<void>; completer: (id: string, p: Record<string, string>) => Promise<void>; creer: (v: Record<string, string | null>) => Promise<boolean>;
}) {
  const [nouveau, setNouveau] = useState(false);
  const c = contacts.find((x) => x.id === actuel) ?? null;
  return <div className="space-y-4">
    <ul className="space-y-1">{contacts.map((x) => <li key={x.id}><button type="button" disabled={!droitsDevis || x.id === actuel}
      className="w-full rounded-md border px-3 py-2 text-left text-sm enabled:hover:bg-accent disabled:opacity-100 data-[actuel=true]:border-primary data-[actuel=true]:font-semibold" data-actuel={x.id === actuel}
      onClick={() => void choisir(x.id)}>{nomDe(x)}{x.email ? <span className="block text-xs font-normal text-muted-foreground">{x.email}</span> : null}</button></li>)}
      {!contacts.length && <li className="text-sm text-muted-foreground">Aucun contact pour ce client.</li>}</ul>
    {droitsDevis && actuel && <Button type="button" variant="outline" size="sm" onClick={() => void choisir(null)}>Retirer le contact</Button>}
    {c && droitsFiches && <FicheForm key={c.id} titre={`Compléter ${nomDe(c)}`} valeurs={{ prenom: c.prenom, nom: c.nom, email: c.email, telephone: c.telephone }}
      libelles={{ prenom: "Prénom", nom: "Nom", email: "E-mail", telephone: "Téléphone" }} enregistrer={(p) => completer(c.id, p)} />}
    {droitsFiches && (nouveau
      ? <FicheForm titre="Nouveau contact" bouton="Créer le contact" valeurs={{ prenom: null, nom: null, email: null, telephone: null }}
          libelles={{ prenom: "Prénom", nom: "Nom", email: "E-mail", telephone: "Téléphone" }} tout
          enregistrer={async (p) => { if (await creer(p)) setNouveau(false); }} />
      : <Button type="button" variant="ghost" size="sm" className="px-0 text-primary" onClick={() => setNouveau(true)}><Plus className="mr-1 h-3.5 w-3.5" />Nouveau contact</Button>)}
  </div>;
}

function PanneauSignataire({ disabled, contact, valeurs, enregistrer }: { disabled: boolean; contact: Contact | null; valeurs: Record<string, unknown>; enregistrer: (p: Record<string, string | null>) => Promise<void> }) {
  const init = { signataire_prenom: (valeurs.signataire_prenom as string | null) ?? "", signataire_nom: (valeurs.signataire_nom as string | null) ?? "", signataire_email: (valeurs.signataire_email as string | null) ?? "", signataire_telephone: (valeurs.signataire_telephone as string | null) ?? "" };
  const [v, setV] = useState(init);
  const lib: Record<keyof typeof init, string> = { signataire_prenom: "Prénom", signataire_nom: "Nom", signataire_email: "E-mail", signataire_telephone: "Téléphone" };
  return <div className="space-y-3">
    {!disabled && contact && <Button type="button" variant="outline" size="sm" onClick={() => setV({ signataire_prenom: contact.prenom ?? "", signataire_nom: contact.nom ?? "", signataire_email: contact.email ?? "", signataire_telephone: contact.telephone ?? "" })}>= contact ({nomDe(contact)})</Button>}
    {(Object.keys(lib) as (keyof typeof init)[]).map((k) => <div key={k} className="space-y-1"><Label htmlFor={k}>{lib[k]}</Label>
      <Input id={k} value={v[k]} disabled={disabled} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>)}
    <p className="text-xs text-muted-foreground">Imprimé sur le PDF si prénom, nom et e-mail sont remplis.</p>
    {!disabled && <Button type="button" onClick={() => void enregistrer(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null])))}>Enregistrer</Button>}
  </div>;
}

function FicheForm({ titre, valeurs, libelles, types, disabled, bouton = "Enregistrer", tout, enregistrer }: {
  titre: string; valeurs: Record<string, string | null>; libelles: Record<string, string>; types?: Record<string, string>; disabled?: boolean; bouton?: string; tout?: boolean;
  enregistrer: (patch: Record<string, string>) => Promise<void>;
}) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(Object.keys(libelles).map((k) => [k, valeurs[k] ?? ""])));
  const patch = Object.fromEntries(Object.entries(v).filter(([k, x]) => tout || x !== (valeurs[k] ?? "")));
  return <div className="space-y-3 rounded-md border p-3">
    <p className="text-sm font-medium">{titre}</p>
    {Object.keys(libelles).map((k) => <div key={k} className="space-y-1"><Label htmlFor={`f-${titre}-${k}`}>{libelles[k]}</Label>
      <Input id={`f-${titre}-${k}`} type={types?.[k] ?? "text"} value={v[k]} disabled={disabled} className={!v[k] && !disabled ? "devis-champ-vide" : undefined}
        onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>)}
    {!disabled && <Button type="button" size="sm" disabled={!Object.keys(patch).length} onClick={() => void enregistrer(patch)}>{bouton}</Button>}
  </div>;
}
