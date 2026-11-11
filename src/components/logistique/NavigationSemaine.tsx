import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ajouterJours } from '@/lib/dispos';

/** Flèches de semaine communes à Dispos et au Planning équipes. */
export function NavigationSemaine({ debut, onChange, choisir = false, children }: { debut: string; onChange: (debut: string) => void; choisir?: boolean; children?: ReactNode }) {
  const lundi = (iso: string) => { const d = new Date(`${iso}T12:00:00`); return ajouterJours(iso, -((d.getDay() + 6) % 7)); };
  return <div className="flex flex-wrap items-center gap-2">
    <Button variant="outline" size="icon" aria-label="Semaine précédente" title="Semaine précédente" onClick={() => onChange(ajouterJours(debut, -7))}><ChevronLeft className="size-4" /></Button>
    {children}
    {choisir && <Popover><PopoverTrigger asChild><Button variant="outline" size="sm"><CalendarDays className="size-4" />Choisir</Button></PopoverTrigger><PopoverContent className="w-64"><Input type="date" aria-label="Début de semaine" value={debut} onChange={e => e.target.value && onChange(lundi(e.target.value))} /></PopoverContent></Popover>}
    <Button variant="outline" size="icon" aria-label="Semaine suivante" title="Semaine suivante" onClick={() => onChange(ajouterJours(debut, 7))}><ChevronRight className="size-4" /></Button>
  </div>;
}
