import { DevisPipelineProvider, DevisSigneChoixDialog } from "@/components/opportunites/DevisPipeline";
import { createFileRoute, Link, useNavigate, stripSearchParams, type SearchSchemaInput } from "@tanstack/react-router";
import { requireCapability } from "@/lib/capability-guard";
import { fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Loader2, Filter, Trophy, LayoutGrid, Table as TableIcon, X, List } from "lucide-react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { colonneRepliee, estBrouillonClaude, TRI_LABEL, type TriCartes } from "@/lib/pipeline-kanban";
import { useAuth } from "@/lib/auth-context";
import { useCapability, useCapabilityScope } from "@/hooks/use-capability";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { useChargesAffaires } from "@/hooks/use-charges-affaires";
import {
  KANBAN_STATUT_ORDER,
  STATUT_LABEL,
  STATUT_ORDER,
  TAILLE_LABEL,
  TAILLE_ORDER,
  type OpportuniteStatut,
  type OpportuniteTaille,
} from "@/lib/opportunites";
import { KanbanColonne, SupplementsColonne } from "@/components/opportunites/KanbanColonne";
import { PipelineFiltresSheet } from "@/components/opportunites/PipelineFiltresSheet";
import { FILTRES_VIDES, lireFiltres, nbFiltresAvances, passeFiltres, PERIODE_LABEL, STATUT_DEVIS_FILTRE_LABEL, type FiltresAvances } from "@/lib/pipeline-filtres";
import { IndicateursCtx, PipelineIndicateursBandeau, usePipelineIndicateurs } from "@/components/opportunites/PipelineIndicateursBandeau";
import {
  OpportuniteCard,
  type OpportuniteCardData,
} from "@/components/opportunites/OpportuniteCard";
import { NouvelleOpportuniteDialog } from "@/components/opportunites/NouvelleOpportuniteDialog";
import { SignerOpportuniteDialog } from "@/components/opportunites/SignerOpportuniteDialog";
import {
  type AffaireTypologie,
  AFFAIRE_TYPOLOGIES,
  AFFAIRE_TYPOLOGIE_LABELS,
  getAffaireTypologie,
} from "@/lib/affaire-typologie";
import { OpportunitesTableurView } from "@/components/opportunites/OpportunitesTableurView";
import {
  dateRangeForPreset,
  type DatePreset,
  type TableurFilters,
  type TableurRow,
} from "@/lib/opportunites-tableur-helpers";
import { sortAFaire } from "@/lib/opportunite-a-faire";
import {
  matchSansDessinateur,
  matchSansResponsableProjet,
} from "@/lib/opportunite-filtres-roles";
import {
  checkCanDeleteOpportunite,
  deleteBlockedMessage,
} from "@/lib/opportunite-delete";
import { useDeleteOpportunite } from "@/hooks/use-delete-opportunite";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const VUE_VALUES = ["kanban", "tableur"] as const;
type VueOpportunites = (typeof VUE_VALUES)[number];

type StoredPreset = "all" | "7d" | "30d" | "current_month";

const OPPS_SEARCH_DEFAULTS = {
  typo: [] as AffaireTypologie[],
  vue: "kanban" as VueOpportunites,
  q: "",
  preset: "all" as StoredPreset,
  archived: false,
  actionsDues: false,
  noCa: false,
  noD: false,
  noRp: false,
  claude: false,
};

const oppsSearchSchema = z.object({
  typo: fallback(
    z.array(z.enum(AFFAIRE_TYPOLOGIES as [AffaireTypologie, ...AffaireTypologie[]])),
    [],
  ).default([]),
  vue: fallback(z.enum(VUE_VALUES), "kanban").default("kanban"),
  q: fallback(z.string(), "").default(""),
  preset: fallback(
    z.enum(["all", "7d", "30d", "current_month"] as const),
    "all",
  ).default("all"),
  archived: fallback(z.boolean(), false).default(false),
  actionsDues: fallback(z.boolean(), false).default(false),
  noCa: fallback(z.boolean(), false).default(false),
  noD: fallback(z.boolean(), false).default(false),
  noRp: fallback(z.boolean(), false).default(false),
  claude: fallback(z.boolean(), false).default(false),
});

type OppsSearch = z.infer<typeof oppsSearchSchema>;

export const Route = createFileRoute("/_app/opportunites/")({
  beforeLoad: () => requireCapability("section.pipeline_opportunites"),
  head: () => ({
    meta: [
      { title: "Opportunités — Pipeline commercial" },
      {
        name: "description",
        content:
          "Pipeline Kanban + vue tableur des opportunités commerciales (9XXX) — saisie inline ligne par ligne.",
      },
      { property: "og:title", content: "Opportunités — SETUP Paris" },
      { property: "og:description", content: "Suivi des opportunités commerciales, des clients et des projets SETUP Paris." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput): OppsSearch => oppsSearchSchema.parse(search),
  search: { middlewares: [stripSearchParams(OPPS_SEARCH_DEFAULTS)] },
  component: OpportunitesPage,
});

interface OppRowFull extends OpportuniteCardData {
  date_pat: string | null;
  date_visite_technique: string | null;
  date_montage: string | null;
  date_demontage: string | null;
  typologie_future: AffaireTypologie | null;
  next_action_due_le: string | null;
  last_jalon_etape: string | null;
  actions_count: number | null;
}

function OpportunitesPage() {
  const { user } = useAuth();
  // L3b1-B : caps déduites de la matrice (voir mem://features/lot-l3-refonte-permissions).
  // - canManageOpps : créer/éditer/supprimer/draguer une opp. AMBIGU — mapping
  //   pragmatique sur action.sign_opportunite (cap accordée à admin+chef_chantier),
  //   à reconsidérer si une cap "opportunite.manage" dédiée émerge.
  // - canForceCode5xxx : admin override pour signer même quand non-owner.
  // - oppScope : ne pré-sélectionne plus le chargé d'affaires (défaut = Tous),
  //   il active seulement le filtre « Sans CA ».
  const canManageOpps = useCapability("action.sign_opportunite");
  const canForceCode5xxx = useCapability("section.admin");
  const oppScope = useCapabilityScope("section.pipeline_opportunites");
  const navigate = useNavigate({ from: "/opportunites" });
  const search = Route.useSearch();
  const { typo: typoFilter, vue, q: searchQuery, preset, archived: showArchived, actionsDues, noCa, noD, noRp, claude } = search;

  const setTypoFilter = (next: AffaireTypologie[]) => {
    navigate({ search: (prev: OppsSearch) => ({ ...prev, typo: next }), replace: true });
  };
  const setVue = (next: VueOpportunites) => {
    navigate({ search: (prev: OppsSearch) => ({ ...prev, vue: next }), replace: true });
  };
  const setSearchQuery = (next: string) => {
    navigate({ search: (prev: OppsSearch) => ({ ...prev, q: next }), replace: true });
  };
  const setPreset = (next: StoredPreset) => {
    navigate({
      search: (prev: OppsSearch) => ({ ...prev, preset: next }),
      replace: true,
    });
  };
  const setShowArchived = (next: boolean) => {
    navigate({
      search: (prev: OppsSearch) => ({ ...prev, archived: next }),
      replace: true,
    });
  };
  const setActionsDues = (next: boolean) => {
    navigate({
      search: (prev: OppsSearch) => ({ ...prev, actionsDues: next }),
      replace: true,
    });
  };
  const setNoCa = (next: boolean) => {
    navigate({
      search: (prev: OppsSearch) => ({ ...prev, noCa: next }),
      replace: true,
    });
  };
  const setNoD = (next: boolean) => {
    navigate({
      search: (prev: OppsSearch) => ({ ...prev, noD: next }),
      replace: true,
    });
  };
  const setClaude = (next: boolean) => {
    navigate({ search: (prev: OppsSearch) => ({ ...prev, claude: next }), replace: true });
  };
  const setNoRp = (next: boolean) => {
    navigate({
      search: (prev: OppsSearch) => ({ ...prev, noRp: next }),
      replace: true,
    });
  };

  const { data: charges, loading: chargesLoading } = useChargesAffaires();
  const [opps, setOpps] = useState<OppRowFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [signTarget, setSignTarget] = useState<OpportuniteCardData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OpportuniteCardData | null>(null);
  const { remove: removeOpportunite, pending: deletePending } = useDeleteOpportunite();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [claudeIds, setClaudeIds] = useState<Set<string>>(new Set());
  const [devisStatut, setDevisStatut] = useState<Map<string, string | null>>(new Map());
  const [filtres, setFiltresState] = useState<FiltresAvances>(FILTRES_VIDES);
  const [filtresOpen, setFiltresOpen] = useState(false);

  // Tri, colonnes repliées et filtres : mémorisés par utilisateur (navigateur).
  const prefKey = `opps-kanban-prefs:${user?.id ?? "anon"}`;
  const [tri, setTri] = useState<TriCartes>("urgence");
  const [replis, setReplis] = useState<Record<string, boolean>>({});
  const [filterCa, setFilterCaState] = useState<string>("__all__");
  const prefsRef = useRef<Record<string, unknown>>({});
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(prefKey) ?? "{}");
      prefsRef.current = p;
      setTri(p.tri in TRI_LABEL ? p.tri : "urgence");
      setReplis(p.replis && typeof p.replis === "object" ? p.replis : {});
      setFiltresState(lireFiltres(p.filtres));
      setFilterCaState(typeof p.ca === "string" ? p.ca : "__all__");
      // Interrupteurs + recherche : restaurés seulement si l'adresse n'en impose pas.
      const t = p.inter;
      if (t && typeof t === "object" && !search.q && !search.actionsDues && !search.noCa && !search.noD && !search.noRp && !search.claude) {
        navigate({ search: (prev: OppsSearch) => ({ ...prev, q: typeof t.q === "string" ? t.q : "", actionsDues: !!t.actionsDues, noCa: !!t.noCa, noD: !!t.noD, noRp: !!t.noRp, claude: !!t.claude }), replace: true });
      }
    } catch { /* préférences illisibles : valeurs par défaut */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefKey]);
  const savePrefs = (next: Record<string, unknown>) => {
    prefsRef.current = { tri, replis, filtres, ca: filterCa, ...prefsRef.current, ...next };
    try { localStorage.setItem(prefKey, JSON.stringify(prefsRef.current)); } catch { /* stockage indisponible */ }
  };
  const setFiltres = (f: FiltresAvances) => { setFiltresState(f); savePrefs({ filtres: f }); };
  const setFilterCa = (v: string) => { setFilterCaState(v); savePrefs({ ca: v }); };
  useEffect(() => {
    savePrefs({ inter: { q: searchQuery, actionsDues, noCa, noD, noRp, claude } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, actionsDues, noCa, noD, noRp, claude]);

  // Filtres tableur additionnels (statut/taille/deviseur multi-select)
  const [statutsFilter, setStatutsFilter] = useState<OpportuniteStatut[]>([]);
  const [taillesFilter, setTaillesFilter] = useState<OpportuniteTaille[]>([]);

  // Filtre CA — le pipeline s'ouvre toujours sur « Tous les chargés
  // d'affaires » (demande GabIn, 23 oct. 2026). Le périmètre réellement
  // visible reste décidé par les politiques de la base ; le scope de la
  // capability ne pilote plus qu'un filtre supplémentaire (« Sans CA »).

  const chargesById = useMemo(() => {
    const m = new Map();
    charges.forEach((c) => m.set(c.id, c));
    return m;
  }, [charges]);

  // Charge les opportunités (phase='opportunite')
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc("list_opportunites_active")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error("Chargement impossible", { description: error.message });
          setLoading(false);
          return;
        }
        const rows = (data ?? []).map((r: Record<string, unknown>) => ({
          ...(r as object),
          statut_opportunite: r.statut_opportunite ?? "a_faire",
          nom: r.nom ?? r.client ?? "",
        })) as OppRowFull[];
        setOpps(rows);
        setLoading(false);
        // Lot 1 — date d'entrée dans le statut + rôles projet saisis (badges non bloquants).
        const ids = rows.map((r) => r.id);
        if (ids.length === 0) return;
        void Promise.all([
          supabase.from("affaires").select("id,statut_opportunite_depuis,created_at,date_evenement_debut").in("id", ids),
          supabase.from("affaire_roles").select("affaire_id,role").in("affaire_id", ids),
          supabase.from("devis").select("affaire_id,version,cree_par_mcp,statut_redaction,modifie_par_humain_le").in("affaire_id", ids).is("supprime_le", null).eq("est_modele", false),
        ]).then(([aff, roles, dv]) => {
          if (cancelled) return;
          const depuis = new Map((aff.data ?? []).map((a) => [a.id, a.statut_opportunite_depuis]));
          const created = new Map((aff.data ?? []).map((a) => [a.id, a.created_at]));
          const evt = new Map((aff.data ?? []).map((a) => [a.id, a.date_evenement_debut]));
          // Dernier devis (version la plus haute) par affaire → « Brouillon Claude à relire ».
          const dernier = new Map<string, NonNullable<typeof dv.data>[number]>();
          (dv.data ?? []).forEach((d) => { if (d.affaire_id && (dernier.get(d.affaire_id)?.version ?? -1) < d.version) dernier.set(d.affaire_id, d); });
          setClaudeIds(new Set([...dernier.entries()].filter(([, d]) => estBrouillonClaude(d)).map(([id]) => id)));
          setDevisStatut(new Map([...dernier.entries()].map(([id, d]) => [id, d.statut_redaction ?? null])));
          const rolesBy = new Map<string, string[]>();
          (roles.data ?? []).forEach((r) => rolesBy.set(r.affaire_id, [...(rolesBy.get(r.affaire_id) ?? []), r.role]));
          setOpps((cur) => cur.map((o) => ({ ...o, statut_opportunite_depuis: depuis.get(o.id) ?? null, created_at: created.get(o.id) ?? null, date_evenement_debut: evt.get(o.id) ?? null, roles_affectes: rolesBy.get(o.id) ?? [] })));
        });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  // Opportunités signées : affichées en lecture seule dans la vue tableur avec
  // leur numéro d'affaire, sans entrer dans le Kanban ni les indicateurs.
  const [signees, setSignees] = useState<
    { id: string; numero: string; code_opportunite: string | null; client: string | null; nom: string | null; charge_affaires_id: string | null; date_montage: string | null; date_demontage: string | null; signed_at: string | null }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("affaires")
      .select("id, numero, code_opportunite, client, nom, charge_affaires_id, date_montage, date_demontage, signed_at")
      .eq("phase", "signe")
      .not("code_opportunite", "is", null)
      .is("archived_at", null)
      .order("signed_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setSignees((data ?? []) as typeof signees);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  // v0.29.2 — Filtrage CA + typologie FUTURE (la typologie dérivée du numero
  // est inutile ici car toutes les opps sont 9XXX = prototype par construction).
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const sevenDaysAhead = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d;
  }, [today]);
  // Montants de toutes les opportunités (indépendants des filtres) pour les filtres montant / statut devis.
  const tousIndicateurs = usePipelineIndicateurs(useMemo(() => opps.map((o) => o.id), [opps]), { chargeAffairesId: null, q: "" });
  const infoDevis = useMemo(() => {
    const m = new Map<string, { statut_redaction: string | null; montant: number | null }>();
    (tousIndicateurs.data?.affaires ?? []).forEach((a) => m.set(a.affaire_id, {
      statut_redaction: a.devis_id ? (a.numero_progbat ? "transfere" : devisStatut.get(a.affaire_id) ?? "brouillon") : null,
      montant: a.net_ht != null ? Number(a.net_ht) : a.estime != null ? Number(a.estime) : null,
    }));
    return m;
  }, [tousIndicateurs.data, devisStatut]);
  const oppsFiltrees = useMemo(() => {
    return opps.filter((o) => {
      if (filterCa && filterCa !== "__all__" && o.charge_affaires_id !== filterCa)
        return false;
      if (noCa && o.charge_affaires_id !== null) return false;
      if (noD && !matchSansDessinateur(o)) return false;
      if (noRp && !matchSansResponsableProjet(o)) return false;
      if (claude && !claudeIds.has(o.id)) return false;
      if (actionsDues) {
        if (!o.next_action_due_le) return false;
        const due = new Date(o.next_action_due_le + "T00:00:00");
        if (due > sevenDaysAhead) return false;
      }
      if (normalizedQuery) {
        const haystack = `${o.numero ?? ""} ${o.client ?? ""} ${o.nom ?? ""}`.toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      if (!passeFiltres(o, infoDevis.get(o.id), filtres)) return false;
      return true;
    });
  }, [opps, filterCa, noCa, noD, noRp, claude, claudeIds, actionsDues, sevenDaysAhead, normalizedQuery, filtres, infoDevis]);

  // Filtres propres aux opportunités : aucun supplément 6XXX ne correspond.
  const filtreOppSeul = noCa || noD || noRp || actionsDues || claude || (nbFiltresAvances(filtres) - (filtres.supplements ? 1 : 0) - (filtres.client.trim() ? 1 : 0)) > 0;
  // Indicateurs (tuiles + montants) : respectent les filtres actifs ; « À relancer » filtre ensuite le Kanban.
  const indicateurs = usePipelineIndicateurs(useMemo(() => oppsFiltrees.map((o) => o.id), [oppsFiltrees]), {
    chargeAffairesId: filtreOppSeul ? "00000000-0000-0000-0000-000000000000" : filterCa !== "__all__" ? filterCa : null,
    q: filtres.client.trim() ? filtres.client.trim() : searchQuery,
  });
  const parAffaire = useMemo(() => new Map((indicateurs.data?.affaires ?? []).map((a) => [a.affaire_id, a])), [indicateurs.data]);
  const [relance, setRelance] = useState(false);
  const oppsKanban = useMemo(() => relance ? oppsFiltrees.filter((o) => parAffaire.get(o.id)?.a_relancer) : oppsFiltrees, [relance, oppsFiltrees, parAffaire]);

  // Pastilles supprimables des filtres actifs.
  const pastilles = useMemo(() => {
    const out: { cle: string; label: string; retirer: () => void }[] = [];
    const f = filtres;
    if (searchQuery.trim()) out.push({ cle: "q", label: `Recherche : ${searchQuery.trim()}`, retirer: () => setSearchQuery("") });
    if (filterCa !== "__all__") out.push({ cle: "ca", label: filterCa === user?.id ? "Moi" : (chargesById.get(filterCa)?.full_name || chargesById.get(filterCa)?.email || "Chargé d'affaires"), retirer: () => setFilterCa("__all__") });
    if (actionsDues) out.push({ cle: "ad", label: "Actions dues ≤ 7 j", retirer: () => setActionsDues(false) });
    if (noCa) out.push({ cle: "noCa", label: "Sans chargé d'affaires", retirer: () => setNoCa(false) });
    if (noD) out.push({ cle: "noD", label: "Sans dessinateur", retirer: () => setNoD(false) });
    if (noRp) out.push({ cle: "noRp", label: "Sans responsable projet", retirer: () => setNoRp(false) });
    if (claude) out.push({ cle: "claude", label: "Brouillon Claude", retirer: () => setClaude(false) });
    f.statutsDevis.forEach((s) => out.push({ cle: `sd-${s}`, label: `Devis : ${STATUT_DEVIS_FILTRE_LABEL[s]}`, retirer: () => setFiltres({ ...f, statutsDevis: f.statutsDevis.filter((x) => x !== s) }) }));
    f.typologies.forEach((t) => out.push({ cle: `ty-${t}`, label: AFFAIRE_TYPOLOGIE_LABELS[t as AffaireTypologie] ?? t, retirer: () => setFiltres({ ...f, typologies: f.typologies.filter((x) => x !== t) }) }));
    f.tailles.forEach((t) => out.push({ cle: `ta-${t}`, label: `Taille ${TAILLE_LABEL[t as OpportuniteTaille] ?? t}`, retirer: () => setFiltres({ ...f, tailles: f.tailles.filter((x) => x !== t) }) }));
    if (f.periode) out.push({ cle: "per", label: f.periode === "libre" ? `Du ${f.du || "…"} au ${f.au || "…"}` : PERIODE_LABEL[f.periode], retirer: () => setFiltres({ ...f, periode: "", du: "", au: "" }) });
    if (f.sansDateMontage) out.push({ cle: "sdm", label: "Sans date de montage", retirer: () => setFiltres({ ...f, sansDateMontage: false }) });
    if (f.enRetard) out.push({ cle: "ret", label: "En retard", retirer: () => setFiltres({ ...f, enRetard: false }) });
    if (f.montantMin != null) out.push({ cle: "min", label: `≥ ${f.montantMin.toLocaleString("fr-FR")} €`, retirer: () => setFiltres({ ...f, montantMin: null }) });
    if (f.montantMax != null) out.push({ cle: "max", label: `≤ ${f.montantMax.toLocaleString("fr-FR")} €`, retirer: () => setFiltres({ ...f, montantMax: null }) });
    if (f.supplements) out.push({ cle: "sup", label: "Suppléments 6XXX", retirer: () => setFiltres({ ...f, supplements: false }) });
    if (f.client.trim()) out.push({ cle: "cli", label: `Client : ${f.client.trim()}`, retirer: () => setFiltres({ ...f, client: "" }) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtres, searchQuery, filterCa, actionsDues, noCa, noD, noRp, claude, chargesById, user?.id]);
  const resetFiltres = () => {
    setFiltres(FILTRES_VIDES);
    setFilterCa("__all__");
    navigate({ search: (prev: OppsSearch) => ({ ...prev, q: "", actionsDues: false, noCa: false, noD: false, noRp: false, claude: false }), replace: true });
  };

  // Compteurs par statut (avant filtre statut) pour les pastilles.
  const statutCounts = useMemo(() => {
    const counts: Partial<Record<OpportuniteStatut, number>> = {};
    oppsFiltrees.forEach((o) => {
      counts[o.statut_opportunite] = (counts[o.statut_opportunite] ?? 0) + 1;
    });
    return counts;
  }, [oppsFiltrees]);
  const kanbanStatuts = useMemo(
    () =>
      statutsFilter.length === 0
        ? KANBAN_STATUT_ORDER
        : KANBAN_STATUT_ORDER.filter((s) => statutsFilter.includes(s)),
    [statutsFilter],
  );

  // Groupage par statut (Kanban) — exclut "Archivé" pour rester lisible
  const byStatut = useMemo(() => {
    const m = new Map<OpportuniteStatut, OpportuniteCardData[]>();
    KANBAN_STATUT_ORDER.forEach((s) => m.set(s, []));
    oppsKanban.forEach((o) => {
      if (o.statut_opportunite === "termine") return;
      m.get(o.statut_opportunite)?.push(o);
    });
    return m;
  }, [oppsKanban]);

  // Conversion en TableurRow pour la vue Tableur (filtre "Archivé" si masqué).
  // Filtre « À faire » actif → tri chronologique (plus ancienne en premier),
  // comme la colonne Kanban correspondante.
  const aFaireOnly =
    statutsFilter.length === 1 && statutsFilter[0] === "a_faire";
  const tableurRows: TableurRow[] = useMemo(
    () => {
      const rows = oppsFiltrees
        .filter((o) => showArchived || o.statut_opportunite !== "termine")
        .map((o) => ({
          id: o.id,
          affaireId: o.id,
          numero: o.numero,
          client: o.client ?? "",
          nom: o.nom ?? "",
          charge_affaires_id: o.charge_affaires_id,
          date_opportunite: o.date_opportunite,
          taille: o.taille,
          statut_opportunite: o.statut_opportunite,
          // Les lignes signées sont ajoutées séparément (voir plus bas).
          code_opportunite: null,
          signed_affaire_numero: null,
          signed_affaire_id: null,
          date_pat: o.date_pat,
          date_montage: o.date_montage,
          date_demontage: o.date_demontage,
          notes: o.notes,
          typologie_future: o.typologie_future,
          statut_opportunite_depuis: o.statut_opportunite_depuis ?? null,
          created_at: o.created_at ?? null,
        }));
      const sorted = aFaireOnly ? sortAFaire(rows) : rows;
      // Lignes signées (lecture seule) : mêmes filtres rapides (CA + recherche).
      const signeesRows: TableurRow[] = signees
        .filter((s) => {
          if (filterCa && filterCa !== "__all__" && s.charge_affaires_id !== filterCa) return false;
          if (normalizedQuery) {
            const haystack = `${s.numero ?? ""} ${s.code_opportunite ?? ""} ${s.client ?? ""} ${s.nom ?? ""}`.toLowerCase();
            if (!haystack.includes(normalizedQuery)) return false;
          }
          return true;
        })
        .map((s) => ({
          id: s.id,
          affaireId: s.id,
          numero: s.numero,
          client: s.client ?? "",
          nom: s.nom ?? "",
          charge_affaires_id: s.charge_affaires_id,
          date_opportunite: null,
          taille: null,
          statut_opportunite: null,
          code_opportunite: s.code_opportunite,
          signed_affaire_numero: s.numero,
          signed_affaire_id: s.id,
          date_pat: null,
          date_montage: s.date_montage,
          date_demontage: s.date_demontage,
          notes: null,
          typologie_future: null,
          statut_opportunite_depuis: null,
          created_at: s.signed_at,
        }));
      // Signées en tête : les plus récentes d'abord, visibles sans paginer.
      return [...signeesRows, ...sorted];
    },
    [oppsFiltrees, showArchived, aFaireOnly, signees, filterCa, normalizedQuery],
  );

  const archivedCount = useMemo(
    () => oppsFiltrees.filter((o) => o.statut_opportunite === "termine").length,
    [oppsFiltrees],
  );

  const tableurFilters: TableurFilters = useMemo(() => {
    const range = dateRangeForPreset(preset as DatePreset);
    return {
      statuts: statutsFilter,
      tailles: taillesFilter,
      deviseurs: [],
      dateFrom: range.from,
      dateTo: range.to,
      search: searchQuery,
    };
  }, [statutsFilter, taillesFilter, preset, searchQuery]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    let targetStatut: OpportuniteStatut | null = null;
    if (overId.startsWith("col::")) {
      targetStatut = overId.slice(5) as OpportuniteStatut;
    } else {
      const targetOpp = opps.find((o) => o.id === overId);
      if (targetOpp) targetStatut = targetOpp.statut_opportunite;
    }
    if (!targetStatut) return;

    const moved = opps.find((o) => o.id === String(active.id));
    if (!moved || moved.statut_opportunite === targetStatut) return;

    const previous = opps;
    setOpps((prev) =>
      prev.map((o) =>
        o.id === moved.id ? { ...o, statut_opportunite: targetStatut! } : o,
      ),
    );

    const { error } = await supabase
      .from("affaires")
      .update({ statut_opportunite: targetStatut })
      .eq("id", moved.id);
    if (error) {
      toast.error("Mise à jour impossible", { description: error.message });
      setOpps(previous);
      return;
    }
    toast.success(`${moved.numero} → ${targetStatut.replace("_", " ")}`);
    if (targetStatut === "gagne") setSigneChoix(moved.id);
  }

  const activeOpp = activeId ? opps.find((o) => o.id === activeId) ?? null : null;

  const [signeChoix, setSigneChoix] = useState<string | null>(null);

  function handleSign(opp: OpportuniteCardData) {
    setSignTarget(opp);
  }

  function handleDeleteRequest(opp: OpportuniteCardData) {
    const check = checkCanDeleteOpportunite({
      statut_opportunite: opp.statut_opportunite,
      phase: "opportunite",
    });
    if (!check.ok) {
      const msg = deleteBlockedMessage(check.reason);
      toast.error(msg.title, { description: msg.description });
      return;
    }
    setDeleteTarget(opp);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const result = await removeOpportunite(deleteTarget.id);
    if (result.ok) {
      toast.success(`Opportunité ${deleteTarget.numero} supprimée`);
      setRefreshTick((t) => t + 1);
      setDeleteTarget(null);
    } else {
      toast.error("Suppression impossible", { description: result.error });
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <DevisSigneChoixDialog affaireId={signeChoix} open={!!signeChoix} onOpenChange={(o) => !o && setSigneChoix(null)} />
      <PageHeader
        number="03"
        eyebrow="Chantiers / Pipeline commercial"
        title="Opportunités"
        description={`${opps.length} opportunité${opps.length > 1 ? "s" : ""} 9XXX en pipeline. ${vue === "kanban" ? "Glissez les cartes entre colonnes pour changer leur statut." : "Saisie ligne par ligne (auto-save)."}`}
        actions={
          <div className="flex items-center gap-3">
          <Link to="/affaires" className="whitespace-nowrap text-xs font-semibold text-muted-foreground hover:text-primary hover:underline">Affaires signées (5XXX) →</Link>
          {canManageOpps && vue === "kanban" && (
            <Button
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-2 h-4 w-4" /> Nouvelle opportunité
            </Button>
          )}
          </div>
        }
      />

      {/* Une seule ligne : bouton Filtres + choix de vue */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" className="h-9 gap-2 rounded-xl" onClick={() => setFiltresOpen(true)} aria-label="Filtres">
          <Filter className="h-4 w-4" /> Filtres
          {pastilles.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">{pastilles.length}</span>}
        </Button>
        <ToggleGroup type="single" value={vue} onValueChange={(v) => v && setVue(v as VueOpportunites)} className="rounded-xl border border-border bg-card p-0.5">
          <ToggleGroupItem value="kanban" aria-label="Vue Kanban" title="Kanban" className="h-8 w-9 px-0"><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
          <ToggleGroupItem value="tableur" aria-label="Vue Tableur" title="Tableur" className="h-8 w-9 px-0"><TableIcon className="h-4 w-4" /></ToggleGroupItem>
          <Link to="/liste-chantiers" aria-label="Liste des chantiers" title="Liste des chantiers" className="inline-flex h-8 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><List className="h-4 w-4" /></Link>
        </ToggleGroup>
      </div>

      {pastilles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pastilles.map((p) => (
            <button key={p.cle} type="button" onClick={p.retirer} aria-label={`Retirer le filtre ${p.label}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted">
              {p.label} <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {vue === "tableur" && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as StoredPreset)}>
            <SelectTrigger className="h-9 w-[180px] rounded-xl"><SelectValue placeholder="Période de création" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toute période</SelectItem>
              <SelectItem value="7d">Créées ces 7 jours</SelectItem>
              <SelectItem value="30d">Créées ces 30 jours</SelectItem>
              <SelectItem value="current_month">Créées ce mois-ci</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-medium">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Afficher les archivées" />
            <span>Archivées{archivedCount > 0 && ` (${archivedCount})`}</span>
          </label>
        </div>
      )}

      <PipelineFiltresSheet
        open={filtresOpen} onOpenChange={setFiltresOpen}
        q={searchQuery} setQ={setSearchQuery}
        tri={tri} setTri={(t) => { setTri(t); savePrefs({ tri: t }); }} showTri={vue !== "tableur"}
        ca={filterCa} setCa={setFilterCa} charges={charges} moiId={user?.id && charges.some((c) => c.id === user.id) ? user.id : undefined}
        inter={{ actionsDues, noCa, noD, noRp, claude }}
        setInter={(k, v) => ({ actionsDues: setActionsDues, noCa: setNoCa, noD: setNoD, noRp: setNoRp, claude: setClaude })[k](v)}
        showScopeAll={oppScope === "all"} claudeNb={claudeIds.size}
        f={filtres} setF={setFiltres}
        typologies={AFFAIRE_TYPOLOGIES.map((t) => ({ value: t, label: AFFAIRE_TYPOLOGIE_LABELS[t] }))}
        tailles={TAILLE_ORDER.map((t) => ({ value: t, label: TAILLE_LABEL[t] }))}
        nbResultats={filtres.supplements ? (indicateurs.data?.supplements.length ?? 0) : oppsKanban.filter((o) => vue === "tableur" ? showArchived || o.statut_opportunite !== "termine" : o.statut_opportunite !== "termine").length}
        onReset={resetFiltres}
      />

      {vue !== "tableur" && <PipelineIndicateursBandeau data={indicateurs.data} relanceActive={relance} onRelance={() => setRelance((r) => !r)} />}

      {vue === "tableur" && <div className="rounded-2xl border border-border bg-card p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Statut
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStatutsFilter([])}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              statutsFilter.length === 0
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground"
            }`}
          >
            Tous
          </button>
          {(vue === "tableur" ? STATUT_ORDER : KANBAN_STATUT_ORDER).map((s) => {
            const active = statutsFilter.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setStatutsFilter((prev) =>
                    prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                  )
                }
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                {STATUT_LABEL[s]}
                <span className="ml-1.5 opacity-70">{statutCounts[s] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>}

      {loading ? (
        <div className="flex items-center justify-center p-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : vue === "tableur" ? (
        <OpportunitesTableurView
          rows={tableurRows}
          charges={charges}
          filters={tableurFilters}
          canEdit={canManageOpps}
          canManage={canManageOpps}
          canForceCode5xxx={canForceCode5xxx}
          currentUserId={user?.id ?? null}
          defaultChargeId={user?.id ?? null}
          onRowsMutated={() => setRefreshTick((t) => t + 1)}
        />
      ) : opps.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/20 p-16 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">
            Aucune opportunité en pipeline
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            Créez votre première opportunité 9XXX ou importez le CRM Excel pour
            initialiser le pipeline.
          </p>
          {canManageOpps && (
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Créer une opportunité
            </Button>
          )}
        </div>
      ) : (
        <IndicateursCtx.Provider value={parAffaire}>
        <DevisPipelineProvider affaireIds={opps.map((o) => o.id)}>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:overflow-x-auto md:pb-2">
            {kanbanStatuts.map((s) => (
              <KanbanColonne
                key={s}
                statut={s}
                items={byStatut.get(s) ?? []}
                chargesById={chargesById}
                onSign={handleSign}
                onDelete={canManageOpps ? handleDeleteRequest : undefined}
                draggable={canManageOpps}
                tri={tri}
                repliee={colonneRepliee(s, (byStatut.get(s) ?? []).length, replis)}
                onToggle={() => {
                  const next = { ...replis, [s]: !colonneRepliee(s, (byStatut.get(s) ?? []).length, replis) };
                  setReplis(next);
                  savePrefs({ replis: next });
                }}
              />
            ))}
            {!relance && !filtreOppSeul && (indicateurs.data?.supplements.length ?? 0) > 0 && (
              <SupplementsColonne
                items={indicateurs.data!.supplements}
                repliee={filtres.supplements ? false : replis.supplements ?? true}
                onToggle={() => { const next = { ...replis, supplements: !(replis.supplements ?? true) }; setReplis(next); savePrefs({ replis: next }); }}
              />
            )}
          </div>
          <DragOverlay>
            {activeOpp && (
              <div className="rotate-2 cursor-grabbing">
                <OpportuniteCard
                  opp={activeOpp}
                  chargesById={chargesById}
                  draggable={false}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
        </DevisPipelineProvider>
        </IndicateursCtx.Provider>
      )}

      <NouvelleOpportuniteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultChargeId={user?.id ?? null}
        charges={charges}
        onCreated={() => setRefreshTick((t) => t + 1)}
      />

      {signTarget && (
        <SignerOpportuniteDialog
          open={!!signTarget}
          onOpenChange={(o) => !o && setSignTarget(null)}
          affaireId={signTarget.id}
          oldCode={signTarget.numero}
          clientLabel={signTarget.client}
          typologieFuture={signTarget.typologie_future ?? null}
          onSigned={() => setRefreshTick((t) => t + 1)}
        />
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer l&apos;opportunité {deleteTarget?.numero}&nbsp;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.client ?? "(sans client)"}
              {deleteTarget?.nom && deleteTarget.nom !== deleteTarget.client
                ? ` — ${deleteTarget.nom}`
                : ""}
              . Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteConfirm();
              }}
              disabled={deletePending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePending ? "Suppression…" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
