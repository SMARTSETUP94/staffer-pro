/* =============================================================================
 *  engine.ts — Logique métier "Marge & Contribution par chantier"
 *  Pur TypeScript, sans dépendance au DOM. À importer dans une app React/Lovable.
 *  Toutes les fonctions sont pures : elles reçoivent l'état `AppData` en paramètre.
 * ========================================================================== */

/* ----------------------------------- Types ----------------------------------- */
export type Statut =
  | 'Permanent 35h' | 'Permanent forfait' | 'Intermittent' | 'Auto-entrepreneur' | string;

export interface Employe {
  personne: string;          // identifiant = "Nom ProGBAT"
  statut: Statut;
  poste?: string;            // poste brut (Serrurier, Menuisier…)
  metier?: string;           // métier/pôle (Métal, Bois…) – déduit du poste via posteMap
  taux: number;              // taux horaire brut €/h
  coef: number;              // coefficient brut→chargé (0 = utiliser le coef global)
  coutMensuel: number;       // coût employeur mensuel (forfaits uniquement)
  chef?: boolean;            // chef de pôle
}

export interface LigneDevis {
  num: string;
  designation: string;
  metier: string;            // '' = à préciser (multi-métiers)
  heuresVendues: number;     // déjà multipliées par la quantité de section
  caHT: number;              // idem
  categorie: 'mo' | 'mat';   // main d'œuvre / matériaux
  qte?: number;              // quantité de la ligne (info / garde-fou)
  puht?: number;             // prix unitaire HT (garde-fou)
  mult?: number;             // multiplicateur de section appliqué (info)
  section?: boolean;         // true = titre/sous-total (exclu des calculs)
}

export interface Devis {
  numDevis: string; chantier: string; nom: string;
  client?: string; chargeAffaire?: string; chefProjet?: string; statut?: string;
  lignes: LigneDevis[]; matchRegistre?: boolean; dateImport?: number;
}

export interface Heure {
  chantier: string; chantierNom?: string; label?: string;
  personne: string; heures: number;
  date?: string; annee?: string; semaine?: string; commentaire?: string;
}

export interface RegistreEntry {
  numDevis: string; chantier: string;
  chantierLabel?: string; chantierFull?: string;
  client?: string; chargeAffaire?: string; statut?: string; totalHT?: number;
}

export interface Metier { nom: string; responsable?: string; }
export interface NamedRef { nom: string; }
export interface ParsingRule { motif: string; metier: string; }

export interface AppData {
  rh: Employe[];
  devis: Devis[];
  heures: Heure[];
  registre: RegistreEntry[];
  metiers: Metier[];
  postes: NamedRef[];
  chargesAffaire: NamedRef[];
  chefsProjet: NamedRef[];
  parsing: ParsingRule[];
  meta: { coef?: number; posteMap?: Record<string, string>; chantiersOK?: Record<string, boolean> };
}

export type Mode = 'reel' | 'pondere';

export interface Ctx {
  weekly: Record<string, { P: number }>;
  monthly: Record<string, { H: number }>;
  avgCost: number;        // coût horaire moyen global (hors majorations)
  totalCout: number;
  totalHeures: number;
}

/* ---------------------------------- Utils ----------------------------------- */
/** Parse un nombre au format français ("1 234,56" -> 1234.56). */
export function num(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  let s = ('' + v).replace(/[^\d,.-]/g, '').replace(/\s/g, '');
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.indexOf(',') > -1) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Normalise une désignation : minuscule, sans accents ni parenthèses. */
export function normDes(s: string): string {
  return ('' + s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

const anneeOf = (date?: string) => { const m = ('' + date).match(/(20\d{2})/); return m ? m[1] : ''; };

/* ------------------------ Détection du métier d'une ligne ------------------- */
/** Métier déduit des mots-clés de la désignation (formats Progbat variés). */
export function metierFromDesignation(des: string): string {
  const low = ('' + des).toLowerCase().replace(/\([^)]*\)/g, ' '); // ignore le texte entre parenthèses
  const map: [RegExp, string][] = [
    [/bureau d['’]?[ée]tude|plans? techniques?/, "Bureau d'étude"],
    [/suivi|chef de projet/, 'Suivi de projet'],
    [/montage|d[ée]montage|rotation|permanence|assistance|conditionnement|installation|chargement/, 'Montage'],
    [/peintur|peintre/, 'Peinture'],
    [/m[ée]tal|m[ée]taller|serrur/, 'Métal'],
    [/impression/, 'Impression UV'],
    [/num[ée]rique|d[ée]coupe laser|usinage/, 'Numérique'],
    [/logisi?tique|livraison/, 'Logistique'],
    [/tapisser|tissu/, 'Tapisserie'],
    [/menuis|ébéniste|ebeniste|\bbois\b|constructeur|construction|fabrication/, 'Bois'],
  ];
  for (const [re, lab] of map) if (re.test(low)) return lab;
  let m = low.match(/nombre d['’]?heures? de\s+(.+?)\s*$/);
  if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1).trim();
  m = ('' + des).match(/^(.+?)\s*[-_–]\s*(?:nombre d['’]?heures?|heures?)\b/i);
  if (m) return m[1].trim();
  return '';
}

/** Métier issu des règles apprises (motif contenu dans la désignation ; le plus long gagne). */
export function metierFromParsing(parsing: ParsingRule[], des: string): string {
  const nd = normDes(des); let best = ''; let bl = 0;
  for (const r of parsing) { const nm = normDes(r.motif); if (nm && r.metier && nd.includes(nm) && nm.length > bl) { best = r.metier; bl = nm.length; } }
  return best;
}

/** Détection complète : règles apprises (prioritaires) puis mots-clés. */
export function detecterMetier(app: AppData, des: string): string {
  return metierFromParsing(app.parsing, des) || metierFromDesignation(des);
}

/* ----------------------------- Helpers chantier ----------------------------- */
/** N° de chantier = chiffres de début ("1127_CONGÉS" -> "1127", "5804-HPDR" -> "5804"). */
export function chantierNum(s: string): string { s = ('' + s).trim(); const m = s.match(/^(\d+)/); return m ? m[1] : s; }
/** Nom de chantier = libellé sans le n° et sans la sous-tâche après " - ". */
export function chantierNomFromLabel(s: string): string {
  s = ('' + s).trim().replace(/^\s*\d+\s*[_\-–]?\s*/, '');
  return s.split(/\s+[-–]\s+/)[0].trim();
}

/* ------------------------------- Moteur de coût ----------------------------- */
export const globalCoef = (app: AppData) => { const c = app.meta && num(app.meta.coef); return c > 0 ? c : 1.5; };
export const empOf = (app: AppData, personne: string) => app.rh.find(x => x.personne === personne);
export const isForfait = (e?: Employe) => !!(e && (e.statut === 'Permanent forfait' || (e as any).forfait));

/** Coût horaire chargé = taux × coefficient (individuel sinon global). */
export function coutHoraire(app: AppData, personne: string): number {
  const e = empOf(app, personne); if (!e) return 0;
  const coef = num(e.coef) > 0 ? num(e.coef) : globalCoef(app);
  return num(e.taux) * coef;
}

const parseNuit = (c?: string) => { const s = ('' + c).trim(); if (!/^N/i.test(s)) return 0; const rest = s.slice(1).trim(); return /^[\d.,\s]+$/.test(rest) ? num(rest) : 0; };
const parseDate = (s?: string) => { const m = ('' + s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
const isDimanche = (s?: string) => { const d = parseDate(s); return d ? d.getDay() === 0 : false; };
const weekNum = (s?: string) => { const d = parseDate(s); if (!d) return ''; const o = new Date(d.getFullYear(), 0, 1); return Math.ceil((((+d - +o) / 86400000) + o.getDay() + 1) / 7); };
const moisOf = (h: Heure) => { const d = parseDate(h.date); return d ? d.getMonth() + 1 : ''; };
const weekKeyOf = (h: Heure) => `${h.personne || ''}|${h.annee || anneeOf(h.date)}|${h.semaine || weekNum(h.date)}`;
const monthKeyOf = (h: Heure) => `${h.personne || ''}|${h.annee || anneeOf(h.date)}|${moisOf(h)}`;

/** Contexte de calcul (agrégats hebdo/mensuels + coût horaire moyen global). */
export function buildCtx(app: AppData): Ctx {
  const weekly: Ctx['weekly'] = {}, monthly: Ctx['monthly'] = {};
  app.heures.forEach(h => {
    const wk = weekKeyOf(h); (weekly[wk] = weekly[wk] || { P: 0 }).P += num(h.heures);
    const mk = monthKeyOf(h); (monthly[mk] = monthly[mk] || { H: 0 }).H += num(h.heures);
  });
  let tcb = 0, tc = 0, th = 0;
  const ctx: Ctx = { weekly, monthly, avgCost: 0, totalCout: 0, totalHeures: 0 };
  app.heures.forEach(h => { const lc = lineCost(app, h, ctx); tcb += lc.coutHorsMajo; tc += lc.cout; th += lc.heures; });
  ctx.avgCost = th > 0 ? tcb / th : 0; ctx.totalCout = tc; ctx.totalHeures = th;
  return ctx;
}

export interface LineCostResult {
  heures: number; ch: number; coutHorsMajo: number; coutMajo: number; cout: number;
  nuit: number; dim: number; hasEmp: boolean; forfait: boolean;
}

/**
 * Coût réel d'une ligne d'heures.
 *  - Forfait jour : coût mensuel réparti au prorata des heures du mois, SANS majoration.
 *  - Sinon : taux×coef × (heures + majorations). HS 35→43 = +25%, >43 = +50% ; nuit & dimanche = +50%.
 *  - Auto-entrepreneur : pas de majoration.
 *  Heures de nuit : encodées dans le commentaire "N4,0" -> 4h. Dimanche : via la date.
 */
export function lineCost(app: AppData, h: Heure, ctx: Ctx): LineCostResult {
  const e = empOf(app, h.personne);
  const heures = num(h.heures);
  const forfait = isForfait(e);
  if (forfait) {
    const Hm = (ctx.monthly[monthKeyOf(h)] || { H: heures }).H || heures;
    const cm = e ? num(e.coutMensuel) : 0;
    const cout = Hm > 0 ? cm * (heures / Hm) : 0;
    return { heures, ch: Hm > 0 ? cm / Hm : 0, coutHorsMajo: cout, coutMajo: 0, cout, nuit: 0, dim: 0, hasEmp: !!(e && cm > 0), forfait: true };
  }
  const taux = e ? num(e.taux) : 0;
  const coef = e && num(e.coef) > 0 ? num(e.coef) : globalCoef(app);
  const ch = taux * coef;
  const majoOK = !(e && e.statut === 'Auto-entrepreneur');
  const P = (ctx.weekly[weekKeyOf(h)] || { P: heures }).P || heures;
  const HS25 = majoOK ? (P < 35 ? 0 : (P > 43 ? 8 : P - 35)) : 0;
  const HS50 = majoOK ? (P > 43 ? P - 43 : 0) : 0;
  const nuit = majoOK ? parseNuit(h.commentaire) : 0;
  const dim = (majoOK && isDimanche(h.date)) ? heures : 0;
  const majoLigne = HS25 * 0.25 + HS50 * 0.5 + nuit * 0.5 + dim * 0.5;
  const repartition = (majoLigne !== 0 && P > 0) ? majoLigne / P * heures : 0;
  const coutHorsMajo = ch * heures;
  const coutMajo = ch * repartition;
  return { heures, ch, coutHorsMajo, coutMajo, cout: coutHorsMajo + coutMajo, nuit, dim: dim > 0 ? heures : 0, hasEmp: !!(e && taux > 0), forfait: false };
}

export interface PersonneContrib {
  personne: string; heures: number; heuresPond: number; cout: number; coutMajo: number;
  manqueTaux: boolean; caContrib: number; coutHoraire: number; marge: number; ratio: number;
}
export interface ChantierCalc {
  caMO: number; caMat: number; caTotal: number;
  heuresVendues: number; heuresPassees: number; heuresPond: number;
  valeurHeure: number;   // CA MO / heures (selon mode)
  valeurVendue: number;  // CA MO / heures vendues (prix moyen de l'heure vendue)
  mode: Mode; coutTotal: number; margeMO: number; ecartH: number;
  personnes: PersonneContrib[];
}

export interface DevisGroup { chantier: string; nbDevis: number; nom: string; devisNoms: string[]; lignes: LigneDevis[]; chefProjet: string; chargeAffaire: string; client: string; }

/** Regroupe les devis par n° de chantier (plusieurs devis possibles par chantier). */
export function chantierGroups(app: AppData): DevisGroup[] {
  const g: Record<string, any> = {};
  app.devis.forEach(d => {
    const k = String(d.chantier).trim();
    const x = g[k] = g[k] || { chantier: k, noms: [], lignes: [], nbDevis: 0, chefProjet: '', chargeAffaire: '', client: '' };
    x.noms.push(d.nom); x.lignes = x.lignes.concat(d.lignes); x.nbDevis++;
    if (!x.chefProjet && d.chefProjet) x.chefProjet = d.chefProjet;
    if (!x.chargeAffaire && d.chargeAffaire) x.chargeAffaire = d.chargeAffaire;
    if (!x.client && d.client) x.client = d.client;
  });
  const nomDepuisHeures = (numero: string) => { const h = app.heures.find(x => String(x.chantier).trim() === String(numero).trim()); return h ? h.chantierNom : ''; };
  return Object.values(g).map((x: any) => ({
    chantier: x.chantier, nbDevis: x.nbDevis, nom: nomDepuisHeures(x.chantier) || x.noms.join(' + '),
    devisNoms: x.noms, lignes: x.lignes, chefProjet: x.chefProjet, chargeAffaire: x.chargeAffaire, client: x.client,
  }));
}

/**
 * Synthèse d'un chantier (mode 'reel' = par heures réelles ; 'pondere' = heures pondérées par coût).
 * Modèle de dilution : le CA de main d'œuvre est réparti au prorata des heures (réelles ou pondérées).
 */
export function calcChantier(app: AppData, d: DevisGroup | Devis, ctx: Ctx, mode: Mode = 'reel'): ChantierCalc {
  const avg = ctx.avgCost || 0;
  const lignes = (d as any).lignes as LigneDevis[];
  const caMO = lignes.filter(l => !l.section && l.categorie === 'mo').reduce((s, l) => s + num(l.caHT), 0);
  const caMat = lignes.filter(l => !l.section && l.categorie !== 'mo').reduce((s, l) => s + num(l.caHT), 0);
  const heuresVendues = lignes.filter(l => !l.section).reduce((s, l) => s + num(l.heuresVendues), 0);
  const lignesH = app.heures.filter(h => String(h.chantier).trim() === String(d.chantier).trim());
  const heuresPassees = lignesH.reduce((s, h) => s + num(h.heures), 0);
  const byP: Record<string, any> = {};
  lignesH.forEach(h => {
    const lc = lineCost(app, h, ctx); const p = h.personne || '(non renseigné)';
    const o = byP[p] = byP[p] || { personne: p, heures: 0, cout: 0, coutBase: 0, coutMajo: 0, manqueTaux: false };
    o.heures += lc.heures; o.cout += lc.cout; o.coutBase += lc.coutHorsMajo; o.coutMajo += lc.coutMajo;
    if (!lc.hasEmp) o.manqueTaux = true;
  });
  Object.values(byP).forEach((o: any) => { o.heuresPond = avg > 0 ? o.coutBase / avg : o.heures; });
  const heuresPond = Object.values(byP).reduce((s: number, o: any) => s + o.heuresPond, 0);
  const baseTot = mode === 'pondere' ? heuresPond : heuresPassees;
  const valeurHeure = baseTot > 0 ? caMO / baseTot : 0;
  const personnes: PersonneContrib[] = Object.values(byP).map((o: any) => {
    const eff = mode === 'pondere' ? o.heuresPond : o.heures;
    const caContrib = eff * valeurHeure;
    return { personne: o.personne, heures: o.heures, heuresPond: o.heuresPond, cout: o.cout, coutMajo: o.coutMajo, manqueTaux: o.manqueTaux, caContrib, coutHoraire: o.heures > 0 ? o.cout / o.heures : 0, marge: caContrib - o.cout, ratio: o.cout > 0 ? caContrib / o.cout : NaN };
  }).sort((a, b) => b.marge - a.marge);
  const coutTotal = personnes.reduce((s, p) => s + p.cout, 0);
  return {
    caMO, caMat, caTotal: caMO + caMat, heuresVendues, heuresPassees, heuresPond,
    valeurHeure, valeurVendue: heuresVendues > 0 ? caMO / heuresVendues : 0, mode,
    coutTotal, margeMO: caMO - coutTotal, ecartH: heuresPassees - heuresVendues, personnes,
  };
}

/** Récap par personne, tous chantiers (mode 'reel' ou 'pondere'). */
export function calcPersonnes(app: AppData, mode: Mode = 'reel') {
  const ctx = buildCtx(app); const map: Record<string, any> = {};
  chantierGroups(app).forEach(d => {
    calcChantier(app, d, ctx, mode).personnes.forEach(p => {
      const m = map[p.personne] = map[p.personne] || { personne: p.personne, heures: 0, heuresPond: 0, caContrib: 0, cout: 0, coutMajo: 0, chantiers: 0, manqueTaux: false };
      m.heures += p.heures; m.heuresPond += p.heuresPond; m.caContrib += p.caContrib; m.cout += p.cout; m.coutMajo += p.coutMajo; m.chantiers++;
      if (p.manqueTaux) m.manqueTaux = true;
    });
  });
  return Object.values(map).map((m: any) => {
    const e = empOf(app, m.personne);
    return { ...m, marge: m.caContrib - m.cout, ratio: m.cout > 0 ? m.caContrib / m.cout : NaN, coutHoraire: m.heures > 0 ? m.cout / m.heures : 0, taux: e ? num(e.taux) : null, statut: e ? e.statut : null, forfait: isForfait(e) };
  }).sort((a, b) => b.marge - a.marge);
}

/** Performance & management : marge réelle pure + productivité (vendu/passé) global et par pôle. */
export function calcChantierPerf(app: AppData, d: DevisGroup, ctx: Ctx) {
  const c = calcChantier(app, d, ctx, 'reel');
  const venduH: Record<string, number> = {}, venduCA: Record<string, number> = {};
  d.lignes.filter(l => !l.section && l.categorie === 'mo').forEach(l => { const m = l.metier || '(non précisé)'; venduH[m] = (venduH[m] || 0) + num(l.heuresVendues); venduCA[m] = (venduCA[m] || 0) + num(l.caHT); });
  const passeH: Record<string, number> = {}, passeCout: Record<string, number> = {};
  app.heures.filter(h => String(h.chantier).trim() === String(d.chantier).trim()).forEach(h => {
    const e = empOf(app, h.personne); const m = (e && e.metier) || '(non affecté)'; const lc = lineCost(app, h, ctx);
    passeH[m] = (passeH[m] || 0) + num(h.heures); passeCout[m] = (passeCout[m] || 0) + lc.cout;
  });
  const metiers = [...new Set([...Object.keys(venduH), ...Object.keys(passeH)])].sort();
  const parMetier = metiers.map(m => { const v = venduH[m] || 0, p = passeH[m] || 0, ca = venduCA[m] || 0, co = passeCout[m] || 0; return { metier: m, vendu: v, passe: p, prod: p > 0 ? v / p : NaN, ca, cout: co, marge: ca - co }; });
  return {
    chantier: d.chantier, nom: d.nom, chefProjet: d.chefProjet, chargeAffaire: d.chargeAffaire, client: d.client,
    caMO: c.caMO, coutTotal: c.coutTotal, margeReelle: c.caMO - c.coutTotal, ratio: c.coutTotal > 0 ? c.caMO / c.coutTotal : NaN,
    hVendues: c.heuresVendues, hPassees: c.heuresPassees, prodGlobale: c.heuresPassees > 0 ? c.heuresVendues / c.heuresPassees : NaN, parMetier,
  };
}

/* ----------------------------- Parsing (imports) ---------------------------- */
/**
 * Parse les lignes d'un devis Progbat (déjà lues depuis le .xlsx, ex via la lib `xlsx` :
 *   XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })).
 * Gère : sections/sous-totaux (sans CA) conservés comme titres, multiplication par la
 * quantité de section (objets en N exemplaires), héritage du métier de section,
 * métier via règles apprises puis mots-clés, matching du registre.
 */
export function parseDevisRows(rows: any[][], filename: string, app: AppData): Devis {
  let hi = rows.findIndex(r => r.some(c => /désignation|designation/i.test('' + c)));
  if (hi < 0) hi = 0;
  const head = rows[hi].map(c => ('' + c).toLowerCase());
  const col = (ns: string[]) => head.findIndex(h => ns.some(n => h.includes(n)));
  const cNum = col(['n°', 'no', 'num']), cDes = col(['désignation', 'designation', 'libell']),
    cCA = col(['total h', 'montant', 'total ht']), cH = col(['temps', 'heure']),
    cQ = col(['quantit', 'qté', 'qte']), cPU = col(['p.u.h', 'puht', 'prix unit']);
  const lignes: LigneDevis[] = []; const sections: Record<string, { des: string; qte: number }> = {};
  const ancMult = (n: string) => { let m = 1, p = n; while (p.indexOf('.') >= 0) { p = p.slice(0, p.lastIndexOf('.')); const s = sections[p]; if (s && s.qte > 1) m *= s.qte; } return m; };
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r.length) continue;
    const des = cDes >= 0 ? ('' + r[cDes]).replace(/\s+/g, ' ').trim() : '';
    const ca = cCA >= 0 ? num(r[cCA]) : 0;
    const h = cH >= 0 ? num(r[cH]) : 0;
    const n = cNum >= 0 ? ('' + r[cNum]).trim() : '';
    const qte = cQ >= 0 ? num(r[cQ]) : 0;
    if (ca === 0) { // section / sous-total / description -> titre, exclu des calculs
      if (n) sections[n] = { des, qte };
      const dispMult = ancMult(n) * (qte > 1 ? qte : 1);
      if (des || n) lignes.push({ num: n, designation: des, metier: '', heuresVendues: h * dispMult, caHT: 0, categorie: 'mat', section: true, qte: qte > 1 ? qte : 0 });
      continue;
    }
    const mult = ancMult(n);
    const categorie: 'mo' | 'mat' = h > 0 ? 'mo' : 'mat';
    let metier = '';
    if (categorie === 'mo') {
      metier = detecterMetier(app, des);
      let p = n;
      while (!metier && p.indexOf('.') >= 0) { p = p.slice(0, p.lastIndexOf('.')); if (sections[p]) metier = detecterMetier(app, sections[p].des); }
    }
    lignes.push({ num: n, designation: des, metier, heuresVendues: h * mult, caHT: ca * mult, categorie, qte, puht: cPU >= 0 ? num(r[cPU]) : 0, mult: mult !== 1 ? mult : undefined });
  }
  const base = ('' + filename).replace(/\.(xlsx|xls|csv)$/i, '');
  const m = base.match(/(\d{3,})\s*$/);
  const d: Devis = { numDevis: base, chantier: m ? m[1] : base, nom: base, client: '', chargeAffaire: '', chefProjet: '', statut: '', dateImport: Date.now(), lignes };
  appliquerRegistre(app, d);
  return d;
}

/** Garde-fou quantité : Total HT ≠ PU × Qté (compare avant multiplication de section). */
export function ecartQte(l: LigneDevis): boolean {
  if (l.section) return false; const q = num(l.qte), pu = num(l.puht); if (!(q > 0 && pu > 0)) return false;
  const orig = num(l.caHT) / (num(l.mult) || 1); const dd = Math.abs(orig - pu * q); return dd > 1 && dd > 0.01 * Math.abs(orig);
}

/** Parse l'export "Vue liste" des heures (déjà lu : lignes[colonnes], indices de colonnes mappés). */
export function parseHeuresRows(rows: any[][], cols: { chantier: number; personne: number; heures: number; date: number; semaine?: number; commentaire?: number }): Heure[] {
  return rows.map(r => {
    const label = ('' + r[cols.chantier]).trim();
    const date = ('' + r[cols.date]).trim();
    return {
      chantier: chantierNum(label), chantierNom: chantierNomFromLabel(label), label,
      personne: ('' + r[cols.personne]).trim(), heures: num(r[cols.heures]), date, annee: anneeOf(date),
      semaine: cols.semaine != null && cols.semaine >= 0 ? ('' + r[cols.semaine]).trim() : '',
      commentaire: cols.commentaire != null && cols.commentaire >= 0 ? ('' + r[cols.commentaire]).trim() : '',
    };
  }).filter(h => h.chantier || h.personne || h.heures);
}

/** Parse le registre "Devis client" (déjà lu). hi = ligne d'en-tête. */
export function parseRegistreRows(rows: any[][]): RegistreEntry[] {
  let hi = rows.findIndex(r => r.some((c: any) => /devis/i.test('' + c)) && r.some((c: any) => /chantier/i.test('' + c)));
  if (hi < 0) hi = 0;
  const head = rows[hi].map((c: any) => ('' + c).toLowerCase().trim());
  const col = (ns: string[]) => head.findIndex((h: string) => ns.some(n => h.includes(n)));
  const cNum = col(['n° de devis', 'no de devis', 'devis']), cCh = col(['chantier']), cCli = col(['client']),
    cCa = col(['chargé', 'charge', 'affaire']), cSt = col(['statut']), cTot = col(['total']);
  const out: RegistreEntry[] = [];
  rows.slice(hi + 1).forEach(r => {
    const numDevis = ('' + (r[cNum] || '')).trim(); if (!numDevis) return;
    const chLabel = ('' + (r[cCh] || '')).trim();
    out.push({ numDevis, chantier: chantierNum(chLabel), chantierLabel: chantierNomFromLabel(chLabel), chantierFull: chLabel, client: cCli >= 0 ? ('' + r[cCli]).trim() : '', chargeAffaire: cCa >= 0 ? ('' + r[cCa]).trim() : '', statut: cSt >= 0 ? ('' + r[cSt]).trim() : '', totalHT: cTot >= 0 ? num(r[cTot]) : 0 });
  });
  return out;
}

const normNumDevis = (s: string) => ('' + s).toUpperCase().trim().replace(/\s+/g, '').replace(/-R\d+$/, '');
export function matchRegistre(app: AppData, numDevis: string): RegistreEntry | null {
  if (!numDevis) return null;
  let e = app.registre.find(d => d.numDevis === numDevis); if (e) return e;
  const k = normNumDevis(numDevis); return app.registre.find(d => normNumDevis(d.numDevis) === k) || null;
}
/** Complète un devis depuis le registre (chantier, client, chargé d'affaire, statut). */
export function appliquerRegistre(app: AppData, d: Devis): boolean {
  const e = matchRegistre(app, d.numDevis); if (!e) return false;
  d.chantier = e.chantier || d.chantier; if (e.chantierFull) d.nom = e.chantierFull;
  d.client = e.client || ''; d.chargeAffaire = e.chargeAffaire || ''; d.statut = e.statut || ''; d.matchRegistre = true;
  return true;
}

/* ---------------- Correspondance poste -> métier (RH) ---------------------- */
export function metierForPoste(app: AppData, poste: string): string { const pm = (app.meta.posteMap) || {}; return pm[('' + poste).toLowerCase().trim()] || ''; }
export function applyPosteMap(app: AppData): void { app.rh.forEach(r => { const m = metierForPoste(app, r.poste || ''); if (m) r.metier = m; }); }

/* ------------------------------ Apprentissage ------------------------------ */
/** Mémorise une règle motif→métier quand l'utilisateur corrige une ligne. */
export function apprendreParsing(app: AppData, motif: string, metier: string): void {
  motif = ('' + motif).trim(); metier = ('' + metier).trim(); if (!motif || !metier) return;
  const ex = app.parsing.find(r => r.motif === motif);
  if (ex) ex.metier = metier; else app.parsing.push({ motif, metier });
}

/* -------------------- Import "Devis consolidés" (.xlsx) -------------------- */
/**
 * Parse la feuille "Détail lignes" du fichier de devis consolidés et retourne un tableau
 * de Devis (1 par N° devis). Colonnes attendues (souples, détection par mot-clé) :
 *   N° devis · N° ligne · Titre · Qté titre · Élément · Qté élément · Détail · Qté détail
 *   P.U.H.T · Total H.T ligne · TVA · Temps prévu · Temps × Qté titre · Total HT devis
 *
 *  - heuresVendues = "Temps × Qté titre" (DÉJÀ multiplié par Qté titre, ne pas re-multiplier).
 *  - caHT          = "Total H.T ligne" × "Qté titre" (multiplication titre nécessaire).
 *  - Lignes de titre/section (Total H.T = 0 ET Temps × Qté = 0) -> section: true (exclues des calculs).
 */
export function parseDevisConsolidesRows(rows: any[][], app: AppData): Devis[] {
  // Trouve l'entête : ligne contenant "N° devis"/"no devis" ET "désignation/titre/détail"
  const isHeader = (r: any[]) => r.some(c => /n[°o]\s*devis/i.test('' + c));
  let hi = rows.findIndex(isHeader);
  if (hi < 0) hi = 0;
  const head = rows[hi].map(c => ('' + c).toLowerCase().trim());
  const col = (preds: ((h: string) => boolean)[]): number => {
    for (const p of preds) { const i = head.findIndex(p); if (i >= 0) return i; }
    return -1;
  };
  const cNumDevis = col([h => /n[°o]\s*devis/.test(h)]);
  const cNumLigne = col([h => /n[°o]\s*ligne/.test(h)]);
  const cTitre = col([h => /^titre$/.test(h) || h === 'titre']);
  const cQteTitre = col([h => /qt[ée]\s*titre/.test(h)]);
  const cElement = col([h => /^[ée]l[ée]ment$/.test(h) || /^element$/.test(h)]);
  const cDetail = col([h => /^d[ée]tail$/.test(h)]);
  const cPuht = col([h => /p\.?u\.?h/.test(h) || /prix\s*unit/.test(h)]);
  const cTotalLigne = col([h => /total\s*h\.?t\.?\s*ligne/.test(h), h => /total\s*h\.?t\.?(?!\s*devis)/.test(h)]);
  const cTotalDevis = col([h => /total\s*h\.?t\.?\s*devis/.test(h)]);
  const cTempsQte = col([h => /temps\s*[×x*].*qt[ée]/.test(h) || /temps.*qt[ée]\s*titre/.test(h)]);
  const cTempsPrevu = col([h => /temps\s*pr[ée]vu/.test(h)]);
  const cChantier = col([h => /chantier/.test(h)]);
  const cClient = col([h => /^client/.test(h)]);
  const cCharge = col([h => /charg[ée]\s*(d[''’]?)?affaire/.test(h)]);

  if (cNumDevis < 0) throw new Error("Colonne 'N° devis' introuvable dans la feuille.");

  // Groupage par N° devis
  const groups: Record<string, any[][]> = {};
  const order: string[] = [];
  const meta: Record<string, { titreFirst: string; chantier: string; client: string; charge: string; totalDevis: number }> = {};
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || !r.length) continue;
    const nd = ('' + r[cNumDevis]).trim(); if (!nd) continue;
    if (!groups[nd]) { groups[nd] = []; order.push(nd); meta[nd] = { titreFirst: '', chantier: '', client: '', charge: '', totalDevis: 0 }; }
    groups[nd].push(r);
    const m = meta[nd];
    if (!m.titreFirst && cTitre >= 0) m.titreFirst = ('' + r[cTitre]).trim();
    if (!m.chantier && cChantier >= 0) m.chantier = ('' + r[cChantier]).trim();
    if (!m.client && cClient >= 0) m.client = ('' + r[cClient]).trim();
    if (!m.charge && cCharge >= 0) m.charge = ('' + r[cCharge]).trim();
    if (cTotalDevis >= 0) { const v = num(r[cTotalDevis]); if (v > m.totalDevis) m.totalDevis = v; }
  }

  const out: Devis[] = [];
  for (const nd of order) {
    const rs = groups[nd]; const m = meta[nd];
    const lignes: LigneDevis[] = [];
    rs.forEach((r, idx) => {
      const titre = cTitre >= 0 ? ('' + r[cTitre]).trim() : '';
      const element = cElement >= 0 ? ('' + r[cElement]).trim() : '';
      const detail = cDetail >= 0 ? ('' + r[cDetail]).trim() : '';
      const designation = detail || element || titre;
      const qteTitre = cQteTitre >= 0 ? num(r[cQteTitre]) : 1;
      const mult = qteTitre > 0 ? qteTitre : 1;
      const totalLigne = cTotalLigne >= 0 ? num(r[cTotalLigne]) : 0;
      // Heures : "Temps × Qté titre" prioritaire (déjà multiplié), sinon Temps prévu × mult
      const hRaw = cTempsQte >= 0 ? num(r[cTempsQte]) : 0;
      const heuresVendues = hRaw > 0 ? hRaw : (cTempsPrevu >= 0 ? num(r[cTempsPrevu]) * mult : 0);
      const caHT = totalLigne * mult;
      const puht = cPuht >= 0 ? num(r[cPuht]) : 0;
      const qteDetail = num((r as any)[head.findIndex(h => /qt[ée]\s*d[ée]tail/.test(h))]);
      const num_ = cNumLigne >= 0 ? ('' + r[cNumLigne]).trim() : String(idx + 1);
      const isSection = caHT === 0 && heuresVendues === 0;
      if (isSection) {
        if (designation) lignes.push({ num: num_, designation, metier: '', heuresVendues: 0, caHT: 0, categorie: 'mat', section: true, qte: qteTitre > 1 ? qteTitre : 0 });
        return;
      }
      const categorie: 'mo' | 'mat' = heuresVendues > 0 ? 'mo' : 'mat';
      const metier = categorie === 'mo' ? detecterMetier(app, designation) || detecterMetier(app, titre) : '';
      lignes.push({ num: num_, designation, metier, heuresVendues, caHT, categorie, qte: qteDetail || qteTitre, puht, mult: mult !== 1 ? mult : undefined });
    });
    // n° chantier : préfixe numérique du Titre, sinon du numDevis
    const numFromTitre = (m.titreFirst.match(/^(\d{3,})/) || [])[1];
    const numFromDevis = (nd.match(/(\d{3,})/) || [])[1];
    const chantier = m.chantier || numFromTitre || numFromDevis || nd;
    const d: Devis = {
      numDevis: nd, chantier, nom: m.titreFirst || nd,
      client: m.client, chargeAffaire: m.charge, chefProjet: '', statut: '',
      dateImport: Date.now(), lignes,
    };
    appliquerRegistre(app, d);
    out.push(d);
  }
  return out;
}

/* ------------------------------- État vide ---------------------------------- */
export const emptyApp = (): AppData => ({
  rh: [], devis: [], heures: [], registre: [], metiers: [], postes: [], chargesAffaire: [], chefsProjet: [], parsing: [],
  meta: { coef: 1.5, posteMap: {} },
});
