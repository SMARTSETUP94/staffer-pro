/**
 * v0.44.1 — Onglet "Atelier" (ex-"À valider") du Hub chef mobile.
 * 3 sous-tabs : Objets fab à valider / Vue chantier kanban / Photos par objet.
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Hammer, Columns3, Camera, ChevronRight, ArrowLeft, Inbox, AlertCircle } from "lucide-react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { ChefMobileHeader } from "@/components/mobile-chef/ChefMobileHeader";
import { ValiderObjetsList } from "@/components/mobile-chef/ValiderObjetsList";
import { useChefAValider } from "@/hooks/use-chef-a-valider";
import { useChantierKanban, KANBAN_COLUMNS, kanbanLabel, type KanbanObjet, type KanbanColumn } from "@/hooks/use-chantier-kanban";
import { useMesAffairesChef } from "@/hooks/use-mes-affaires-chef";
import { useObjetPhotos } from "@/hooks/use-objet-photos";
import { AffaireDocumentsGallery } from "@/components/affaire-documents/AffaireDocumentsGallery";
import { AffaireDocumentUploader } from "@/components/affaire-documents/AffaireDocumentUploader";
import { supabase } from "@/integrations/supabase/client";

const KANBAN_FILTER_LS_KEY = "v0.44.2:kanban-filter-affaires";

export const Route = createFileRoute("/mobile/chef/atelier")({
  head: () => ({ meta: [{ title: "Hub chef — Atelier" }] }),
  component: () => (
    <RoleGuard required="chef_or_admin">
      <ChefAtelierPage />
    </RoleGuard>
  ),
});

function ChefAtelierPage() {
  const { objets } = useChefAValider();
  return (
    <>
      <ChefMobileHeader title="Atelier" />
      <div className="mx-auto max-w-xl p-4">
        <Tabs defaultValue="objets">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="objets" className="gap-1 text-xs">
              <Hammer className="h-3.5 w-3.5" />
              Objets
              {objets.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
                  {objets.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="kanban" className="gap-1 text-xs">
              <Columns3 className="h-3.5 w-3.5" />
              Chantier
            </TabsTrigger>
            <TabsTrigger value="photos" className="gap-1 text-xs">
              <Camera className="h-3.5 w-3.5" />
              Photos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="objets" className="mt-4">
            <ValiderObjetsList />
          </TabsContent>

          <TabsContent value="kanban" className="mt-4">
            <ChantierKanbanView />
          </TabsContent>

          <TabsContent value="photos" className="mt-4">
            <ObjetPhotosWorkflow />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

// ─────────── Kanban ───────────

function ChantierKanbanView() {
  const { data: affaires } = useMesAffairesChef();
  const [selectedAffaireIds, setSelectedAffaireIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(KANBAN_FILTER_LS_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KANBAN_FILTER_LS_KEY, JSON.stringify(selectedAffaireIds));
    } catch {
      /* ignore quota */
    }
  }, [selectedAffaireIds]);

  const { data: objets, isLoading } = useChantierKanban(selectedAffaireIds.length ? selectedAffaireIds : null);

  const byCol = useMemo(() => {
    const m = new Map<KanbanColumn, KanbanObjet[]>();
    KANBAN_COLUMNS.forEach((c) => m.set(c, []));
    (objets ?? []).forEach((o) => m.get(o.column)!.push(o));
    return m;
  }, [objets]);

  function toggleAffaire(id: string) {
    setSelectedAffaireIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Filtre chantier
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(affaires ?? []).map((a) => {
              const active = selectedAffaireIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAffaire(a.id)}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors duration-200 ease-out ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-accent"
                  }`}
                  data-testid={`kanban-filter-${a.numero}`}
                >
                  {a.numero}
                </button>
              );
            })}
            {selectedAffaireIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedAffaireIds([])}
                className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                Tous
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div
          data-testid="kanban-board"
          className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x"
        >
          {KANBAN_COLUMNS.map((col) => {
            const items = byCol.get(col) ?? [];
            return (
              <div
                key={col}
                className="w-64 shrink-0 snap-start"
                data-testid={`kanban-col-${col}`}
              >
                <div className="mb-2 flex items-center justify-between rounded-md bg-muted/50 px-2 py-1">
                  <span className="text-xs font-semibold">{kanbanLabel(col)}</span>
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                    {items.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <div className="flex flex-col items-center gap-1 rounded-md border border-dashed p-4 text-center text-[11px] text-muted-foreground/70">
                      <Inbox className="h-5 w-5 opacity-50" />
                      <span>Aucun objet en cours</span>
                    </div>
                  ) : (
                    items.map((o) => <KanbanCard key={o.id} objet={o} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KanbanCard({ objet }: { objet: KanbanObjet }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  useMemo(() => {
    if (!objet.thumbnail_path) return;
    void supabase.storage
      .from("affaires-photos")
      .createSignedUrl(objet.thumbnail_path, 3600)
      .then(({ data }) => data?.signedUrl && setThumbUrl(data.signedUrl));
  }, [objet.thumbnail_path]);

  return (
    <Card
      className={`transition-all duration-200 ease-out ${
        objet.is_en_retard ? "border-destructive/50 bg-destructive/5" : ""
      }`}
    >
      <CardContent className="space-y-1.5 p-2">
        {thumbUrl && (
          <div className="aspect-video overflow-hidden rounded">
            <img src={thumbUrl} alt={objet.nom} className="h-full w-full object-cover" />
          </div>
        )}
        <div>
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[10px] text-muted-foreground">
              {objet.affaire_numero} • {objet.reference}
            </span>
            {objet.is_en_retard && (
              <span className="inline-flex items-center gap-0.5 rounded bg-destructive/15 px-1 py-0.5 text-[9px] font-semibold uppercase text-destructive">
                <AlertCircle className="h-2.5 w-2.5" /> Retard
              </span>
            )}
          </div>
          <div className="line-clamp-2 text-xs font-semibold leading-tight">{objet.nom}</div>
          <div className="text-[10px] text-muted-foreground">
            Qté {objet.quantite}
            {objet.date_fin_souhaitee && (
              <> • échéance {objet.date_fin_souhaitee.slice(5).replace("-", "/")}</>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────── Photos par objet ───────────

interface ObjetLite {
  id: string;
  affaire_id: string;
  affaire_numero: string;
  reference: string;
  nom: string;
}

function ObjetPhotosWorkflow() {
  const { data: affaires } = useMesAffairesChef();
  const [selected, setSelected] = useState<ObjetLite | null>(null);
  const [objets, setObjets] = useState<ObjetLite[]>([]);
  const [loading, setLoading] = useState(false);

  useMemo(() => {
    const affaireIds = (affaires ?? []).map((a) => a.id);
    if (affaireIds.length === 0) {
      setObjets([]);
      return;
    }
    setLoading(true);
    void supabase
      .from("fabrication_objets")
      .select("id, affaire_id, reference, nom, affaires(numero)")
      .eq("archive", false)
      .in("affaire_id", affaireIds)
      .order("reference")
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setObjets(((data ?? []) as any[]).map((r) => ({
          id: r.id,
          affaire_id: r.affaire_id,
          affaire_numero: r.affaires?.numero ?? "",
          reference: r.reference,
          nom: r.nom,
        })));
        setLoading(false);
      });
  }, [affaires]);

  if (selected) return <ObjetPhotosGallery objet={selected} onBack={() => setSelected(null)} />;

  if (loading) return <Skeleton className="h-32 w-full" />;
  if (objets.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Aucun objet sur vos chantiers actifs.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {objets.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setSelected(o)}
          className="w-full text-left"
        >
          <Card className="hover:bg-accent transition-colors">
            <CardContent className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <div className="font-mono text-[10px] text-muted-foreground">
                  {o.affaire_numero} • {o.reference}
                </div>
                <div className="truncate text-sm font-semibold">{o.nom}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  );
}

function ObjetPhotosGallery({ objet, onBack }: { objet: ObjetLite; onBack: () => void }) {
  const { documents, loading, error, getSignedUrl, upload, updateDocument, deleteDocument } = useObjetPhotos(
    objet.affaire_id,
    objet.id,
  );

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Retour liste
      </button>
      <Card>
        <CardContent className="p-3">
          <div className="font-mono text-[10px] text-muted-foreground">
            {objet.affaire_numero} • {objet.reference}
          </div>
          <div className="text-sm font-semibold">{objet.nom}</div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {documents.length} photo{documents.length > 1 ? "s" : ""} sur cet objet
          </p>
        </CardContent>
      </Card>

      <AffaireDocumentUploader
        variant="mobile"
        onUpload={(file, onProgress) => upload(file, onProgress)}
      />

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <AffaireDocumentsGallery affaireId={objet.affaire_id} variant="mobile" canUpload={false} />
      )}
    </div>
  );
}
