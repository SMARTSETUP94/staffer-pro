import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  basculer, basculerQualif, CACES_OPTIONS, JOURS_COURT, joursSemaine, libelleJour, libelleLimite,
  libelleSemaine, libelleEtat, normaliserTelephone, PERMIS_OPTIONS, phraseResume, recapCourt, resumeDispos,
  type JourDispo,
} from "@/lib/dispos";

export const Route = createFileRoute("/dispos")({
  head: () => ({
    meta: [
      { title: "Dispos — SET UP" },
      { name: "description", content: "Donnez vos disponibilités de la semaine prochaine pour les montages et démontages SET UP." },
      { property: "og:title", content: "Dispos — SET UP" },
      { property: "og:description", content: "Vos dispos pour les montages et démontages, en 20 secondes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DisposPage,
});

const CLE = "setup_dispos_jeton";

type Semaine = { debut: string; fin: string; heure_limite: string; close: boolean };
type Moi = {
  prenom: string; permis: string[]; caces: string[]; caces_autre: string | null;
  semaine: Semaine; jours: JourDispo[]; precedente: JourDispo[]; note: string | null; envoye_le: string | null;
};

function lireJeton(): string | null {
  const ls = window.localStorage.getItem(CLE);
  if (ls) return ls;
  const m = document.cookie.match(new RegExp(`(?:^|; )${CLE}=([0-9a-f]{64})`));
  return m ? m[1] : null;
}
function ecrireJeton(j: string | null) {
  if (j) {
    window.localStorage.setItem(CLE, j);
    document.cookie = `${CLE}=${j}; path=/dispos; max-age=${60 * 60 * 24 * 400}; samesite=lax; secure`;
  } else {
    window.localStorage.removeItem(CLE);
    document.cookie = `${CLE}=; path=/dispos; max-age=0`;
  }
}
/** Les fonctions publiques renvoient { erreur } pour un refus (le compteur anti-abus reste compté). */
function erreurMetier(data: unknown): string | null {
  const e = (data as { erreur?: string } | null)?.erreur;
  return typeof e === "string" ? e : null;
}
function messageErreur(e: unknown): string {
  const m = (e as { message?: string })?.message ?? "";
  return m && !/fetch|network/i.test(m) ? m : "Connexion impossible, réessayez.";
}

function DisposPage() {
  const [etat, setEtat] = useState<"chargement" | "identite" | "dispos" | "envoye" | "qualifs">("chargement");
  const [jeton, setJeton] = useState<string | null>(null);
  const [moi, setMoi] = useState<Moi | null>(null);
  const [semaine, setSemaine] = useState<Semaine | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const chargerMoi = async (j: string) => {
    const { data, error } = await supabase.rpc("dispos_public_moi", { _jeton: j });
    if (error) { ecrireJeton(null); setJeton(null); setEtat("identite"); return; }
    const m = data as unknown as Moi;
    setMoi(m); setSemaine(m.semaine);
    setEtat(m.envoye_le || m.semaine.close ? "envoye" : "dispos");
  };

  useEffect(() => {
    const j = lireJeton();
    supabase.rpc("dispos_public_semaine").then(({ data }) => data && setSemaine(data as unknown as Semaine));
    if (j) { setJeton(j); void chargerMoi(j); } else setEtat("identite");
  }, []);

  return (
    <div className="min-h-screen bg-su-fond font-sans text-su-texte">
      <div className="mx-auto max-w-[560px] px-4 pb-40 pt-5">
        <header className="mb-5 flex items-center gap-2">
          <span className="flex gap-1" aria-hidden>
            {["bg-su-orange", "bg-su-jaune", "bg-su-vert", "bg-su-ciel"].map((c) => (
              <span key={c} className={`h-2.5 w-2.5 rounded-full ${c}`} />
            ))}
          </span>
          <span className="font-sora text-base font-semibold tracking-wide">SET UP · Dispos</span>
        </header>
        {erreur && (
          <p role="alert" className="mb-4 rounded-lg border border-su-orange bg-su-carte px-4 py-3 text-sm">{erreur}</p>
        )}
        {etat === "chargement" && <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-su-second" /></div>}
        {etat === "identite" && (
          <Identite
            semaine={semaine}
            onErreur={setErreur}
            onOk={async (j) => { setErreur(null); ecrireJeton(j); setJeton(j); await chargerMoi(j); }}
          />
        )}
        {etat === "dispos" && moi && jeton && (
          <MesDispos
            moi={moi} jeton={jeton} onErreur={setErreur}
            onEnvoye={(m) => { setErreur(null); setMoi(m); setEtat("envoye"); window.scrollTo(0, 0); }}
            onQualifs={() => setEtat("qualifs")}
            onPasMoi={() => { ecrireJeton(null); setJeton(null); setMoi(null); setEtat("identite"); }}
          />
        )}
        {etat === "envoye" && moi && (
          <Envoye moi={moi} onModifier={() => setEtat("dispos")} onQualifs={() => setEtat("qualifs")} />
        )}
        {etat === "qualifs" && moi && jeton && (
          <Qualifs
            moi={moi} jeton={jeton} onErreur={setErreur}
            onRetour={(m) => { setErreur(null); if (m) setMoi(m); setEtat(moi.envoye_le || moi.semaine.close ? "envoye" : "dispos"); }}
          />
        )}
        <p className="mt-8 text-center text-xs text-su-second">Vos informations restent chez Set Up et ne servent qu'au planning.</p>
      </div>
    </div>
  );
}

function Carte({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-su-filet bg-su-carte p-4 ${className}`}>{children}</section>;
}
function Titre({ children }: { children: React.ReactNode }) {
  return <h1 className="font-sora text-2xl font-semibold leading-tight">{children}</h1>;
}
function BoutonPrincipal(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-su-bleu px-5 text-base font-semibold text-su-carte transition-colors hover:bg-su-profond disabled:opacity-60 ${props.className ?? ""}`}
    />
  );
}
function Pastilles({ options, valeur, onChange, label }: {
  options: readonly { value: string; label: string }[]; valeur: string[]; onChange: (v: string[]) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = valeur.includes(o.value);
        return (
          <button
            key={o.value} type="button" aria-pressed={on}
            onClick={() => onChange(basculerQualif(valeur, o.value))}
            className={`min-h-[44px] rounded-full border px-4 text-sm font-medium ${on ? "border-su-bleu bg-su-bleu text-su-carte" : "border-su-filet bg-su-carte text-su-texte"}`}
          >{o.label}</button>
        );
      })}
    </div>
  );
}
function ChampsQualifs({ permis, setPermis, caces, setCaces, autre, setAutre }: {
  permis: string[]; setPermis: (v: string[]) => void; caces: string[]; setCaces: (v: string[]) => void;
  autre: string; setAutre: (v: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Permis <span className="font-normal text-su-second">· recommandé</span></p>
        <Pastilles label="Permis" options={PERMIS_OPTIONS} valeur={permis} onChange={setPermis} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold">CACES <span className="font-normal text-su-second">· recommandé</span></p>
        <Pastilles label="CACES" options={CACES_OPTIONS} valeur={caces} onChange={setCaces} />
        <label className="block text-sm text-su-second">
          Autre
          <input
            value={autre} maxLength={60} onChange={(e) => setAutre(e.target.value)}
            placeholder="Ex. R485 gerbeur"
            className="mt-1 block min-h-[48px] w-full rounded-lg border border-su-filet bg-su-carte px-3 text-base text-su-texte"
          />
        </label>
      </div>
    </>
  );
}

function Identite({ semaine, onOk, onErreur }: { semaine: Semaine | null; onOk: (j: string) => void; onErreur: (m: string | null) => void }) {
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [permis, setPermis] = useState<string[]>([]);
  const [caces, setCaces] = useState<string[]>([]);
  const [autre, setAutre] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const telOk = normaliserTelephone(tel);
  const valide = prenom.trim() && nom.trim() && telOk;
  const champ = "mt-1 block min-h-[48px] w-full rounded-lg border border-su-filet bg-su-carte px-3 text-base text-su-texte";

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valide) { onErreur(telOk ? "Prénom et nom obligatoires." : "Numéro de portable invalide (06 ou 07, 10 chiffres)."); return; }
    setEnvoi(true);
    const { data, error } = await supabase.rpc("dispos_public_identifier", {
      _prenom: prenom, _nom: nom, _telephone: telOk!, _permis: permis, _caces: caces, _caces_autre: autre || undefined,
    });
    setEnvoi(false);
    if (error) { onErreur(messageErreur(error)); return; }
    if (erreurMetier(data)) { onErreur(erreurMetier(data)); return; }
    onOk((data as { jeton: string }).jeton);
  };

  return (
    <form onSubmit={envoyer} className="space-y-4">
      <Titre>Vos dispos pour les montages et démontages</Titre>
      {semaine && <p className="text-su-second">{libelleSemaine(semaine.debut)}</p>}
      <Carte className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold">Prénom
            <input required autoComplete="given-name" value={prenom} maxLength={50} onChange={(e) => setPrenom(e.target.value)} className={champ} />
          </label>
          <label className="text-sm font-semibold">Nom
            <input required autoComplete="family-name" value={nom} maxLength={50} onChange={(e) => setNom(e.target.value)} className={champ} />
          </label>
        </div>
        <label className="block text-sm font-semibold">Téléphone portable
          <input
            required type="tel" inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78"
            value={tel} onChange={(e) => setTel(e.target.value)} className={champ}
            aria-invalid={tel.length > 0 && !telOk}
          />
          {tel.length >= 10 && !telOk && <span className="mt-1 block text-xs font-normal text-su-orange">Portable 06 ou 07, 10 chiffres.</span>}
        </label>
        <ChampsQualifs permis={permis} setPermis={setPermis} caces={caces} setCaces={setCaces} autre={autre} setAutre={setAutre} />
      </Carte>
      <BoutonPrincipal type="submit" disabled={envoi}>{envoi && <Loader2 className="h-4 w-4 animate-spin" />}Continuer</BoutonPrincipal>
    </form>
  );
}

function MesDispos({ moi, jeton, onEnvoye, onErreur, onQualifs, onPasMoi }: {
  moi: Moi; jeton: string; onEnvoye: (m: Moi) => void; onErreur: (m: string | null) => void;
  onQualifs: () => void; onPasMoi: () => void;
}) {
  const dates = useMemo(() => joursSemaine(moi.semaine.debut), [moi.semaine.debut]);
  const depuis = (src: JourDispo[]) =>
    dates.map((d) => src.find((x) => x.jour === d) ?? { jour: d, journee: false, soiree: false, pas_dispo: false });
  const [jours, setJours] = useState<JourDispo[]>(() => depuis(moi.jours));
  const [note, setNote] = useState(moi.note ?? "");
  const [envoi, setEnvoi] = useState(false);
  const resume = resumeDispos(jours);

  const envoyer = async () => {
    setEnvoi(true);
    const { data, error } = await supabase.rpc("dispos_public_enregistrer", { _jeton: jeton, _jours: jours, _note: note });
    setEnvoi(false);
    if (error) { onErreur(messageErreur(error)); return; }
    if (erreurMetier(data)) { onErreur(erreurMetier(data)); return; }
    onEnvoye(data as unknown as Moi);
  };
  const btn = (on: boolean, noir = false) =>
    `min-h-[48px] flex-1 rounded-lg border text-sm font-semibold ${on ? (noir ? "border-su-texte bg-su-texte text-su-carte" : "border-su-bleu bg-su-bleu text-su-carte") : "border-su-filet bg-su-carte text-su-texte"}`;

  return (
    <div className="space-y-4">
      <div>
        <Titre>Bonjour {moi.prenom}</Titre>
        <button type="button" onClick={onPasMoi} className="mt-1 text-sm text-su-second underline">Ce n'est pas moi</button>
      </div>
      <p className="font-semibold">{libelleSemaine(moi.semaine.debut)}</p>
      <p className="text-sm font-semibold text-su-bleu">À remplir avant {libelleLimite(moi.semaine.heure_limite)}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button" className="min-h-[48px] rounded-lg border border-su-filet bg-su-carte px-3 text-sm font-medium"
          onClick={() => setJours(dates.map((d, i) => ({ jour: d, journee: i < 5, soiree: false, pas_dispo: false })))}
        >Lundi → vendredi, en journée</button>
        <button
          type="button" disabled={moi.precedente.length === 0}
          className="min-h-[48px] rounded-lg border border-su-filet bg-su-carte px-3 text-sm font-medium disabled:opacity-50"
          onClick={() => setJours(depuis(moi.precedente))}
        >Comme la semaine dernière</button>
      </div>
      {jours.map((j, i) => (
        <Carte key={j.jour} className="space-y-3 p-3">
          <div className="flex items-center justify-between">
            <span className="font-sora font-semibold">{libelleJour(j.jour)}</span>
            <span className="text-sm text-su-second">{libelleEtat(j)}</span>
          </div>
          <div className="flex gap-2">
            {(["journee", "soiree"] as const).map((c) => (
              <button key={c} type="button" aria-pressed={j[c]} className={btn(j[c])}
                onClick={() => setJours((js) => js.map((x, k) => (k === i ? basculer(x, c) : x)))}
              >{c === "journee" ? "Journée" : "Soirée"}</button>
            ))}
            <button type="button" aria-pressed={j.pas_dispo} className={btn(j.pas_dispo, true)}
              onClick={() => setJours((js) => js.map((x, k) => (k === i ? basculer(x, "pas_dispo") : x)))}
            >Pas dispo</button>
          </div>
        </Carte>
      ))}
      <Carte>
        <label className="block text-sm font-semibold">Un mot pour les équipes (facultatif)
          <textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)}
            className="mt-2 block w-full rounded-lg border border-su-filet bg-su-carte p-3 text-base font-normal text-su-texte" />
        </label>
      </Carte>
      <button type="button" onClick={onQualifs} className="text-sm text-su-bleu underline">Mes permis et CACES</button>
      <div className="fixed inset-x-0 bottom-0 border-t border-su-filet bg-su-carte px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-[560px] space-y-2">
          <p className="text-center text-sm text-su-second">{phraseResume(resume)}</p>
          <BoutonPrincipal onClick={envoyer} disabled={envoi}>{envoi && <Loader2 className="h-4 w-4 animate-spin" />}Envoyer mes dispos</BoutonPrincipal>
        </div>
      </div>
    </div>
  );
}

function Envoye({ moi, onModifier, onQualifs }: { moi: Moi; onModifier: () => void; onQualifs: () => void }) {
  const dates = joursSemaine(moi.semaine.debut);
  const close = moi.semaine.close;
  return (
    <div className="space-y-4">
      <Titre>{moi.envoye_le ? `Merci ${moi.prenom}` : `Bonjour ${moi.prenom}`}</Titre>
      <p className="font-semibold">{libelleSemaine(moi.semaine.debut)}</p>
      <Carte>
        <div className="grid grid-cols-7 gap-1 text-center">
          {dates.map((d, i) => (
            <div key={d}>
              <div className="text-xs text-su-second">{JOURS_COURT[i]}</div>
              <div className="mt-1 font-sora font-semibold tabular-nums">{recapCourt(moi.jours.find((x) => x.jour === d))}</div>
            </div>
          ))}
        </div>
      </Carte>
      {close ? (
        <p className="rounded-lg border border-su-filet bg-su-carte p-4 font-semibold">Les dispos sont closes, contactez l'équipe logistique.</p>
      ) : (
        <>
          <p className="text-su-second">L'équipe logistique vous confirme vos missions par la lettre de mission.</p>
          <p className="text-su-second">Un changement ? Rouvrez le même lien jusqu'à {libelleLimite(moi.semaine.heure_limite)}.</p>
          <BoutonPrincipal onClick={onModifier}>Modifier mes dispos</BoutonPrincipal>
        </>
      )}
      <button type="button" onClick={onQualifs} className="text-sm text-su-bleu underline">Mes permis et CACES</button>
    </div>
  );
}

function Qualifs({ moi, jeton, onRetour, onErreur }: {
  moi: Moi; jeton: string; onRetour: (m?: Moi) => void; onErreur: (m: string | null) => void;
}) {
  const [permis, setPermis] = useState(moi.permis);
  const [caces, setCaces] = useState(moi.caces);
  const [autre, setAutre] = useState(moi.caces_autre ?? "");
  const [envoi, setEnvoi] = useState(false);
  const enregistrer = async () => {
    setEnvoi(true);
    const { data, error } = await supabase.rpc("dispos_public_maj_qualifs", {
      _jeton: jeton, _permis: permis, _caces: caces, _caces_autre: autre || undefined,
    });
    setEnvoi(false);
    if (error) { onErreur(messageErreur(error)); return; }
    if (erreurMetier(data)) { onErreur(erreurMetier(data)); return; }
    onRetour(data as unknown as Moi);
  };
  return (
    <div className="space-y-4">
      <Titre>Mes permis et CACES</Titre>
      <Carte className="space-y-4">
        <ChampsQualifs permis={permis} setPermis={setPermis} caces={caces} setCaces={setCaces} autre={autre} setAutre={setAutre} />
      </Carte>
      <BoutonPrincipal onClick={enregistrer} disabled={envoi}>{envoi && <Loader2 className="h-4 w-4 animate-spin" />}Enregistrer</BoutonPrincipal>
      <button type="button" onClick={() => onRetour()} className="min-h-[48px] w-full text-sm text-su-second underline">Retour</button>
    </div>
  );
}
