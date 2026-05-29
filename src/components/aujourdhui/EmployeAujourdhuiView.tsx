/**
 * v0.52 — Vue employé de la page d'accueil `/aujourdhui`.
 *
 * Rendu lorsque l'utilisateur n'a PAS la cap `dashboard.team.view` (i.e.
 * tous les rôles « terrain » : poseur, peintre, métallier, etc.).
 *
 * 3 blocs :
 *   1) Mon planning de la semaine (clic chantier → Sheet « Mon équipe »)
 *   2) Mes heures (compteur + saisir + historique)
 *   3) Mon atelier (objets fab, masqué si vide)
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  startOfWeek,
  addDays,
  parseISO,
  isToday,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  Clock,
  Calendar,
  Users,
  Wrench,
  MapPin,
  ChevronRight,
  History,
  Phone,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMesHeures } from "@/hooks/use-mes-heures";
import {
  getMonPlanningSemaine,
  getMonEquipeChantier,
  getMesObjetsAtelier,
  type PlanningSemaineItem,
} from "@/server/aujourdhui-employe.functions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEMI_LABEL: Record<string, string> = {
  AM: "Matin",
  PM: "Après-midi",
  JOURNEE: "Journée",
};

function groupByDate(items: PlanningSemaineItem[]) {
  const map = new Map<string, PlanningSemaineItem[]>();
  for (const it of items) {
    const arr = map.get(it.date) ?? [];
    arr.push(it);
    map.set(it.date, arr);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Bloc 1 — Mon planning de la semaine
// ---------------------------------------------------------------------------

interface ChantierSelection {
  affaireId: string;
  date: string;
  numero: string;
  nom: string;
}

function MonPlanningSemaineCard({
  onChantierClick,
}: {
  onChantierClick: (sel: ChantierSelection) => void;
}) {
  const fetchPlanning = useServerFn(getMonPlanningSemaine);
  const { data, isLoading } = useQuery({
    queryKey: ["aujourdhui", "planning-semaine"],
    queryFn: () => fetchPlanning(),
    staleTime: 60_000,
  });

  const weekStart = useMemo(
    () => startOfWeek(new Date(), { weekStartsOn: 1 }),
    [],
  );
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const grouped = useMemo(() => groupByDate(data?.items ?? []), [data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Mon planning de la semaine</CardTitle>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/mes-missions">
            Tout voir <ChevronRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (data?.items.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune affectation cette semaine.
          </p>
        ) : (
          days.map((day) => {
            const iso = format(day, "yyyy-MM-dd");
            const rows = grouped.get(iso) ?? [];
            const today = isToday(day);
            return (
              <div
                key={iso}
                className={`rounded-md border ${today ? "border-primary/40 bg-primary/5" : "border-border"} px-3 py-2`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`text-xs font-medium uppercase ${today ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {format(day, "EEE d MMM", { locale: fr })}
                    {today && " · aujourd'hui"}
                  </span>
                </div>
                {rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Repos</p>
                ) : (
                  <div className="space-y-1">
                    {rows.map((r) => (
                      <button
                        key={r.assignation_id}
                        type="button"
                        onClick={() =>
                          onChantierClick({
                            affaireId: r.affaire_id,
                            date: r.date,
                            numero: r.affaire_numero,
                            nom: r.affaire_nom,
                          })
                        }
                        className="flex w-full items-center gap-2 rounded-md border border-transparent bg-background px-2 py-1.5 text-left text-sm hover:border-border hover:bg-muted/50"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: r.metier_couleur ?? "hsl(var(--muted-foreground))",
                          }}
                        />
                        <Badge variant="outline" className="text-[10px]">
                          {DEMI_LABEL[r.demi_journee] ?? r.demi_journee}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{r.affaire_numero}</span>{" "}
                          <span className="text-muted-foreground">— {r.affaire_nom}</span>
                        </span>
                        <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sheet — Mon équipe sur ce chantier
// ---------------------------------------------------------------------------

function MonEquipeSheet({
  selection,
  onClose,
}: {
  selection: ChantierSelection | null;
  onClose: () => void;
}) {
  const fetchEquipe = useServerFn(getMonEquipeChantier);
  const { data, isLoading } = useQuery({
    queryKey: ["aujourdhui", "equipe", selection?.affaireId, selection?.date],
    queryFn: () =>
      fetchEquipe({
        data: { affaireId: selection!.affaireId, date: selection!.date },
      }),
    enabled: !!selection,
    staleTime: 30_000,
  });

  const open = !!selection;
  const dateLabel = selection
    ? format(parseISO(selection.date), "EEEE d MMMM", { locale: fr })
    : "";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Mon équipe</SheetTitle>
          <SheetDescription>
            {selection && (
              <>
                <span className="font-medium">{selection.numero}</span> —{" "}
                {selection.nom}
                <br />
                {dateLabel}
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        {data?.affaire && (
          <div className="mt-4 rounded-md border bg-muted/30 p-3 text-sm">
            {data.affaire.client && <p className="font-medium">{data.affaire.client}</p>}
            {data.affaire.lieu && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {data.affaire.lieu}
              </p>
            )}
          </div>
        )}

        <div className="mt-4 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (data?.membres.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aucun coéquipier listé pour ce jour.
            </p>
          ) : (
            data!.membres.map((m, idx) => (
              <div
                key={`${m.employe_id}-${m.demi_journee}-${idx}`}
                className={`flex items-center gap-3 rounded-md border p-2.5 ${m.est_moi ? "border-primary/40 bg-primary/5" : ""}`}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{
                    backgroundColor:
                      m.metier_couleur ?? "hsl(var(--muted-foreground))",
                  }}
                >
                  {(m.prenom?.[0] ?? "?") + (m.nom?.[0] ?? "")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.prenom} {m.nom}
                    {m.est_moi && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        Moi
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.metier_libelle ?? "—"} · {DEMI_LABEL[m.demi_journee] ?? m.demi_journee}
                  </p>
                </div>
                {m.telephone && !m.est_moi && (
                  <Button asChild variant="ghost" size="sm">
                    <a href={`tel:${m.telephone}`}>
                      <Phone className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        {selection && (
          <div className="mt-4">
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/affaires/$affaireId" params={{ affaireId: selection.affaireId }}>
                Voir la fiche chantier
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Bloc 2 — Mes heures
// ---------------------------------------------------------------------------

function MesHeuresCard() {
  const weekStart = useMemo(
    () => startOfWeek(new Date(), { weekStartsOn: 1 }),
    [],
  );
  const { totalHeuresPrevues, totalHeuresSaisies, loading } = useMesHeures({
    weekStart,
  });

  const pct =
    totalHeuresPrevues > 0
      ? Math.min(100, Math.round((totalHeuresSaisies / totalHeuresPrevues) * 100))
      : 0;
  const circumference = 2 * Math.PI * 28;
  const dash = (pct / 100) * circumference;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Mes heures</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="6"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-sm font-bold tabular-nums">
                {loading ? "…" : `${totalHeuresSaisies.toFixed(0)}h`}
              </span>
              <span className="text-[9px] text-muted-foreground tabular-nums">
                /{totalHeuresPrevues.toFixed(0)}h
              </span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Chargement…"
                : `Cette semaine : ${pct}% saisi`}
            </p>
            <Button asChild size="sm" className="w-full">
              <Link to="/mes-heures">Saisir mes heures</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link to="/mes-heures">
                <History className="mr-1 h-3 w-3" /> Voir l'historique
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Bloc 3 — Mon atelier
// ---------------------------------------------------------------------------

function MesObjetsAtelierCard() {
  const fetchObjets = useServerFn(getMesObjetsAtelier);
  const { data, isLoading } = useQuery({
    queryKey: ["aujourdhui", "objets-atelier"],
    queryFn: () => fetchObjets(),
    staleTime: 60_000,
  });

  // Masquer le bloc si on n'a aucun objet (cas poseurs / logistique)
  if (!isLoading && (data?.items.length ?? 0) === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Mon atelier</CardTitle>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {data?.items.length ?? 0} objet{(data?.items.length ?? 0) > 1 ? "s" : ""}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          (data?.items ?? []).map((o) => (
            <Link
              key={o.objet_id}
              to="/affaires/$affaireId/objets/$objetId"
              params={{ affaireId: o.affaire_id, objetId: o.objet_id }}
              className="flex items-center gap-2 rounded-md border px-2 py-2 text-sm hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {o.reference} — {o.nom}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {o.affaire_numero} · {o.affaire_nom}
                </p>
              </div>
              {o.statut_chef && (
                <Badge variant="outline" className="text-[10px]">
                  {o.statut_chef}
                </Badge>
              )}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Vue orchestratrice
// ---------------------------------------------------------------------------

export function EmployeAujourdhuiView() {
  const [selection, setSelection] = useState<ChantierSelection | null>(null);

  const todayLabel = useMemo(
    () => format(new Date(), "EEEE d MMMM yyyy", { locale: fr }),
    [],
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        number="01"
        eyebrow="Mon espace"
        title="Aujourd'hui"
        description={todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Planning : large sur desktop */}
        <div className="lg:col-span-2">
          <MonPlanningSemaineCard onChantierClick={setSelection} />
        </div>

        {/* Colonne droite : heures + atelier */}
        <div className="space-y-4">
          <MesHeuresCard />
          <MesObjetsAtelierCard />
        </div>
      </div>

      <MonEquipeSheet selection={selection} onClose={() => setSelection(null)} />
    </div>
  );
}
