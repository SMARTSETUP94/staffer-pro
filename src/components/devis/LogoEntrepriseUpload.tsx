import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Upload, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { preparerLogo } from '@/lib/devis/logo-image';
export function LogoEntrepriseUpload({ entrepriseId, path, refresh }: { entrepriseId: string; path: string | null; refresh: () => Promise<unknown> }) {
  const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false);
  const preview = useQuery({ queryKey: ['logo-entreprise', path], enabled: !!path, queryFn: async () => {
    if (!path) return null;
    const { data, error } = await supabase.storage.from('devis-photos').createSignedUrl(path, 600);
    if (error) throw error; return data.signedUrl;
  } });
  const associer = async (nouveau: string | null) => {
    const { error } = await supabase.from('parametres_entreprise').update({ logo_storage_path: nouveau }).eq('id', entrepriseId);
    if (error) throw error; await refresh();
  };
  const upload = async (fichier: File) => {
    setBusy(true);
    try {
      const png = await preparerLogo(fichier); const nouveau = `entreprise-logo/${crypto.randomUUID()}.png`;
      const { error } = await supabase.storage.from('devis-photos').upload(nouveau, png, { contentType: 'image/png', upsert: false });
      if (error) throw error; await associer(nouveau); toast.success('Logo enregistré');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Téléversement impossible'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const retirer = async () => { setBusy(true); try { await associer(null); toast.success('Logo retiré'); } catch { toast.error('Retrait impossible'); } finally { setBusy(false); } };
  return <div className="space-y-2"><p className="text-sm font-medium">Logo SET UP</p>
    {preview.data && <div className="flex h-28 max-w-sm items-center justify-center border border-border bg-background p-3"><img src={preview.data} alt="Logo entreprise" className="max-h-full max-w-full object-contain" /></div>}
    {preview.error && <p className="text-sm text-destructive">Aperçu indisponible. Vous pouvez remplacer le logo.</p>}
    <input ref={input} type="file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" className="hidden" aria-label="Choisir le logo" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); }} />
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{path ? 'Remplacer le logo' : 'Ajouter un logo'}</Button>
      {path && <Button variant="ghost" disabled={busy} onClick={() => void retirer()}><Trash2 className="mr-2 h-4 w-4" />Retirer le logo</Button>}</div>
  </div>;
}
