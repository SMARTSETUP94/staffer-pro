import {describe,it,expect} from 'vitest';
import {extractOriginalMessage,resoudreTransfert} from '../forwarded-email';
const body='From: Collègue <c@groupe-smart.fr>\nSubject: Fw: Devis\nDe : Marie Curie <marie@proman.fr>\nEnvoyé : vendredi 6 novembre 2026 09:12\nÀ : smart@setup.paris\nCc : x@setup.paris\nObjet : TR: Mur interactif\nBonjour\nSociété : PROMAN';
describe('demandes transférées',()=>{
it('associe premier externe, date Paris, objet et société',()=>expect(extractOriginalMessage(body)).toMatchObject({email:'marie@proman.fr',name:'Marie Curie',date:'2026-11-06T08:12:00.000Z',subject:'Mur interactif',company:'PROMAN'}));
it('lit Outlook anglais HTML',()=>expect(extractOriginalMessage('<div>From: Jane &lt;jane@client.fr&gt;</div><div>Sent: November 6, 2026 9:12 AM</div><div>Subject: Fwd: Project</div>')).toMatchObject({email:'jane@client.fr',date:'2026-11-06T08:12:00.000Z',subject:'Project'}));
it('garde la source smart inchangée',()=>expect(resoudreTransfert({from_email:'smart@setup.paris',from_name:'Smart',subject:'TR: Devis',body_full:body,source_boite:'smart'})).toBeNull());
it('garde un mail externe direct intact',()=>expect(resoudreTransfert({from_email:'marie@proman.fr',from_name:'Marie',subject:'Devis',body_full:body,source_boite:'devis'})).toBeNull());
it('échec : conserve transmetteur et marque le client',()=>expect(resoudreTransfert({from_email:'smart@setup.paris',from_name:'Smart',subject:'Fw: Devis',body_full:'Bonjour',source_boite:'devis'})).toMatchObject({from_email:'smart@setup.paris',transmis_par:'smart@setup.paris',client_a_identifier:true}));
it('recalcul idempotent et ne touche pas au statut',()=>{const row={from_email:'smart@setup.paris',from_name:'Smart',subject:'TR: Devis',body_full:body,source_boite:'devis'};const p=resoudreTransfert(row);expect(p).not.toHaveProperty('statut');expect(resoudreTransfert({...row,...p})).toEqual(p);});
it('adresse grand public sans société inventée',()=>expect(extractOriginalMessage('De : Jane <jane@gmail.com>\nObjet : Devis')).toMatchObject({company:null,date:null}));
});