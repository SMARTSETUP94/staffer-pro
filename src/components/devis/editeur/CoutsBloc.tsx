import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { coutDec, texteCoutsManquants, venteDec, type CoutManquant, type Decomposition } from "@/lib/devis/calcul";
import { ancrePoste } from "@/lib/devis/editeur-lisibilite";

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/** Décomposition coût / vente + marge (réservée au droit devis.couts). `net` = net HT après remise pour le devis. */
const fr = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

/** Chaque coût manquant pointe vers l'endroit où le compléter : la ligne du poste dans la grille des taux, ou la ligne du devis. */
export function CoutsBloc({ dec, net, manquants, compact, lienLibre }: { dec: Decomposition; net?: number; manquants?: CoutManquant[]; compact?: boolean;
  /** Lien vers une ligne libre sans coût (sélection dans l'éditeur). */ lienLibre?: (designation: string) => ReactNode }) {
  const vente = net ?? venteDec(dec);
  const cout = coutDec(dec);
  const marge = Math.round((vente - cout) * 100) / 100;
  const pct = vente !== 0 ? Math.round((marge / vente) * 1000) / 10 : null;
  const alerte = texteCoutsManquants(manquants ?? []);
  const rows: [string, { cout: number; vente: number }][] = [
    ["Main d'œuvre", dec.main_oeuvre], ["Matériaux", dec.materiaux], ["Achats, sous-traitance, location, forfaits", dec.autres],
  ];
  return (
    <div className={`space-y-1 ${compact ? "text-xs" : "text-sm"}`}>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-xs text-muted-foreground"><span /><span className="text-right">Coût</span><span className="text-right">Vente</span></div>
      {rows.map(([lbl, v]) => (
        <div key={lbl} className="grid grid-cols-[1fr_auto_auto] gap-x-3">
          <span className="truncate" title={lbl}>{lbl}</span>
          <span className="text-right tabular-nums">{eur(v.cout)}</span>
          <span className="text-right tabular-nums">{eur(v.vente)}</span>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_auto] gap-x-3 border-t pt-1 font-semibold">
        <span>Marge{alerte ? " incomplète" : ""}{net != null ? " sur net HT" : ""}</span>
        <span className={`text-right tabular-nums ${marge < 0 ? "text-destructive" : ""}`}>{eur(marge)}{pct != null ? ` · ${pct.toLocaleString("fr-FR")} %` : ""}</span>
      </div>
      {alerte && (
        <p className="flex items-start gap-1 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
          <span>Marge incomplète : coûts manquants sur{" "}
            {(manquants ?? []).map((m, i) => (
              <Fragment key={`${m.type}-${m.libelle}`}>
                {i > 0 && ", "}
                {m.type === "heures"
                  ? <Link to="/parametres/devis-taux" hash={ancrePoste(m.libelle)} className="font-medium underline" title={`Saisir le coût de revient du poste ${m.libelle}`}>{m.libelle.toLowerCase()} ({fr(m.heures ?? 0)} h)</Link>
                  : lienLibre ? lienLibre(m.libelle) : <span>{m.libelle.toLowerCase()}</span>}
              </Fragment>
            ))}
          </span>
        </p>
      )}
    </div>
  );
}
