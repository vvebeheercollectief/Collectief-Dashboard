// ══════════════════════════════════════
//  ZELFTEST — index.html?test=1 (lokaal en in GitHub Actions via tools/zelftest.mjs)
// ══════════════════════════════════════
// Draait het hele dashboard tegen een NAGEBOOTSTE Google Sheet (NepSheet hieronder): elke
// fetch naar sheets.googleapis.com wordt hier beantwoord. Zo toetsen we de echte schrijfwegen
// (rij invoegen, afronden naar 'Afgerond', ongedaan maken, vinkjes) zonder Google.
// Uitslag: window._testResult = "N PASS, M FAIL". Staat NIET in de productiebuild (tools/bouw.mjs).
import { state, D } from './state.js';
import { APP_VERSION, EMAIL_NAMES, TAB, TAKEN_KOP } from './config.js';
import { emailHash } from './hash.js';
import { veiligeCel, _isOffline } from './api.js';
import { loadAll } from './data.js';
import { blokken, invoegNa, parseDossiers, vindDossier, parseAlvo, parseTaken, dossierInhoud, vindAlvoRij } from './parse.js';
import { parseDatum, naarSheetDatum, wanneer, dagenTot, naarISO } from './util.js';
import { vergelijkVersie, versieTeOud } from './versie.js';
import { goTo, beantwoordBevestiging } from './ui.js';
import { kiesLijst, ikZelf } from './taken.js';
import { archiefNaam, blokkenVan } from './alv.js';
import { zoekVves } from './vve.js';
import { NepSheet, ntd, af, alvo, alfa } from '../tools/nepsheet.mjs';

// ── Mini-testkader ──────────────────────────────────────────────────────
let pass=0, fail=0;
const fouten=[];
function ok(v, wat){ if(v){ pass++; } else { fail++; fouten.push(wat); console.log('FAIL', wat); } }
const gelijk = (a,b,wat) => ok(JSON.stringify(a)===JSON.stringify(b), `${wat} — kreeg ${JSON.stringify(a)}, verwacht ${JSON.stringify(b)}`);
async function toets(naam, fn){
  try{ await fn(); }
  catch(e){ fail++; fouten.push(`${naam}: ${e && e.message}`); console.log('FAIL', naam, e && e.stack); }
}
const wacht = ms => new Promise(r=>setTimeout(r,ms));
async function rustig(max=5000){
  const t0=Date.now();
  await wacht(20);
  while((state.pendingWrites>0 || state._loadInFlight) && Date.now()-t0<max) await wacht(20);
  await wacht(30);
}
const $ = id => document.getElementById(id);
const klik = el => { if(!el) throw new Error('element niet gevonden'); el.click(); };
function vink(el){ if(!el) throw new Error('vinkje niet gevonden'); el.checked=true; el.dispatchEvent(new Event('change',{bubbles:true})); }
function typ(el, tekst){ el.value=tekst; el.dispatchEvent(new Event('input',{bubbles:true})); }
function verstuur(form){ form.requestSubmit(); }

// ── De toetsen ──────────────────────────────────────────────────────────
async function draai(){
  state._zelftestLoopt=true;
  // Pure functies
  await toets('util', ()=>{
    gelijk(parseDatum('14 november 2026'), {y:2026,m:11,d:14}, 'parseDatum lang');
    gelijk(parseDatum('14-11-2026'), {y:2026,m:11,d:14}, 'parseDatum kort');
    gelijk(parseDatum('31-02-2026'), null, 'parseDatum onmogelijke datum');
    gelijk(naarSheetDatum('2026-11-04'), '04-11-2026', 'naarSheetDatum');
    gelijk(naarISO('4 nov 2026'), '2026-11-04', 'naarISO');
    const nu=new Date(2026,10,10);
    gelijk(wanneer('06-11-2026', nu), '4 dagen te laat', 'wanneer te laat');
    gelijk(wanneer('10-11-2026', nu), 'Vandaag', 'wanneer vandaag');
    gelijk(wanneer('11-11-2026', nu), 'Morgen', 'wanneer morgen');
    gelijk(wanneer('14-11-2026', nu), 'za 14 nov', 'wanneer later');
    gelijk(dagenTot('', nu), null, 'dagenTot zonder datum');
  });
  await toets('api', ()=>{
    gelijk(veiligeCel('=SOM(A1)'), "'=SOM(A1)", 'formule wordt tekst');
    gelijk(veiligeCel('021002'), "'021002", 'voorloopnul blijft');
    gelijk(veiligeCel('1042'), '1042', 'gewone code ongemoeid');
    ok(_isOffline(true, 2) && !_isOffline(true, 1) && _isOffline(false, 0), 'offline-regel');
  });
  await toets('versie', async ()=>{
    ok(vergelijkVersie('16.0','15.7')>0 && vergelijkVersie('15.10','15.9')>0, 'versies vergelijken');
    const sw=await (await fetch('sw.js',{cache:'no-store'})).text();
    ok(sw.includes(`const APP_VERSION = '${APP_VERSION}'`), 'sw.js draagt dezelfde APP_VERSION als config.js');
    const min=(await (await fetch('versie.json',{cache:'no-store'})).json()).minimaal;
    ok(!versieTeOud(APP_VERSION, min), 'versie.json minimaal is niet hoger dan APP_VERSION');
    for(const f of ['config','hash','state','util','api','auth','login-splash','sw-update','versie','data','parse','ui','iconen','vve','taken','dossiers','alv','main']){
      ok(sw.includes(`'./src/${f}.js'`), `src/${f}.js staat in APP_SHELL`);
    }
  });
  await toets('parse', ()=>{
    const rijen=ntd();
    const b=blokken(rijen);
    gelijk(Object.keys(b), ['OPPAKKEN','VERGADERVERZOEKEN','OFFERTE-TRAJECTEN','LOD','SUBSIDIE-TRAJECTEN','CRM'], 'alle zes de blokken herkend');
    gelijk(b.LOD.rijen.map(x=>x.row), [12,13,14], 'LOD-rijen');
    gelijk(invoegNa(b.LOD), 14, 'invoegen na de laatste LOD-rij');
    gelijk(invoegNa(b['OFFERTE-TRAJECTEN']), 9, 'leeg blok: invoegen na de kolomkop');
    const d=parseDossiers(rijen);
    gelijk(d.LOD.length, 3, 'drie LOD-dossiers');
    gelijk(d['SUBSIDIE-TRAJECTEN'].map(r=>r.code), ['1529','1455'], 'CRM-rij telt niet als subsidie');
    gelijk(d['SUBSIDIE-TRAJECTEN'][0].subsidieFase, 'In behandeling', 'fase uit kolom D');
    const zonderNr=d.LOD[2];
    gelijk(vindDossier(rijen, zonderNr)?.row, 14, 'dossier zonder taaknummer gevonden op inhoud');
    const geschoven=[['X'],...rijen];
    gelijk(vindDossier(geschoven, d.LOD[0])?.row, 13, 'dossier gevonden op taaknummer na verschuiving');
    ok(dossierInhoud({...d.LOD[1], deadline:'14-11-2026'})===dossierInhoud(d.LOD[1]), 'deadline-notatie telt niet als wijziging');
    const a=parseAlvo(alvo());
    gelijk(a.map(r=>r.status), ['Gepland','Klaargezet','Open','Afgerond','Open'], 'ALV-status');
    ok(a[2].budget, 'Budget herkend');
    gelijk(vindAlvoRij(alvo(), '1455'), 5, 'ALV-rij op code');
    gelijk(blokkenVan([3,4,5,8,9]), [{start:3,eind:5},{start:8,eind:9}], 'aaneengesloten blokken');
    gelijk(archiefNaam(2026, ['ALV-archief 2026']), 'ALV-archief 2026 (2)', 'archiefnaam loopt door');
    gelijk(parseTaken([TAKEN_KOP, ['M1','Jer','Bellen','','','','','']]).length, 1, 'parseTaken');
  });

  // ── Integratie: het dashboard tegen de nep-Sheet ──
  const sheet=new NepSheet({ [TAB.NTD]:ntd(), [TAB.AF]:af(), [TAB.ALVO]:alvo(), [TAB.ALFA]:alfa() });
  window._nepSheet=sheet;
  const echteFetch=window.fetch.bind(window);
  window.fetch=async (url, opts)=>{
    const s=String(url);
    if(s.startsWith('https://sheets.googleapis.com/')) return sheet.antwoord(s, opts);
    if(s.startsWith('https://www.googleapis.com/oauth2/v3/userinfo')) return new Response(JSON.stringify({ email:'jer@test.nl' }));
    return echteFetch(url, opts);
  };
  EMAIL_NAMES[emailHash('jer@test.nl')]='Jer';
  Object.assign(state, { oauthToken:'test', oauthExpiry:Date.now()+36e5, currentUserEmail:'jer@test.nl' });
  $('login-gate').style.display='none';
  $('app').removeAttribute('inert');

  await toets('laden zonder tabblad Mijn taken', async ()=>{
    ok(await loadAll(), 'eerste lading gelukt');
    ok(state.takenTabOntbreekt, 'ontbrekend tabblad opgemerkt');
    gelijk(D.dossiers.LOD.length, 3, 'LOD geladen');
    gelijk(ikZelf(), 'Jer', 'naam bij het account');
    gelijk($('tel-lod').textContent, '3', 'teller LOD in het menu');
  });

  await toets('taak toevoegen maakt het tabblad aan', async ()=>{
    goTo('taken');
    typ($('nieuw-taak'), 'Accountant bellen');
    typ($('nieuw-vve'), 'linde');
    const sug=document.querySelector('#taken-nieuw .sug-item');
    ok(!!sug, 'VvE-suggestie verschijnt');
    sug.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    gelijk($('nieuw-vve').value, '1042 VvE Lindehof', 'VvE gekozen');
    verstuur($('taken-nieuw'));
    ok(document.querySelector('#taken-rijen .rij')?.textContent.includes('Accountant bellen'), 'meteen in beeld');
    await rustig();
    const tab=sheet.tab(TAB.TAKEN);
    ok(!!tab, "tabblad 'Mijn taken' aangemaakt");
    gelijk(tab.rows[0], TAKEN_KOP, 'kopregel geschreven');
    gelijk(tab.rows[1].slice(1,6), ['Jer','Accountant bellen','1042','VvE Lindehof',''], 'taak opgeslagen');
    gelijk($('nieuw-taak').value, '', 'invoerveld weer leeg');
    gelijk($('tel-taken').textContent, '1', 'teller Mijn taken');
  });

  await toets('lege taak wordt niet opgeslagen', async ()=>{
    const voor=sheet.tab(TAB.TAKEN).rows.length;
    typ($('nieuw-taak'), '   ');
    verstuur($('taken-nieuw'));
    await rustig();
    gelijk(sheet.tab(TAB.TAKEN).rows.length, voor, 'niets bijgekomen');
    gelijk($('nieuw-taak').getAttribute('aria-invalid'), 'true', 'veld gemarkeerd');
  });

  await toets('afvinken en ongedaan maken', async ()=>{
    typ($('nieuw-taak'), 'Map aanmaken'); typ($('nieuw-vve'), ''); verstuur($('taken-nieuw'));
    await rustig();
    const t=D.taken.find(x=>x.taak==='Map aanmaken');
    vink(document.querySelector(`#taken-rijen input[data-id="${t.id}"]`));
    ok(!document.querySelector(`#taken-rijen [data-id="${t.id}"]`), 'uit beeld na afvinken');
    ok(!$('snack').hidden, 'balk met Ongedaan maken');
    await rustig();
    const rij=sheet.tab(TAB.TAKEN).rows.find(r=>r[0]===t.id);
    ok(/^\d{2}-\d{2}-\d{4}$/.test(rij[7]), 'datum in kolom H');
    klik(document.querySelector('#snack .snack-knop'));
    await wacht(50); await rustig();
    gelijk(sheet.tab(TAB.TAKEN).rows.find(r=>r[0]===t.id)[7]||'', '', 'kolom H weer leeg');
    ok(!!document.querySelector(`#taken-rijen [data-id="${t.id}"]`), 'terug in beeld');
  });

  await toets('taak aanpassen op de plek zelf', async ()=>{
    const t=D.taken.find(x=>x.taak==='Accountant bellen');
    klik(document.querySelector(`#taken-rijen [data-actie="taak-bewerk"][data-id="${t.id}"]`));
    const form=document.querySelector('#taken-rijen form.bewerk');
    ok(!!form, 'bewerkregel open');
    form.elements.taak.value='Accountant bellen over jaarstukken';
    form.elements.notitie.value='Voor vrijdag';
    verstuur(form);
    await rustig();
    const rij=sheet.tab(TAB.TAKEN).rows.find(r=>r[0]===t.id);
    gelijk(rij.slice(2,6), ['Accountant bellen over jaarstukken','1042','VvE Lindehof','Voor vrijdag'], 'aanpassing opgeslagen');
  });

  await toets('meekijken bij een collega', async ()=>{
    sheet.tab(TAB.TAKEN).rows.push(['Mx1','Cihad','Opdracht schilder bevestigen','1187','VvE Parkzicht','','10-11-2026 09:00','']);
    await loadAll(true);
    kiesLijst('Cihad');
    gelijk($('taken-titel').textContent, 'Taken van Cihad', 'titel');
    ok($('taken-nieuw').hidden && !$('taken-info').hidden, 'geen invoerregel, wel de melding');
    ok(document.querySelector('#taken-rijen input[type=checkbox]').disabled, 'afvinken uit');
    ok(!document.querySelector('#taken-rijen [data-actie="taak-bewerk"]'), 'niet te bewerken');
    kiesLijst('Jer');
    ok(!$('taken-nieuw').hidden, 'eigen lijst: invoerregel terug');
  });

  await toets('LOD: nieuw dossier', async ()=>{
    goTo('lod');
    klik(document.querySelector('[data-actie="dossier-nieuw"][data-sec="LOD"]'));
    ok($('dossier-bg').classList.contains('open'), 'venster open');
    verstuur($('dos-form'));
    ok(!$('dos-fout').hidden, 'foutmelding zonder VvE');
    typ($('dos-vve'), '1455');
    document.querySelector('#dossier-bg .sug-item').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    $('dos-oms').value='Achterstand nr. 9'; $('dos-status').value='Eerste brief'; $('dos-beh').value='Gabos'; $('dos-deadline').value='2026-12-01';
    verstuur($('dos-form'));
    ok(!$('dossier-bg').classList.contains('open'), 'venster dicht');
    await rustig();
    const lod=blokken(sheet.tab(TAB.NTD).rows).LOD.rijen;
    const nieuw=lod[lod.length-1].waarden;
    gelijk(nieuw.slice(0,7), ['1455','VvE Westerhaven','Achterstand nr. 9','Eerste brief','Gabos','01-12-2026',''], 'rij aan het eind van LOD');
    ok(/^T/.test(nieuw[16]), 'taaknummer in kolom Q');
    gelijk(blokken(sheet.tab(TAB.NTD).rows)['SUBSIDIE-TRAJECTEN'].rijen.length, 2, 'Subsidie-blok ongemoeid');
  });

  await toets('LOD: afronden en ongedaan maken', async ()=>{
    const r=D.dossiers.LOD.find(x=>x.taakId==='Tl001');
    vink(document.querySelector(`input[data-actie="dossier-af"][data-sleutel="Tl001"]`));
    ok(!D.dossiers.LOD.includes(r), 'uit beeld');
    await rustig();
    ok(!blokken(sheet.tab(TAB.NTD).rows).LOD.rijen.some(x=>x.waarden[16]==='Tl001'), "weg uit 'Nog Te Doen'");
    const arch=blokken(sheet.tab(TAB.AF).rows).LOD.rijen.find(x=>x.waarden[16]==='Tl001');
    ok(!!arch, "in 'Afgerond' onder LOD");
    ok(/^\d{2}-\d{2}-\d{4}$/.test(arch?.waarden[8]||''), 'afronddatum in kolom I');
    klik(document.querySelector('#snack .snack-knop'));
    await wacht(50); await rustig();
    ok(blokken(sheet.tab(TAB.NTD).rows).LOD.rijen.some(x=>x.waarden[16]==='Tl001'), "terug in 'Nog Te Doen'");
    ok(!blokken(sheet.tab(TAB.AF).rows).LOD.rijen.some(x=>x.waarden[16]==='Tl001'), "weer weg uit 'Afgerond'");
  });

  await toets('LOD: aanpassen, en een collega was je voor', async ()=>{
    const r=D.dossiers.LOD.find(x=>x.taakId==='Tl002');
    klik(document.querySelector('[data-actie="dossier-open"][data-sleutel="Tl002"]'));
    $('dos-status').value='Regeling getroffen';
    verstuur($('dos-form'));
    await rustig();
    const rij=blokken(sheet.tab(TAB.NTD).rows).LOD.rijen.find(x=>x.waarden[16]==='Tl002');
    gelijk(rij.waarden[3], 'Regeling getroffen', 'status opgeslagen');
    // Nu wijzigt een collega de rij in de Sheet, en wij slaan op met de oude stand in beeld.
    rij.waarden[2]='Door collega aangepast';
    klik(document.querySelector('[data-actie="dossier-open"][data-sleutel="Tl002"]'));
    $('dos-opm').value='Mijn opmerking';
    verstuur($('dos-form'));
    await rustig();
    const na=blokken(sheet.tab(TAB.NTD).rows).LOD.rijen.find(x=>x.waarden[16]==='Tl002');
    gelijk(na.waarden[2], 'Door collega aangepast', 'wijziging van de collega niet overschreven');
    ok(!(na.waarden[6]||'').includes('Mijn opmerking'), 'eigen wijziging niet opgeslagen');
    ok(!!document.querySelector('#toasts .toast-fout'), 'foutmelding getoond');
    gelijk(D.dossiers.LOD.find(x=>x.taakId==='Tl002')?.actiepunt, 'Door collega aangepast', 'scherm toont de nieuwe stand');
    document.querySelectorAll('#toasts .toast-x').forEach(x=>x.click());
  });

  await toets('Subsidie: fase wijzigen', async ()=>{
    goTo('subsidie');
    klik(document.querySelector('[data-actie="dossier-fase"][data-sleutel="Ts002"][data-stap="4"]'));
    await rustig();
    const rij=blokken(sheet.tab(TAB.NTD).rows)['SUBSIDIE-TRAJECTEN'].rijen.find(x=>x.waarden[16]==='Ts002');
    gelijk(rij.waarden[3], 'Verleend', 'fase in kolom D');
  });

  await toets('ALV: vinkjes en notulen naar het archief', async ()=>{
    goTo('alvo');
    klik(document.querySelector('[data-actie="alvo-vlag"][data-code="1187"][data-veld="uitnodiging"]'));
    await rustig();
    gelijk(sheet.tab(TAB.ALVO).rows[3][2], 'TRUE', 'uitnodiging aangevinkt in kolom C');
    gelijk(D.alvo.find(r=>r.code==='1187').status, 'Gepland', 'status Gepland');
    const voor=sheet.tab(TAB.ALFA).rows.length;
    klik(document.querySelector('[data-actie="alvo-vlag"][data-code="1042"][data-veld="notulen"]'));
    await rustig();
    gelijk(sheet.tab(TAB.ALVO).rows[2][3], 'TRUE', 'notulen in kolom D');
    gelijk(sheet.tab(TAB.ALFA).rows.length, voor+1, 'één regel in het archief');
    gelijk(sheet.tab(TAB.ALFA).rows[voor][0], '1042', 'juiste VvE in het archief');
  });

  await toets('ALV: nieuwe ronde', async ()=>{
    klik(document.querySelector('[data-actie="alvo-ronde"]'));
    await wacht(20);
    ok($('bevestig-bg').classList.contains('open'), 'vraag gesteld');
    beantwoordBevestiging(true);
    await wacht(50); await rustig();
    const naam=Object.keys(sheet.tabs).find(t=>t.startsWith('ALV-archief'));
    ok(!!naam, 'archieftabblad gemaakt');
    gelijk(sheet.tab(naam).rows[3][2], 'TRUE', 'archief bewaart de oude stand');
    ok(sheet.tab(TAB.ALVO).rows.slice(2).every(r=>[2,3,4,6].every(k=>r[k]==='FALSE')), 'alle vinkjes uit');
    gelijk(sheet.tab(TAB.ALVO).rows[1][0], 'Totaal', 'tellerregel ongemoeid');
  });

  await toets('VvE zoeken', ()=>{
    gelijk(zoekVves('hofzicht').map(r=>r.code), ['1529'], 'op naam');
    gelijk(zoekVves('hof').map(r=>r.code), ['1042','1529'], 'deel van een naam');
    gelijk(zoekVves('').length, 0, 'leeg = niets');
  });

  goTo('taken');
  state._zelftestLoopt=false;
  window._testFouten=fouten;
  window._testResult=`${pass} PASS, ${fail} FAIL`;
  console.log('Zelftest:', window._testResult);
  const b=document.createElement('div');
  b.className='banner'; b.style.top='auto'; b.style.bottom='12px';
  b.textContent=`Zelftest: ${window._testResult}`;
  document.body.appendChild(b);
}

draai();
