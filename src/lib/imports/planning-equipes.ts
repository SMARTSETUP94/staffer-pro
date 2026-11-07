export type PersonnePlanning = { id: string; nom: string; prenom: string; origine: 'employe' | 'dispos' };
export type AffectationPlanning = { employe_id: string | null; dispos_intervenant_id: string | null; date: string; etape_id: string | null; affaire_id: string };
export type EtapePlanning = { id: string; date: string; fin: string; heure: string | null; type: string; numero: string; nom: string; lieu: string | null; responsable: string | null };
export function memePersonne(p: PersonnePlanning, a: AffectationPlanning) {
  return p.origine === 'employe' ? a.employe_id === p.id : a.dispos_intervenant_id === p.id;
}
export function personnesStaffees<T extends PersonnePlanning>(personnes: T[], affectations: AffectationPlanning[], debut: string, fin: string): T[] {
  return personnes.filter(p => affectations.some(a => a.date >= debut && a.date <= fin && memePersonne(p, a))).sort((a,b) => a.nom.localeCompare(b.nom,'fr') || a.prenom.localeCompare(b.prenom,'fr'));
}
export function lignesPlanning(dates: string[], etapes: EtapePlanning[], affectations: AffectationPlanning[], personnes: PersonnePlanning[], libelles: Record<string,string>) {
  const rows: string[][] = [];
  for (const jour of dates) {
    rows.push([new Intl.DateTimeFormat('fr-FR',{ weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Paris' }).format(new Date(`${jour}T12:00:00Z`))]);
    for (const e of etapes.filter(e => e.date <= jour && e.fin >= jour).sort((a,b) => (a.heure ?? '').localeCompare(b.heure ?? ''))) {
      const noms = [...new Set(affectations.filter(a => a.etape_id === e.id && a.date === jour).map(a => {
        const p = personnes.find(p => memePersonne(p,a));
        if (!p) throw new Error('Une personne affectée est introuvable : export interrompu.');
        return `${p.nom} ${p.prenom}`;
      }))];
      if (!noms.length) continue;
      rows.push(['Code','Nom chantier','Responsable','Opération','Adresse','Commentaires']);
      rows.push([e.numero,e.nom,e.responsable ?? '',libelles[e.type] ?? e.type,e.lieu ?? '',e.heure?.slice(0,5) ?? 'Horaire à confirmer']);
      for(let i=0;i<noms.length;i+=6) rows.push(noms.slice(i,i+6));
      rows.push([]);
    }
    rows.push([]);
  }
  return rows;
}