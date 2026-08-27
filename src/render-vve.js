// ══════════════════════════════════════
//  PER-VVE-PAGINA — alles van één VvE op één scherm (Fase 5)
// ══════════════════════════════════════
import { esc, displayName, persBadges, splitBehandelaar, berekenPrioriteit, opvolgStatus, parseDt, taakTitel, taakVerwijzing, _vandaagAmsterdam, _verschilInKalenderdagen } from "./util.js";
import { ico } from "./icons.js";
import { SECS, SKEYS, PAGE_META } from "./config.js";
import { state, D } from "./state.js";
import { verseRij } from "./rij.js";
import { goTo } from "./ui.js";
import { fmtLogTs, logItemHtml, logDayLabel, logPaginaSoort, _herankerLogEdit } from "./render-overig.js";
import { vveKenmerken, KENMERK_WAARDEN } from "./kenmerken.js";
import { backgroundWrite, blokkeerOffline } from "./data.js";
import { initStapelSlepen } from "./bundel-acties.js";
import { STAPEL_GREEP } from "./render-bundel.js";
import { bouwBundelIndex, bundelVerwijzing, bundelSleutel, zelfdeTaak, opBundelVolg } from "./bundel.js";
import { appendRange } from "./api.js";
import { ensureToken } from "./auth.js";
import { getCurrentWho } from "./notifications.js";
import { opmaakHtml, opmaakBalk } from "./opmaak.js";
// (kringverwijzing render-vve ⇄ ui/kenmerken is hetzelfde patroon als crud ⇄ main:
//  live bindings, de aanroep gebeurt pas op runtime)

// Pure helper (testbaar zonder DOM): verzamelt alles van één VvE uit de D-data.
// Let op: _verschilInKalenderdagen(a,b) rekent a−b in dagen; (vandaag, t) geeft
// dus "dagen geleden" als positief getal.
function vveOverzicht(code, data, vandaag){
  vandaag = vandaag || _vandaagAmsterdam();
  const open=[], weggelegd=[];
  SKEYS.forEach(s=>(data.ntd[s]||[]).forEach(r=>{
    if(r.code!==code) return;
    if(opvolgStatus(r, vandaag).weggelegd) weggelegd.push(r); else open.push(r);
  }));
  // open: te laat eerst, dan vroegste deadline
  open.sort((a,b)=>{
    const pa=berekenPrioriteit(a.deadline,a._sec,vandaag), pb=berekenPrioriteit(b.deadline,b._sec,vandaag);
    if(pa.teLaat!==pb.teLaat) return pa.teLaat?-1:1;
    return (parseDt(a.deadline)||Infinity)-(parseDt(b.deadline)||Infinity);
  });
  weggelegd.sort((a,b)=>parseDt(a.opvolgdatum)-parseDt(b.opvolgdatum));
  const afgerond=[];
  SKEYS.forEach(s=>(data.af[s]||[]).forEach(r=>{ if(r.code===code) afgerond.push(r); }));
  afgerond.sort((a,b)=>parseDt(b.datum)-parseDt(a.datum));
  const teLaat=open.filter(r=>berekenPrioriteit(r.deadline,r._sec,vandaag).teLaat).length;
  const logboek=(data.logboek||[]).filter(e=>e.code===code)
    .slice().sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  let laatsteDagen=null;
  if(logboek.length){
    const t=new Date(logboek[0].timestamp);
    if(!isNaN(t)) laatsteDagen=_verschilInKalenderdagen(vandaag,t);
  }
  const alvo=(data.alvo||[]).find(r=>r.code===code)||null;
  const alfa=(data.alfa||[]).filter(r=>r.code===code)
    .sort((a,b)=>parseDt(b.datum)-parseDt(a.datum)); // nieuwste eerst → alfa[0] = laatst gehouden
  const naam=(open[0]?.naam)||(weggelegd[0]?.naam)||(alvo?.naam)||(afgerond[0]?.naam)||'';
  const behandelaars=[...new Set(open.concat(weggelegd)
    .flatMap(r=>splitBehandelaar(r.behandelaar)))];
  return { code, naam, behandelaars, open, weggelegd, afgerond, alvo, alfa, logboek,
           budget: !!(alvo&&alvo.budget), // Budgetpakket-markering uit het ALV-overzicht (kolom F)
           cijfers:{ open:open.length, teLaat, weggelegd:weggelegd.length, laatsteDagen } };
}

// Pure helper (testbaar): omschrijving van een afgeronde regel.
// Een rij zonder tekst mag niet als kale datum in beeld komen (leest als een fout).
// We verzinnen niets: we vallen terug op het sectielabel dat wél in de data zit.
function afOmschrijving(r){
  const label=(SECS[r._sec]||{}).label||'Onbekende sectie';
  // taakTitel vangt ook de offerte-rijen af (die hebben geen actiepunt-veld); valt hij
  // terug op de kale sectienaam, dan is er echt geen omschrijving.
  const tekst=taakTitel(r, r._sec).trim();
  if(tekst && tekst!==label) return { tekst, leeg:false };
  return { tekst:`${label} — geen omschrijving`, leeg:true };
}

// Dossier-logboek: contactsoorten, filter en feed-opbouw
const CONTACT_SOORTEN=[['Telefoon',ico('telefoon')],['E-mail',ico('envelop')],['Gesprek',ico('gesprek')],['Notitie',ico('potlood')]];

// Pure helper (testbaar): 'contact' = alleen handmatige contactmomenten
function filterDossierLog(entries, modus){
  return modus==='contact' ? entries.filter(e=>e.actie==='Contact') : entries;
}

function dossierFeed(entries){
  if(!entries.length) return '<div class="log-empty">Nog geen gebeurtenissen in dit dossier.</div>';
  let html='',lastDay='';
  entries.forEach(r=>{
    const dag=logDayLabel(r.timestamp);
    if(dag!==lastDay){ html+=`<div class="log-day">${dag}</div>`; lastDay=dag; }
    // Eigen notities/contactmomenten blijven volwaardig en bewerkbaar. Alles wat de app
    // zelf logt wordt een gedempte dunne regel — wel per stuk verwijderbaar, want ze
    // samenvatten zou dat onmogelijk maken.
    const eigen=logPaginaSoort(r.actie)==='normaal';
    html+=logItemHtml(r, !eigen, true, {zonderCode:true});
  });
  return html;
}

// Handmatig contactmoment vastleggen (composer op de VvE-pagina)
async function addContactLog(){
  const tekst=(document.getElementById('dos-tekst')?.value||'').trim();
  if(!tekst){ alert('Typ eerst wat er gebeurd is.'); return; }
  const code=state.vveCode;
  if(!code) return;
  if(blokkeerOffline()) return;   // offline: niets wijzigen, ook niet optimistisch
  if(!await ensureToken()){ alert('Inloggen mislukt.'); return; }
  const soort=state._contactSoort||'Telefoon';
  const wie=document.getElementById('dos-wie')?.value||'Overig';
  const who=getCurrentWho()||'?', ts=new Date().toISOString();
  const entry={_row:0,timestamp:ts,code,sectie:'',actie:'Contact',veld:soort,oudeWaarde:wie,nieuweWaarde:tekst,gebruiker:who};
  D.logboek.unshift(entry);
  const t=document.getElementById('dos-tekst'); if(t) t.value='';
  renderVve();
  backgroundWrite(
    ()=>appendRange("'Logboek'!A:H",[ts,code,'','Contact',soort,wie,tekst,who]),
    // vorm-ok: object-identiteit mag hier. Dit is een OPTIMISTISCHE regel (`_row:0`) die we in
    // deze tik zelf hebben aangemaakt, en `_verwerkLogboek` (data.js) tilt juist díé regels op
    // identiteit mee naar de nieuwe lijst. Het object overleeft een poll dus gegarandeerd.
    ()=>{ const i=D.logboek.indexOf(entry); if(i>-1) D.logboek.splice(i,1); },   // vorm-ok: eigen optimistische regel, zie hierboven
    'Contactmoment vastleggen'
  );
}

// Kenmerken-kaart: weergave- of bewerkmodus (Beheerderskenmerken)
const KMK_PIL={'Gemeenschappelijk':'background:var(--gn-l);color:var(--gn)','Individueel':'background:var(--ac-l);color:var(--ac)'};
const kmkPil=v=>{const w=v||'Onbekend';return `<span class="badge" style="${KMK_PIL[w]||'background:var(--sur2);color:var(--mut)'}">${esc(w)}</span>`;};
function kenmerkenKaart(code){
  const k=vveKenmerken(code,D);
  if(state.kenmerkenEdit){
    const sel=(id,val)=>`<select id="${id}">${KENMERK_WAARDEN.map(w=>`<option${(val||'Onbekend')===w?' selected':''}>${w}</option>`).join('')}</select>`;
    // Echte <label for=…> en geen <span>: deze drie velden worden pas bij het bewerken getekend en
    // vielen daarmee buiten de eenmalige koppelpas bij het opstarten (modal-a11y.js). Ze waren de
    // enige naamloze velden die er nog waren — en een klik op het woord 'Balkons' deed niets.
    return `<div class="kmk-rij"><label for="kmk-balkons">Balkons</label>${sel('kmk-balkons',k.balkons)}</div>
      <div class="kmk-rij"><label for="kmk-kozijnen">Kozijnen</label>${sel('kmk-kozijnen',k.kozijnen)}</div>
      <label class="kmk-bron-lbl" for="kmk-bron">Bron</label>
      <div class="opmaak-veld">
        <textarea id="kmk-bron" data-code="${esc(code)}" rows="2" placeholder="bv. splitsingsakte art. 17, mail gemeente 03-2024">${esc(k.bron)}</textarea>
        ${opmaakBalk()}
      </div>
      <div class="kmk-knoppen">
        <button class="btn btn-sec btn-sm" data-action="kenmerken-annuleren">Annuleren</button>
        <button class="btn btn-pri btn-sm" data-action="kenmerken-opslaan">Opslaan</button>
      </div>`;
  }
  const wijz=k.gewijzigdOp?`<div class="kmk-wijz">laatst gewijzigd door ${esc(displayName(k.gewijzigdDoor)||'?')} · ${esc(fmtLogTs(k.gewijzigdOp))}</div>`:'';
  return `<div class="kmk-rij"><span>Balkons</span>${kmkPil(k.balkons)}</div>
    <div class="kmk-rij"><span>Kozijnen</span>${kmkPil(k.kozijnen)}</div>
    <div class="kmk-bron-lbl">Bron</div>
    <div class="kmk-bron">${k.bron?opmaakHtml(k.bron):'<span style="color:var(--mut)">Nog geen bron vastgelegd</span>'}</div>${wijz}`;
}

// Pure helper (testbaar zonder DOM): waar brengt het terug-pijltje je heen?
// Alleen een echte, andere pagina telt; anders is Nog Te Doen het vangnet.
function terugDoel(v){
  return (v && v!=='vve' && PAGE_META[v]) ? v : 'ntd';
}

// Terug-pijltje in de dossier-kop: naar de pagina waar je vandaan kwam.
function terugVanDossier(){
  goTo(terugDoel(state.vveTerug));
}

// Navigeer naar het dossier van een VvE (en onthoud 'm voor het commandocentrum)
function openVvePagina(code){
  // Zonder VvE-code valt er geen dossier te openen. Het palet hing deze functie onvoorwaardelijk
  // aan élke logboektreffer, en niet elke logregel heeft een code: de ALV-reset schrijft er
  // bewust een met een lege kolom B. Klikken gaf dan een leeg dossier én zette een naamloze
  // regel in "Laatst bezochte VvE's" (localStorage), die daar zonder handmatig wissen bleef staan.
  if(!String(code||'').trim()) return;
  // Onthoud van welk scherm je kwam (dossier→dossier laat de oorsprong staan).
  const huidig=document.querySelector('.page.active')?.id?.replace('page-','');
  if(huidig&&huidig!=='vve') state.vveTerug=huidig;
  state.vveCode=code;
  state._vveAfAlles=false;
  state.kenmerkenEdit=false;
  state.vveLogFilter='alles';
  state._vveLogAlles=false;
  state.dosComposerOpen=false;
  state.logEdit=null;          // open bewerkformulier hoort bij het vórige dossier/scherm
  state.logEditTs=null;
  state.logEditSoort=null;
  try{
    const lijst=JSON.parse(localStorage.getItem('recentVves')||'[]').filter(c=>c!==code);
    lijst.unshift(code);
    localStorage.setItem('recentVves',JSON.stringify(lijst.slice(0,3)));
  }catch(e){}
  goTo('vve');
}

// Composer: standaard ingeklapt tot één regel; opent bij klik en blijft open tot je een ander dossier opent.
function composerHtml(code){
  if(!state.dosComposerOpen){
    return `<button type="button" class="comp-dicht" data-action="composer-openen">
      Leg vast wat er gebeurd is — bv. zojuist gebeld met een eigenaar…
      <span class="btn btn-pri btn-sm" aria-hidden="true">Vastleggen</span>
    </button>`;
  }
  return `<div class="dos-composer">
    <div class="opmaak-veld">
      <textarea id="dos-tekst" data-code="${esc(code)}" rows="2" aria-label="Leg vast wat er gebeurd is" placeholder="Leg vast wat er gebeurd is — bv. zojuist gebeld met een eigenaar… (Ctrl+Enter = vastleggen)"></textarea>
      ${opmaakBalk()}
    </div>
    <div class="dos-rij">
      <div class="dos-chips">${CONTACT_SOORTEN.map(([s,sIco])=>
        `<button class="soort-chip${(state._contactSoort||'Telefoon')===s?' aan':''}" data-action="contact-soort" data-soort="${s}">${sIco} ${s}</button>`).join('')}</div>
      <select id="dos-wie" title="Met wie was het contact?">
        <option>Bewoner/eigenaar</option><option>Bestuur</option><option>Leverancier</option><option>Overig</option>
      </select>
      <button class="btn btn-pri btn-sm" data-action="contact-vastleggen">Vastleggen</button>
    </div>
  </div>`;
}

// Stappen schuiven onder hun zichtbare kop — maar alleen als die kop óók in déze lijst staat.
// Koppelen mag over VvE's heen, en een kop kan weggelegd of afgerond zijn; in al die gevallen
// staat hij niet in `o.open` en blijft de stap gewoon op zijn eigen plek. De verwijzingsregel
// onder de rij is dan de enige aanwijzing — vandaar dat die er ook staat als er níet ingesprongen
// wordt.
//
// Geeft `{r, diep}` terug in tekenvolgorde. `diep` is 0 of 1: één laag diep, net als de bundel
// zelf.
//
// Harde eis: er verdwijnt nooit een rij. Wat de index ook beweert, elke binnengekomen rij komt
// er weer uit — een taak die stil uit het dossier valt is het ergste wat deze functie kan doen.
function groepeerBundels(rows, index){
  const lijst = rows || [];
  const kinderen = new Map();     // bundelsleutel → [rij, …]
  const romp = [];
  lijst.forEach(r => {
    const verw = bundelVerwijzing(r, index);
    if (verw && verw.rol === 'sub' && lijst.some(x => zelfdeTaak(x, verw.kopRij))){
      const sleutel = bundelSleutel(r.bundelId);
      if (!kinderen.has(sleutel)) kinderen.set(sleutel, []);
      kinderen.get(sleutel).push(r);
      return;
    }
    // `verw` verhuist mee naar de vlechtlus hieronder. Hem daar opnieuw ophalen betekende twee
    // plekken die hetzelfde moesten opleveren — precies wat deze functie voor het scherm juist
    // wil voorkómen.
    romp.push({ r, verw });
  });
  kinderen.forEach(leden => leden.sort(opBundelVolg));
  const uit = [];
  romp.forEach(({ r, verw }) => {
    uit.push({ r, diep:0 });
    if (verw && verw.rol === 'kop'){
      const sleutel = bundelSleutel(r.bundelId);
      (kinderen.get(sleutel) || []).forEach(c => uit.push({ r:c, diep:1 }));
      kinderen.delete(sleutel);
    }
  });
  // Vangnet: kinderen waarvan de kop tóch niet in de romp bleek te staan. Dit is DRAGENDE code en
  // geen dode regel, want de twee toetsen hierboven stellen verschillende vragen: `some` zoekt een
  // rij die volgens `zelfdeTaak` dezelfde taak is als de kop, terwijl de vlechtlus een rij nodig
  // heeft die zélf `rol:'kop'` meldt én dezelfde bundelsleutel draagt. Twee standen laten die
  // uiteenlopen, en allebei kunnen ze vandaag op productie voorkomen:
  //
  //  - Bij twee rijen ZONDER taaknummer valt `zelfdeTaak` terug op `_row`, en dat is volgens de
  //    voorwaarde die daar in bundel.js staat alleen betrouwbaar BINNEN één tabblad. Deze functie
  //    is de eerste aanroeper die die voorwaarde schendt: `o.open` mengt de rijen van alle vijf de
  //    secties door elkaar. Rij 12 van 'Oppakken' en rij 12 van 'LOD' gelden dan als dezelfde taak,
  //    dus `some` vindt een rij die met de bundel niets te maken heeft en die zich verderop
  //    natuurlijk niet als kop meldt.
  //  - Staat een taaknummer per ongeluk twee keer in de Sheet (`checkNummers` meldt dat aan de
  //    gebruiker), dan matcht `zelfdeTaak` op béíde rijen. Is die tweelinghelft zelf geen bundellid,
  //    dan gebeurt hier hetzelfde.
  //
  // In beide standen landt de stap hierdoor ONDERAAN in plaats van te verdwijnen. Dat is de veilige
  // kant op: een taak die stil uit het dossier valt is het ergste wat deze functie kan doen. De
  // eerste stand staat nagebouwd in de assert `dossier: een stap zonder échte kop valt onderaan,
  // niet weg` — die valt om zodra deze regel verdwijnt.
  kinderen.forEach(groep => groep.forEach(r => uit.push({ r, diep:0 })));
  return uit;
}

function renderVve(){
  const wrap=document.getElementById('vve-inhoud');
  if(!wrap) return;
  const code=state.vveCode;
  if(!code){ wrap.innerHTML=`<div class="empty"><div class="empty-ico">${ico('gebouw')}</div>Zoek een VvE via Ctrl+K of klik op een VvE-code</div>`; return; }
  const o=vveOverzicht(code,D);
  // Composer-behoud: de 8s-poll re-rendert deze pagina; half getypte tekst mag
  // niet verdwijnen — alleen bewaren als het om dezelfde VvE gaat.
  const _oudT=document.getElementById('dos-tekst');
  const _bewaar=(_oudT&&_oudT.dataset.code===code)?{tekst:_oudT.value,wie:document.getElementById('dos-wie')?.value}:null;
  // Half getypte tekst mag de 8s-poll overleven én de composer niet dichtklappen.
  if(_bewaar&&_bewaar.tekst.trim()) state.dosComposerOpen=true;
  // Ook een open logregel-bewerking overleeft de poll (zelfde mechaniek als renderLogboek,
  // gescoped op dit paneel: hetzelfde formulier staat óók op de Logboek-pagina).
  // De data-ts-vergelijking borgt regel-identiteit: bij wisselen van bewerkregel mag
  // de tekst van de vórige regel niet meeverhuizen (timestamp is shift-bestendig).
  const _leBox=document.querySelector('#vve-inhoud .log-edit');
  const _leTekstEl=_leBox?.querySelector('.log-edit-tekst');
  _herankerLogEdit();   // zelfde her-ankering als op de Logboek-pagina; zie render-overig.js
  const _leEntry=state.logEdit?(D.logboek||[]).find(x=>x._row===state.logEdit):null;
  const _leBewaar=(_leTekstEl && _leEntry && _leBox.dataset.ts===(_leEntry.timestamp||''))?{tekst:_leTekstEl.value,wie:_leBox.querySelector('.log-edit-wie')?.value}:null;
  // Kenmerken-behoud, om precies dezelfde reden als de composer hierboven — dit formulier had het
  // alleen nog niet. Het leest zijn waarden uit D, dus elke poll zette een half ingetypte bron en
  // een net gekozen waarde terug naar wat er in de Sheet stond. Gemeten: 'splitsingsakte artikel 17'
  // was na één hertekening leeg en Balkons stond weer op 'Onbekend'. Zelfde code-vergelijking als
  // bij de composer: wissel je van VvE, dan hoort de tekst niet mee te verhuizen.
  const _oudBron=document.getElementById('kmk-bron');
  const _kmkBewaar=(state.kenmerkenEdit && _oudBron && _oudBron.dataset.code===code)
    ? { bron:_oudBron.value,
        balkons:document.getElementById('kmk-balkons')?.value,
        kozijnen:document.getElementById('kmk-kozijnen')?.value } : null;
  // Waar stond de cursor? De waarde bewaren was maar de helft: het element zelf wordt vervangen,
  // dus de focus viel terug op <body> en de volgende aanslagen kwamen nergens terecht. Wie midden
  // in een zin zat, typte de rest in het niets. Alleen binnen dit paneel, en alleen voor velden
  // die we hierboven ook echt terugzetten.
  const _act=document.activeElement;
  const _focusHerstel=(()=>{
    if(!_act || !wrap.contains(_act)) return null;
    const opId=['dos-tekst','dos-wie','kmk-bron','kmk-balkons','kmk-kozijnen'].includes(_act.id);
    const opKlasse=['log-edit-tekst','log-edit-wie'].find(k=>_act.classList && _act.classList.contains(k));
    if(!opId && !opKlasse) return null;
    // selectionStart bestaat niet op een <select>; dan is er ook geen cursor om terug te zetten.
    return { id:opId?_act.id:null, klasse:opKlasse||null,
             start:_act.selectionStart ?? null, eind:_act.selectionEnd ?? null };
  })();
  // De topbar houdt de vaste paginatitel uit PAGE_META ("VvE-dossier");
  // code + naam staan al groot in de kop hieronder — niet dubbel tonen.

  // Eén index per render, gedeeld door de groepering en de labels eronder.
  const bIx = bouwBundelIndex(D.ntd, D.af);

  const taakRij=(r,weg,diep)=>{
    const rid=state._rowCache.length; state._rowCache.push(r);
    const sec=r._sec, p=berekenPrioriteit(r.deadline,sec);
    const meta=SECS[sec]||{css:'',label:(sec||'?')}; // vangnet: één rij zonder geldige sectie mag niet de hele dossierpagina blanco maken
    const dl=weg
      ? `<span class="pill-snooze" data-action="taak-wegleggen" data-rid="${rid}">terug op ${esc(r.opvolgdatum)}</span>`
      : r.deadline
        ? `${esc(r.deadline)}${p.teLaat?` <span class="pill-telaat">Te laat (${Math.abs(p.dagenTot)}d)</span>`:''}`
        : '<span class="warn-geen-deadline">Geen deadline</span>';
    // Wat deze rij binnen haar bundel is. Dezelfde bron als het merkje in de takentabel, dus
    // beide schermen kunnen niet iets anders beweren.
    const verw = bundelVerwijzing(r, bIx);
    // Letterlijk dezelfde pil als in de takentabel, tooltip incluis: op deze pagina staat nergens
    // het woord 'bundel' of 'subtaken', dus '0 van 1 klaar' achter een taaktitel is zonder
    // voorkennis een raadsel.
    const bdlPil = (verw && verw.rol === 'kop')
      ? `<span class="bdl-pill" title="${verw.klaar} van ${verw.totaal} subtaken klaar">${verw.klaar} van ${verw.totaal} klaar</span>` : '';
    // De verwijzingsregel staat er ÓÓK als de rij al is ingesprongen: bij inspringen alleen zie je
    // niet wélke taak het is zodra er twee bundels onder elkaar staan, en zonder inspringen (kop
    // bij een andere VvE, weggelegd of afgerond) is dit de enige aanwijzing.
    //
    // De hele zin staat ÓÓK in `title`, net als bij `bundelMerkje` in de takentabel. In het
    // 330px-paneel wordt de regel afgekapt (gemeten: 240 van 418px zichtbaar) en juist de
    // omschrijving — het enige dat de taak echt onderscheidt — valt er dan af. Zonder tooltip is
    // 'de enige aanwijzing' dus een aanwijzing die je niet kunt lezen.
    const stapZin = (verw && verw.rol === 'sub') ? `stap in: ${taakVerwijzing(verw.kopRij)}` : '';
    const stapIn = stapZin
      ? `<div class="tk-stapin" title="${esc(stapZin)}">${ico('bundel',11)} ${esc(stapZin)}</div>` : '';

    // Het sleep-handvat staat er hier ONVOORWAARDELIJK, anders dan in de takentabel: het dossier
    // kent de gestapelde weergave niet (geen chevron, geen paneel, geen filters die hem uitzetten),
    // dus er is ook geen stand waarin het gebaar hier niet mag. Dat is dezelfde afweging als bij de
    // aanroep van `initStapelSlepen` onderaan, die om die reden géén `magSlepen` meekrijgt.
    // role+tabindex: deze rij is de enige weg om een taak vanuit het dossier te openen en was met
    // alleen een klikbare <div> niet met het toetsenbord te bereiken. Geen <button>: er zit al een
    // afrond-knop ín deze rij en een knop in een knop is ongeldig. Enter/spatie loopt via de
    // centrale afhandeling in actions.js.
    return `<div class="tk tk-taak${weg?' snooze-row':''}${diep?' tk-stap':''}" role="button" tabindex="0" data-action="taak-bewerken" data-rid="${rid}" aria-label="Taak openen: ${esc(taakTitel(r,sec))}" style="cursor:pointer">
      ${STAPEL_GREEP}
      <span class="nm">${esc(taakTitel(r,sec))}${bdlPil}</span>
      <div class="tk-onder">
        <span class="mt">${esc(meta.label)}${r.behandelaar?' · '+esc(r.behandelaar):''}</span>
        <span class="dl">${dl}</span>
      </div>
      ${stapIn}
      <button class="act-af act-ico tk-af" data-action="taak-afronden" data-rid="${rid}" title="Afronden" aria-label="Afronden"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg></button></div>`;
  };
  const afLimiet=state._vveAfAlles?o.afgerond.length:5;
  const afRij=r=>{
    const om=afOmschrijving(r);
    return `<div class="tk">
      <span class="nm${om.leeg?' geen-oms':''}">${esc(om.tekst)}${r.opmerking?`<span class="mt">${esc(r.opmerking)}</span>`:''}</span>
      <span class="dl af">${esc(r.datum||'')}</span></div>`;
  };
  const meerKnop=(!state._vveAfAlles&&o.afgerond.length>5)
    ?`<button class="btn btn-sec btn-sm" data-action="vve-af-alles" style="margin-top:8px;align-self:flex-start">Alle ${o.afgerond.length} tonen</button>`:'';

  const alvKaart=()=>{
    let html='';
    if(o.alvo){
      html+=`<div class="vve-alv-rij"><b>Komende ALV</b><span class="badge status-${esc((o.alvo.status||'').toLowerCase().replace(/[^a-z0-9]+/g,'-'))}">${esc(o.alvo.status)}</span></div>
        <div class="vve-alv-flags">${['klaargezet','uitnodiging','notulen','begroting'].map(f=>
          `<span class="badge" style="background:${o.alvo[f]?'var(--gn-l)':'var(--sur2)'};color:${o.alvo[f]?'var(--gn)':'var(--mut)'}">${o.alvo[f]?'✓':'–'} ${f.charAt(0).toUpperCase()+f.slice(1)}</span>`).join('')}</div>`;
    }
    if(o.alfa.length){
      const l=o.alfa[0]; // nieuwste eerst (gesorteerd in vveOverzicht)
      // 'Laatst AFGEROND' en niet 'laatst gehouden': deze datum is de dag waarop de taak 'notulen
      // versturen' is afgevinkt, en dat is ook wat het kantoor hier wil terugzien. De kolomkop in
      // "ALV's afgerond" zegt hetzelfde ('Datum afgerond'). Meerdere VvE's op dezelfde dag is dus
      // normaal — die worden in één ronde afgewerkt.
      html+=`<div class="vve-alv-rij" style="color:var(--mut)">Laatste ALV afgerond: ${esc(l.datum||'')}</div>`;
    }
    return html||'<span style="color:var(--mut);font-size:12.5px">Geen ALV-gegevens</span>';
  };

  const dosEntries=filterDossierLog(o.logboek,state.vveLogFilter);
  const dosLimiet=state._vveLogAlles?dosEntries.length:30;
  const dosMeer=(!state._vveLogAlles&&dosEntries.length>30)
    ?`<button class="btn btn-sec btn-sm" data-action="vve-log-alles" style="margin:10px auto 2px;display:block">Alle ${dosEntries.length} tonen</button>`:'';

  const kc=(n,lbl,cls)=>`<div class="kc ${cls}"><b>${n}</b><span>${lbl}</span></div>`;
  wrap.innerHTML=`
    <div class="vve-kop">
      <div class="vve-naam">
        <button class="vve-terug" data-action="vve-terug" title="Terug naar ${esc(PAGE_META[terugDoel(state.vveTerug)][0])}" aria-label="Terug naar ${esc(PAGE_META[terugDoel(state.vveTerug)][0])}">${ico('pijlLinks',18)}</button>
        <span class="code" style="--sec:var(--ac);--sec-l:var(--ac-l);font-size:15px;padding:5px 11px">${esc(o.code)}</span>
        <div><h3>${esc(o.naam||'Onbekende VvE')}${o.budget?' <span class="badge budget-tag" title="Budgetpakket — vergadert zelf">Budget</span>':''}</h3>
        <div class="sub">${o.behandelaars.length?'behandelaars: '+persBadges(o.behandelaars.join(', ')):'<span style="color:var(--mut)">geen lopende taken</span>'}</div></div>
      </div>
      <div class="kerncijfers">
        ${kc(o.cijfers.open,o.cijfers.open===1?'open taak':'open taken','teal')}
        ${kc(o.cijfers.laatsteDagen==null?'—':o.cijfers.laatsteDagen+' d','laatste activiteit','grijs')}
        <button class="kc-plus" data-action="vve-taak-nieuw" data-code="${esc(o.code)}" data-naam="${esc(o.naam||'')}" title="Nieuwe taak voor deze VvE" aria-label="Nieuwe taak voor deze VvE"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      </div>
    </div>
    <div class="vve-grid">

      <div class="vve-paneel">
        <div class="vve-sectie">ALV</div>
        ${alvKaart()}
        <div class="vve-sectie" style="margin-top:20px">Beheerderskenmerken
          ${state.kenmerkenEdit?'':`<button class="btn btn-sec btn-sm" data-action="kenmerken-bewerken" style="margin-left:auto">${ico('potlood',12)} Bewerken</button>`}
        </div>
        ${kenmerkenKaart(code)}
      </div>

      <div class="vve-paneel">
        <div class="vve-sectie">Open taken <span class="n">${o.open.length}</span></div>
        ${groepeerBundels(o.open, bIx).map(x=>taakRij(x.r,false,x.diep)).join('')||`<div class="tk-leeg">Geen open taken ${ico('feest',14).replace('<svg ','<svg style="vertical-align:-2.5px" ')}</div>`}
        ${o.weggelegd.length?`<div class="vve-sectie" style="margin-top:20px">Weggelegd <span class="n">${o.weggelegd.length}</span></div>
        ${o.weggelegd.map(r=>taakRij(r,true)).join('')}`:''}
        <div class="vve-sectie" style="margin-top:20px">Laatst afgerond <span class="n">${o.afgerond.length}</span></div>
        ${o.afgerond.slice(0,afLimiet).map(afRij).join('')||'<div class="tk-leeg">Nog niets afgerond</div>'}
        ${meerKnop}
        <div class="vve-voet">${o.cijfers.teLaat} te laat · ${o.cijfers.weggelegd} weggelegd</div>
      </div>

      <div class="vve-paneel tl-paneel">
        <!-- De teller telt wat je ziet (dosEntries), niet het hele logboek. Met het filter
             'Alleen contactmomenten' aan stond hier het totaal van álles, terwijl de knop eronder
             'Alle 3 tonen' zei en er drie regels stonden: drie getallen die elkaar tegenspreken. -->
        <div class="vve-sectie">Geschiedenis <span class="n">${dosEntries.length}</span>
          <span class="dos-filters">
            <button class="dos-filter${state.vveLogFilter!=='contact'?' aan':''}" aria-pressed="${state.vveLogFilter!=='contact'}" data-action="vve-log-filter" data-modus="alles">Alles</button>
            <button class="dos-filter${state.vveLogFilter==='contact'?' aan':''}" aria-pressed="${state.vveLogFilter==='contact'}" data-action="vve-log-filter" data-modus="contact">Alleen contactmomenten</button>
          </span>
        </div>
        ${composerHtml(o.code)}
        <div class="tl-scroll">${dossierFeed(dosEntries.slice(0,dosLimiet))}${dosMeer}</div>
      </div>

    </div>`;
  if(_bewaar){
    const t=document.getElementById('dos-tekst'); if(t) t.value=_bewaar.tekst;
    const w=document.getElementById('dos-wie'); if(w&&_bewaar.wie) w.value=_bewaar.wie;
  }
  if(_leBewaar){
    const t=document.querySelector('#vve-inhoud .log-edit-tekst'); if(t) t.value=_leBewaar.tekst;
    const w=document.querySelector('#vve-inhoud .log-edit-wie'); if(w&&_leBewaar.wie) w.value=_leBewaar.wie;
  }
  if(_kmkBewaar){
    const b=document.getElementById('kmk-bron');     if(b) b.value=_kmkBewaar.bron;
    const ba=document.getElementById('kmk-balkons'); if(ba&&_kmkBewaar.balkons) ba.value=_kmkBewaar.balkons;
    const ko=document.getElementById('kmk-kozijnen');if(ko&&_kmkBewaar.kozijnen) ko.value=_kmkBewaar.kozijnen;
  }
  if(_focusHerstel){
    const el=_focusHerstel.id ? document.getElementById(_focusHerstel.id)
                              : wrap.querySelector('.'+_focusHerstel.klasse);
    if(el){
      try{ el.focus(); }catch(_){}
      // Pas ná focus(): een setSelectionRange vóór de focus wordt door de browser genegeerd.
      if(_focusHerstel.start!=null && el.setSelectionRange)
        try{ el.setSelectionRange(_focusHerstel.start,_focusHerstel.eind); }catch(_){}
    }
  }
  // Slepen aan het handvat van een rij om hem onder een andere te hangen. Dit is de plek waar het
  // hoofdvoorbeeld uit de spec werkt:
  // hier staan alle categorieën van één VvE onder elkaar, dus een offerte-traject kan onder een
  // vergaderverzoek. De listener hangt aan #vve-inhoud zelf — die blijft bestaan, alleen zijn
  // inhoud wordt hierboven vervangen — en initStapelSlepen bedraadt hem maar één keer.
  // Geen weergave-toets zoals de takentabel die heeft: het dossier kent de gestapelde weergave
  // niet (geen chevron, geen paneel), dus er is ook geen platte stand die dit hoort uit te zetten.
  // `.tk-taak` en niet `.tk`: de afgerond-regels dragen alleen `.tk` en géén `data-rid` (zie
  // `afRij` hierboven). Met de bredere selector zouden ze wél als doel oplichten en bij het
  // loslaten niets doen — er is geen taak om aan te koppelen.
  initStapelSlepen(document.getElementById('vve-inhoud'), '.tk-taak',
    el => verseRij(state._rowCache[+el.dataset.rid]));
}

export { vveOverzicht, openVvePagina, renderVve, filterDossierLog, dossierFeed, addContactLog, afOmschrijving, terugDoel, terugVanDossier, groepeerBundels };
