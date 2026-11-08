import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlertTriangle } from 'lucide-react';
import { lireDevisClient } from '@/lib/devis/pdf-export';
import { champsPdfManquants } from '@/lib/devis/pdf-avertissements';
import { supabase } from '@/integrations/supabase/client';
export function PdfAvertissements({ devisId, open }: { devisId: string; open: boolean }) {
  const q = useQuery({ queryKey: ['pdf-completude', devisId], enabled: open, staleTime: 0, queryFn: () => lireDevisClient(supabase, devisId) });
  const manque = q.data ? champsPdfManquants(q.data) : [];
  if (!manque.length) return null;
  return <div role="status" className="space-y-2 rounded border border-border bg-muted p-3 text-sm"><p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 shrink-0" />Informations à compléter</p><p>{manque.join(' · ')}</p><Link to="/parametres/devis-taux" className="text-primary underline">Paramètres des devis</Link>{manque.includes('Signataire nommé et email') && <p className="text-muted-foreground">Signataire : en-tête du devis.</p>}</div>;
}
