import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { verifierPlanning } from '@/lib/imports/planning-hebdomadaire';

export const analyserPlanningHebdomadaire = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(i => z.object({ name: z.string().min(1).max(255), base64: z.string().min(1).max(20 * 1024 * 1024) }).parse(i))
  .handler(async ({ data, context }) => {
    const droits = await context.supabase.rpc('planning_terrain_ecrire_autorise');
    if (droits.error || droits.data !== true) throw new Error('Import réservé à la logistique et aux administrateurs');
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error('Analyse de documents indisponible');
    const { extrairePlanning } = await import('@/lib/ai/planning-import.server');
    let content: import('@/lib/ai/fournisseur.server').Partie[];
    if (/\.pdf$/i.test(data.name)) content = [{ type: 'pdf', nom: data.name, base64: data.base64 }];
    else if (/\.xlsx$/i.test(data.name)) {
      const module = await import('xlsx-js-style');
      const XLSX = module.default ?? module;
      const wb = XLSX.read(data.base64, { type: 'base64', cellDates: true });
      const sheets = wb.SheetNames.filter(n => /planning/i.test(n));
      if (!sheets.length) throw new Error('Onglet Planning introuvable.');
      const text = sheets.map(n => `Feuille ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: ' | ' })}`).join('\n\n');
      if (!text.trim() || text.length > 120000) throw new Error('Planning vide ou trop volumineux.');
      content = [{ type: 'text', text }];
    } else throw new Error('Formats acceptés : PDF et Excel .xlsx.');
    const output = await extrairePlanning(key, content, context.userId);
    return verifierPlanning(output.interventions);
  });