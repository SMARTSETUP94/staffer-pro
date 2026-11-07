import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import type { PassageExport } from '@/lib/imports/historique-export';

export function HistoriqueAffectationsExport() {
  const [busy, setBusy] = useState(false);
  async function exporter() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('planning_terrain_historique_exporter');
      if (error) throw error;
      const result = data as unknown as { lignes: PassageExport[] };
      const { exporterHistorique } = await import('@/lib/imports/historique-export');
      await exporterHistorique(result.lignes);
      toast.success(`${result.lignes.length} passages exportés`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Export impossible'); }
    finally { setBusy(false); }
  }
  return <Button variant="outline" disabled={busy} onClick={() => void exporter()}><Download className="mr-2 h-4 w-4" />{busy ? 'Export en cours…' : 'Historique des affectations'}</Button>;
}